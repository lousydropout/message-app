/**
 * @fileoverview MessageBubble Component - Renders an individual chat message.
 *
 * This component is responsible for displaying a single message within a
 * conversation. It handles the visual differentiation between messages sent by
 * the current user and those sent by others. It also displays metadata such as
 * the sender's name (in group chats), the message timestamp, and the delivery
 * status (e.g., "Sending...", "Read", "Failed").
 *
 * A key feature of this component is its integration with the AI translation
 * service. Users can tap on a message received from another user to open a
 * modal that provides a translation into their preferred language, along with
 * any relevant cultural notes. This is facilitated by a call to a secure,
 * serverless function that interfaces with the OpenAI API.
 *
 * @see ConversationView for the parent component that renders a list of these bubbles.
 * @see useMessagesStore for the state that provides the message data.
 * @see messageService for the logic related to message status and retries.
 */

import translationService from "@/services/translationService";
import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
import { Message } from "@/types/Message";
import { SUPPORTED_LANGUAGES, User } from "@/types/User";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * Props for MessageBubble component
 */
interface MessageBubbleProps {
  /** Message to display */
  message: Message;
  /** Optional sender user profile */
  sender?: User;
  /** Whether to show sender display name */
  showDisplayName?: boolean;
  /** Whether this is a group chat */
  isGroupChat?: boolean;
  /** Callback for long-press action */
  onLongPress?: (message: Message) => void;
  /** Callback for retry action (failed messages) */
  onRetry?: (message: Message) => void;
  /** Conversation history for translation context */
  conversationHistory?: Message[];
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
/** Maximum bubble width to prevent overflow (85% of screen width) */
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.85;

export function MessageBubble({
  message,
  sender,
  showDisplayName = true,
  isGroupChat = false,
  onLongPress,
  onRetry,
  conversationHistory = [],
}: MessageBubbleProps) {
  const { user, userProfile } = useAuthStore();
  const [senderProfile, setSenderProfile] = useState<User | null>(
    sender || null
  );
  const isOwnMessage = user?.uid === message.senderId;

  // Translation modal state
  const [translationModalVisible, setTranslationModalVisible] = useState(false);
  const [translationData, setTranslationData] = useState<{
    detectedLanguage: string;
    translatedText: string;
    culturalNotes?: string;
    referencesEarlier?: boolean;
    referenceDetail?: string;
    confidence?: number;
  } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationStatus, setTranslationStatus] = useState<{
    phase: "idle" | "translating" | "searching" | "resubmitting" | "complete";
    message: string;
    searchTerms?: string[];
    reason?: string;
    progress?: { current: number; total: number };
  }>({
    phase: "idle",
    message: "",
  });

  useEffect(() => {
    if (!senderProfile && !isOwnMessage) {
      userService
        .getUserProfile(message.senderId)
        .then(setSenderProfile)
        .catch(console.error);
    }
  }, [message.senderId, senderProfile, isOwnMessage]);

  const handleLongPress = () => {
    if (onLongPress) {
      onLongPress(message);
    } else {
      Alert.alert("Message Options", message.text, [
        {
          text: "Copy",
          onPress: () => console.log("Copy message:", message.text),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    return diffInHours < 24
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  };

  const getMessageStatus = () => {
    if (!isOwnMessage) return null;

    // Handle special statuses that don't depend on readBy
    const status = message.status;
    if (status === "sending") return "Sending...";
    if (status === "queued") return "⏳ Queued";
    if (status === "failed") return "Failed - Tap to retry";

    // Determine status based on readBy data
    const readBy = message.readBy || {};
    const senderId = message.senderId;

    // Check if anyone other than the sender has read the message
    const otherReaders = Object.keys(readBy).filter(
      (userId) => userId !== senderId
    );

    // If no one else has read it, it's "Sent"
    if (otherReaders.length === 0) return "Sent";

    // If others have read it, it's "Read"
    return "Read";
  };

  const handleRetry = () => {
    if (onRetry && message.status === "failed") {
      onRetry(message);
    }
  };

  const translateMessage = async () => {
    if (
      !userProfile?.languagePreferences ||
      userProfile.languagePreferences.length === 0
    ) {
      Alert.alert("Error", "No preferred languages set in your profile");
      return;
    }

    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      Alert.alert("Error", "API URL not configured");
      return;
    }

    setTranslating(true);
    setTranslationModalVisible(true);

    try {
      // Get target language (first preferred language)
      const targetLanguageCode = userProfile.languagePreferences[0];
      const targetLanguage =
        SUPPORTED_LANGUAGES.find((lang) => lang.code === targetLanguageCode)
          ?.name || "English";

      // Use enhanced translation service with LangGraph
      const translation = await translationService.translateMessageWithGraph(
        message,
        targetLanguage,
        conversationHistory,
        (status) => {
          setTranslationStatus(status);
        },
        isGroupChat
      );

      setTranslationData({
        detectedLanguage: translation.originalLanguage,
        translatedText: translation.translatedText,
        culturalNotes: translation.culturalNotes,
        referencesEarlier: translation.referencesEarlier,
        referenceDetail: translation.referenceDetail,
        confidence: translation.confidence,
      });
    } catch (error: any) {
      console.error("Translation error:", error);
      Alert.alert(
        "Translation Error",
        error.message || "Failed to translate message"
      );
      setTranslationModalVisible(false);
    } finally {
      setTranslating(false);
    }
  };

  const handleMessagePress = () => {
    // Only allow translation for other users' messages
    if (!isOwnMessage) {
      translateMessage();
    }
  };

  return (
    <>
      <Pressable
        style={[
          styles.container,
          isOwnMessage ? styles.ownMessage : styles.otherMessage,
        ]}
        onPress={handleMessagePress}
        onLongPress={handleLongPress}
      >
        <View
          style={[
            styles.messageContainer,
            isOwnMessage
              ? styles.ownMessageContainer
              : styles.otherMessageContainer,
          ]}
        >
          {showDisplayName && (
            <Text style={styles.senderName}>
              {isOwnMessage
                ? "You "
                : senderProfile?.displayName + " " || "Someone "}
            </Text>
          )}

          <View
            style={[
              styles.bubble,
              isOwnMessage ? styles.ownBubble : styles.otherBubble,
              message.status === "failed" && styles.failedBubble,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
              ]}
              numberOfLines={0}
              ellipsizeMode="clip"
            >
              {message.text + " "}
            </Text>
          </View>

          <View style={styles.messageFooter}>
            <Text style={styles.timestamp}>
              {/* NOTE: Adding a space here prevents the last character(s) from
            being cut off on Android */}
              {formatTime(message.timestamp) + " "}
            </Text>

            {isOwnMessage && (
              <View style={styles.statusContainer}>
                <Text
                  style={[
                    styles.statusText,
                    message.status === "read" && styles.readStatusText,
                    message.status === "queued" && styles.queuedStatusText, // NEW
                    message.status === "failed" && styles.failedStatusText,
                  ]}
                  onPress={
                    message.status === "failed" ? handleRetry : undefined
                  }
                >
                  {getMessageStatus()}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>

      {/* Translation Modal */}
      <Modal
        visible={translationModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTranslationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Translation</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setTranslationModalVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {translating ? (
                <View style={styles.translationStatusContainer}>
                  {/* Progress indicator */}
                  {translationStatus.progress && (
                    <View style={styles.progressContainer}>
                      <Text style={styles.progressText}>
                        Step {translationStatus.progress.current} of{" "}
                        {translationStatus.progress.total}
                      </Text>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${
                                (translationStatus.progress.current /
                                  translationStatus.progress.total) *
                                100
                              }%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  )}

                  {/* Phase indicator */}
                  <Text style={styles.statusPhase}>
                    {translationStatus.phase === "translating" &&
                      "🔄 Translating..."}
                    {translationStatus.phase === "searching" &&
                      "🔍 Searching for context..."}
                    {translationStatus.phase === "resubmitting" &&
                      "🔄 Translating with context..."}
                    {translationStatus.phase === "complete" && "✅ Complete!"}
                  </Text>

                  {/* Status message */}
                  <Text style={styles.statusMessage}>
                    {translationStatus.message}
                  </Text>

                  {/* Search terms (when searching) */}
                  {translationStatus.searchTerms &&
                    translationStatus.searchTerms.length > 0 && (
                      <View style={styles.searchTermsContainer}>
                        <Text style={styles.searchTermsLabel}>
                          Looking for context about:
                        </Text>
                        <View style={styles.searchTermsList}>
                          {translationStatus.searchTerms.map((term, index) => (
                            <Text key={index} style={styles.searchTerm}>
                              {term}
                            </Text>
                          ))}
                        </View>
                      </View>
                    )}

                  {/* Reason for needing context */}
                  {translationStatus.reason && (
                    <Text style={styles.reasonText}>
                      {translationStatus.reason}
                    </Text>
                  )}
                </View>
              ) : translationData ? (
                <View>
                  <View style={styles.translationSection}>
                    <Text style={styles.sectionLabel}>Detected Language:</Text>
                    <Text style={styles.sectionValue}>
                      {translationData.detectedLanguage}
                    </Text>
                  </View>

                  <View style={styles.translationSection}>
                    <Text style={styles.sectionLabel}>Original Text:</Text>
                    <Text style={styles.originalText}>{message.text}</Text>
                  </View>

                  <View style={styles.translationSection}>
                    <Text style={styles.sectionLabel}>Translated Text:</Text>
                    <Text style={styles.translatedText}>
                      {translationData.translatedText}
                    </Text>
                  </View>

                  {translationData.culturalNotes && (
                    <View style={styles.translationSection}>
                      <Text style={styles.sectionLabel}>Cultural Notes:</Text>
                      <Text style={styles.culturalNotes}>
                        {translationData.culturalNotes}
                      </Text>
                    </View>
                  )}

                  {translationData.confidence !== undefined && (
                    <View style={styles.translationSection}>
                      <Text style={styles.sectionLabel}>Confidence:</Text>
                      <View style={styles.confidenceContainer}>
                        <Text style={styles.confidenceText}>
                          {translationData.confidence}%
                        </Text>
                        <View style={styles.confidenceBar}>
                          <View
                            style={[
                              styles.confidenceFill,
                              { width: `${translationData.confidence}%` },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  )}

                  {translationData.referencesEarlier &&
                    translationData.referenceDetail && (
                      <View style={styles.translationSection}>
                        <Text style={styles.sectionLabel}>
                          References Earlier Messages:
                        </Text>
                        <Text style={styles.referenceDetail}>
                          {translationData.referenceDetail}
                        </Text>
                      </View>
                    )}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginVertical: 2,
    paddingHorizontal: 16,
  },
  ownMessage: {
    justifyContent: "flex-end",
  },
  otherMessage: {
    justifyContent: "flex-start",
  },
  avatarContainer: {
    marginRight: 8,
    marginTop: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  messageContainer: {
    maxWidth: MAX_BUBBLE_WIDTH,
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
  },
  ownMessageContainer: {
    alignItems: "flex-end",
  },
  otherMessageContainer: {
    alignItems: "flex-start",
  },
  senderName: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
    marginLeft: 8,
  },
  bubble: {
    paddingHorizontal: 14, // extra 2px to avoid last char cutoff
    paddingVertical: 8,
    borderRadius: 18,
    marginBottom: 4,
    maxWidth: MAX_BUBBLE_WIDTH,
    alignSelf: "flex-start",
    overflow: "visible",
  },
  ownBubble: {
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: "#E5E5EA",
    borderBottomLeftRadius: 4,
  },
  failedBubble: {
    backgroundColor: "#FFE5E5",
    borderColor: "#FF6B6B",
    borderWidth: 1,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: "center",
    flexShrink: 0, // prevent horizontal compression
    flexGrow: 0,
    paddingBottom: 2,
  },
  ownMessageText: {
    color: "white",
  },
  otherMessageText: {
    color: "#000",
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 2,
  },
  timestamp: {
    fontSize: 11,
    color: "#666",
    marginRight: 4,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    fontSize: 11,
    color: "#666",
    fontWeight: "500",
  },
  readStatusText: {
    color: "#007AFF",
  },
  failedStatusText: {
    color: "#FF6B6B",
  },
  queuedStatusText: {
    color: "#FFA500",
    fontStyle: "italic",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    margin: 20,
    maxHeight: "80%",
    width: "90%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#212529",
  },
  modalCloseButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f8f9fa",
  },
  modalCloseButtonText: {
    fontSize: 16,
    color: "#6c757d",
    fontWeight: "bold",
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
  translationSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#495057",
    marginBottom: 4,
  },
  sectionValue: {
    fontSize: 16,
    color: "#212529",
    fontWeight: "500",
  },
  translatedText: {
    fontSize: 16,
    color: "#212529",
    lineHeight: 22,
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  culturalNotes: {
    fontSize: 14,
    color: "#6c757d",
    fontStyle: "italic",
    lineHeight: 20,
    backgroundColor: "#fff3cd",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#ffc107",
  },
  confidenceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  confidenceText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#212529",
    minWidth: 50,
  },
  confidenceBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#e9ecef",
    borderRadius: 4,
    overflow: "hidden",
  },
  confidenceFill: {
    height: "100%",
    backgroundColor: "#28a745",
    borderRadius: 4,
  },
  referenceDetail: {
    fontSize: 14,
    color: "#495057",
    lineHeight: 20,
    backgroundColor: "#e7f3ff",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  originalText: {
    fontSize: 16,
    color: "#212529",
    lineHeight: 22,
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#6c757d",
  },
  // Status update styles
  translationStatusContainer: {
    padding: 20,
    alignItems: "center",
  },
  progressContainer: {
    width: "100%",
    marginBottom: 16,
  },
  progressText: {
    fontSize: 12,
    color: "#6c757d",
    marginBottom: 8,
    textAlign: "center",
  },
  progressBar: {
    width: "100%",
    height: 6,
    backgroundColor: "#e9ecef",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#007AFF",
    borderRadius: 3,
  },
  statusPhase: {
    fontSize: 18,
    fontWeight: "600",
    color: "#007AFF",
    marginBottom: 8,
    textAlign: "center",
  },
  statusMessage: {
    fontSize: 16,
    color: "#495057",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 12,
  },
  searchTermsContainer: {
    width: "100%",
    marginTop: 12,
    marginBottom: 12,
  },
  searchTermsLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6c757d",
    marginBottom: 8,
    textAlign: "center",
  },
  searchTermsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  searchTerm: {
    fontSize: 14,
    color: "#007AFF",
    backgroundColor: "#e7f3ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  reasonText: {
    fontSize: 14,
    color: "#6c757d",
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 16,
  },
});
