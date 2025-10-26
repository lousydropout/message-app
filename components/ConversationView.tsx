/**
 * @fileoverview ConversationView Component - The user interface for a single conversation.
 *
 * This component is the heart of the chat experience, responsible for rendering
 * the message list, handling user input, and displaying real-time updates such
 * as new messages and typing indicators. It is highly optimized for performance,
 * using `@shopify/flash-list` for the message list and employing a "SQLite-first"
 * loading strategy to display messages instantly.
 *
 * Key Features:
 * - **Message Display**: Renders a list of messages using the `MessageBubble`
 *   component, with support for displaying sender names in group chats.
 * - **User Input**: Provides a text input field for composing messages and a
 *   send button, with debounced typing indicators.
 * - **Real-time Updates**: Subscribes to the `messagesStore` to receive and
 *   display new messages and typing statuses as they happen.
 * - **Lifecycle Management**: Manages the loading and unloading of conversation
 *   data, including subscribing to and unsubscribing from real-time updates,
 *   to ensure efficient resource usage.
 * - **User Experience**: Includes features like automatic scrolling to new
 *   messages, a "new messages" indicator, and the ability to retry sending
 *   failed messages.
 *
 * @see messagesStore for the state and actions that power this component.
 * @see ConversationScreen where this component is used.
 * @see MessageBubble for the component that renders individual messages.
 */

/**
 * @fileoverview ConversationView Component - Main conversation interface
 *
 * This component provides:
 * - Message list display with FlashList for performance
 * - Message input and sending
 * - Typing indicators
 * - Participant profiles management
 * - Mark as read functionality
 * - Retry failed messages
 * - Auto-scroll to bottom
 * - Participants modal
 *
 * Features:
 * - Efficient rendering with FlashList
 * - Real-time message updates
 * - Optimistic message sending
 * - Typing indicator with debouncing
 * - Auto-scroll on new messages
 */

import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
import { logger } from "@/stores/loggerStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { Conversation } from "@/types/Conversation";
import { Message } from "@/types/Message";
import { User } from "@/types/User";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Props for ConversationView component
 */
interface ConversationViewProps {
  /** ID of the conversation to display */
  conversationId: string;
  /** Optional conversation data */
  conversation?: Conversation;
}

export function ConversationView({
  conversationId,
  conversation,
}: ConversationViewProps) {
  logger.info(
    "ConversationView",
    `🎬 ConversationView component mounted for ${conversationId}`
  );
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [participantProfiles, setParticipantProfiles] = useState<
    Record<string, User>
  >({});
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<any>(null);

  const { user } = useAuthStore();
  const {
    messages,
    typingUsers,
    loading,
    sendingMessage,
    sendMessage,
    retryMessage,
    markAsRead,
    updateTyping,
    loadConversationMessages,
    unloadConversationMessages,
    loadOlderMessages,
    paginationState,
  } = useMessagesStore();

  const conversationMessages = messages[conversationId] || [];
  const conversationTypingUsers = typingUsers[conversationId] || [];
  const conversationPaginationState = paginationState[conversationId];

  // Load participant profiles for the conversation
  useEffect(() => {
    const loadParticipantProfiles = async () => {
      if (!conversation || !user) return;

      const allParticipantIds = new Set<string>();
      conversation.participants.forEach((participantId) => {
        allParticipantIds.add(participantId);
      });

      const profiles: Record<string, User> = {};

      for (const participantId of allParticipantIds) {
        try {
          const profile = await userService.getUserProfile(participantId);
          if (profile) {
            profiles[participantId] = profile;
          }
        } catch (error) {
          logger.error(
            "ConversationView",
            `Error loading profile for ${participantId}:`,
            error
          );
        }
      }

      setParticipantProfiles(profiles);
    };

    loadParticipantProfiles();
  }, [conversation, user]);

  // Track when messages become available
  useEffect(() => {
    if (conversationMessages.length > 0) {
      const messagesAvailableTime = Date.now();
      logger.info(
        "ConversationView",
        `📨 Messages available: ${conversationMessages.length} messages at ${messagesAvailableTime}`
      );
    }
  }, [conversationMessages.length]);

  useEffect(() => {
    logger.info(
      "ConversationView",
      `🚀 Starting conversation view load for ${conversationId}`
    );

    // Load cached messages and subscribe to updates
    const loadStartTime = Date.now();
    loadConversationMessages(conversationId).then(() => {
      const loadEndTime = Date.now();
      logger.info(
        "ConversationView",
        `📱 loadConversationMessages completed in ${
          loadEndTime - loadStartTime
        }ms`
      );

      // Mark messages as read when entering conversation
      if (user) {
        markAsRead(conversationId, user.uid).catch((error) => {
          logger.error(
            "ConversationView",
            "Error marking conversation as read on entry:",
            error
          );
        });
      }
    });

    return () => {
      // Stop typing when component unmounts
      if (isTyping && user) {
        updateTyping(conversationId, false);
      }

      // Unload conversation messages and clean up subscriptions
      unloadConversationMessages(conversationId);
    };
  }, [conversationId, user]);

  // Separate effect: Handle scroll positioning and mark as read
  useEffect(() => {
    if (user && conversationMessages.length > 0 && flatListRef.current) {
      // Find first unread message
      const firstUnreadIndex = conversationMessages.findIndex(
        (message) => !message.readBy[user.uid]
      );

      if (firstUnreadIndex === -1) {
        // No unread messages - scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        // Has unread messages - scroll to show the unread indicator
        const totalMessages = conversationMessages.length;
        const unreadCount = totalMessages - firstUnreadIndex;

        // If there are many unread messages, scroll to show separator at top
        // If few unread messages, scroll to bottom to show all with separator visible
        if (unreadCount > 10) {
          // Many unread messages - scroll to show separator near top
          // Since array is reversed, we need to convert to display index
          const displayIndex =
            conversationMessages.length - 1 - firstUnreadIndex;
          setTimeout(() => {
            try {
              flatListRef.current?.scrollToIndex({
                index: Math.max(0, displayIndex - 2),
                animated: true,
                viewPosition: 0.1, // Show separator near top
              });
            } catch (error) {
              // Fallback to scrolling to end if index fails
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }, 100);
        } else {
          // Few unread messages - scroll to bottom to show all
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      }

      // Messages are marked as read on entry, and new messages auto-marked as they arrive
    }
  }, [conversationMessages.length, conversationId, user]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || sendingMessage) return;

    const text = messageText.trim();
    setMessageText("");

    // Scroll immediately - optimistic rendering will show the message
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 50);

    try {
      await sendMessage(conversationId, text);

      // Stop typing indicator
      if (isTyping && user) {
        setIsTyping(false);
        await updateTyping(conversationId, false);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      Alert.alert("Error", "Failed to send message. Please try again.");
      setMessageText(text); // Restore message text
    }
  };

  const handleTextChange = async (text: string) => {
    setMessageText(text);

    if (!user) return;

    // Start typing indicator
    if (!isTyping && text.trim()) {
      setIsTyping(true);
      await updateTyping(conversationId, true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(async () => {
      if (isTyping) {
        setIsTyping(false);
        await updateTyping(conversationId, false);
      }
    }, 2000);
  };

  const handleRetryMessage = async (message: Message) => {
    try {
      await retryMessage(conversationId, message.id);
    } catch (error) {
      console.error("Error retrying message:", error);
      Alert.alert("Error", "Failed to retry message. Please try again.");
    }
  };

  const handleMessageLongPress = (message: Message) => {
    // Don't show long press options for failed messages - they use tap to retry
    if (message.status === "failed") return;

    Alert.alert("Message Options", message.text, [
      {
        text: "Copy",
        onPress: () => {
          // TODO: Implement copy to clipboard
          console.log("Copy message:", message.text);
        },
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  const renderUnreadIndicator = () => {
    if (!user) return null;

    return (
      <View style={styles.unreadIndicatorContainer}>
        <View style={styles.unreadBadge}>
          <View style={styles.unreadDot} />
          <Text style={styles.unreadText}>New messages</Text>
        </View>
      </View>
    );
  };

  // Calculate which message should show the unread indicator (memoized to prevent re-renders)
  const firstUnreadOriginalIndex = React.useMemo(() => {
    if (!user) return -1;

    // Find the first unread message in the original array (oldest unread)
    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const message = conversationMessages[i];
      if (!message.readBy[user.uid]) {
        return i;
      }
    }
    return -1;
  }, [conversationMessages, user]);

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    // Since the array is reversed for display, we need to find the previous message in the original array
    const originalIndex = conversationMessages.length - 1 - index;
    const previousOriginalIndex = originalIndex + 1;
    const previousMessage =
      previousOriginalIndex < conversationMessages.length
        ? conversationMessages[previousOriginalIndex]
        : null;

    const showDisplayName =
      conversation?.type === "group" ||
      !previousMessage ||
      previousMessage.senderId !== item.senderId;

    // Check if this message should show the unread indicator
    const isFirstUnread = firstUnreadOriginalIndex === originalIndex;

    return (
      <>
        {isFirstUnread && renderUnreadIndicator()}
        <MessageBubble
          message={item}
          showDisplayName={showDisplayName}
          onLongPress={handleMessageLongPress}
          onRetry={handleRetryMessage}
        />
      </>
    );
  };

  const renderTypingIndicator = () => {
    if (conversationTypingUsers.length === 0) return null;

    return (
      <TypingIndicator
        typingUsers={conversationTypingUsers}
        currentUserId={user?.uid || ""}
      />
    );
  };

  const renderLoadingOlder = () => {
    if (!conversationPaginationState?.isLoadingOlder) return null;

    return (
      <View style={styles.loadingOlderContainer}>
        <Text style={styles.loadingOlderText}>Loading older messages...</Text>
      </View>
    );
  };

  const getConversationTitle = () => {
    if (!conversation) return "Conversation";

    if (conversation.type === "group") {
      return conversation.name || "Group";
    } else {
      // For direct conversations, show the other participant's name
      const otherParticipant = conversation.participants.find(
        (p) => p !== user?.uid
      );
      if (otherParticipant && participantProfiles[otherParticipant]) {
        return participantProfiles[otherParticipant].displayName;
      }
      return "Direct Message";
    }
  };

  const getConversationSubtitle = () => {
    if (!conversation) return "";

    if (conversation.type === "group") {
      return `${conversation.participants.length} participants`;
    } else {
      // Show typing indicator for direct conversations
      if (conversationTypingUsers.length > 0) {
        return "typing...";
      }
      return ""; // No subtitle when not typing
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading conversation...</Text>
      </View>
    );
  }

  // Add timing around the main render
  const renderStartTime = Date.now();
  logger.info(
    "ConversationView",
    `🎨 Starting message list render with ${conversationMessages.length} messages`
  );

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerContent}
            onPress={() => setShowParticipantsModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.headerTitle}>{getConversationTitle()}</Text>
            <Text style={styles.headerSubtitle}>
              {getConversationSubtitle()}
            </Text>
          </TouchableOpacity>
        </View>

        <FlashList
          ref={flatListRef}
          data={[...conversationMessages].reverse()} // Reverse array to show newest at bottom
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          removeClippedSubviews={false}
          ListHeaderComponent={renderTypingIndicator}
          ListFooterComponent={renderLoadingOlder}
          contentContainerStyle={styles.messagesContent}
          onEndReached={() => {
            // onEndReached is called when reaching the end of the list
            // Since we reverse the data, this is actually the "top" (oldest messages)
            if (
              conversationPaginationState?.hasMoreMessages &&
              !conversationPaginationState.isLoadingOlder
            ) {
              loadOlderMessages(conversationId);
            }
          }}
          onEndReachedThreshold={0.1} // Trigger when 10% from the end
          onContentSizeChange={() => {
            const renderEndTime = Date.now();
            logger.info(
              "ConversationView",
              `🎨 Message list render completed in ${
                renderEndTime - renderStartTime
              }ms`
            );
          }}
          onLayout={() => {
            const layoutEndTime = Date.now();
            logger.info(
              "ConversationView",
              `📐 Message list layout completed in ${
                layoutEndTime - renderStartTime
              }ms`
            );
          }}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={messageText}
            onChangeText={handleTextChange}
            placeholder="Type a message..."
            multiline
            maxLength={1000}
            returnKeyType="default"
            onSubmitEditing={undefined}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() || sendingMessage) &&
                styles.sendButtonDisabled,
            ]}
            onPress={handleSendMessage}
            disabled={!messageText.trim() || sendingMessage}
          >
            <Ionicons
              name="send"
              size={20}
              color={messageText.trim() && !sendingMessage ? "#007AFF" : "#999"}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Participants Modal */}
      <Modal
        visible={showParticipantsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowParticipantsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {conversation?.type === "group"
                  ? "Group Members"
                  : "Participants"}
              </Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowParticipantsModal(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.participantsList}>
              {conversation?.participants.map((participantId) => {
                const participant = participantProfiles[participantId];
                const isCurrentUser = participantId === user?.uid;

                return (
                  <View key={participantId} style={styles.participantItem}>
                    <View style={styles.participantAvatar}>
                      <Text style={styles.participantInitials}>
                        {participant?.displayName
                          ? participant.displayName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)
                          : "?"}
                      </Text>
                    </View>
                    <View style={styles.participantInfo}>
                      <Text style={styles.participantName}>
                        {participant?.displayName || "Unknown User"}
                      </Text>
                      <Text style={styles.participantEmail}>
                        {participant?.email || ""}
                      </Text>
                      {participant && (
                        <Text
                          style={[
                            styles.participantStatus,
                            {
                              color:
                                userService.getOnlineStatusInfo(participant)
                                  .color,
                            },
                          ]}
                        >
                          {userService.getOnlineStatusText(participant)}
                        </Text>
                      )}
                    </View>
                    {isCurrentUser && (
                      <View style={styles.currentUserBadge}>
                        <Text style={styles.currentUserText}>You</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  headerContent: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 20 : 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
    minHeight: Platform.OS === "android" ? 70 : 60,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "android" ? 12 : 8,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 16,
    textAlignVertical: Platform.OS === "android" ? "center" : "top",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#F2F2F7",
  },
  unreadIndicatorContainer: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  unreadBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F4FD",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#007AFF",
    marginRight: 6,
  },
  unreadText: {
    fontSize: 12,
    color: "#007AFF",
    fontWeight: "500",
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
    minWidth: "80%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  modalCloseButton: {
    padding: 4,
  },
  participantsList: {
    paddingVertical: 8,
  },
  participantItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F2F2F7",
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  participantInitials: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#000",
    marginBottom: 2,
  },
  participantEmail: {
    fontSize: 14,
    color: "#666",
  },
  participantStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  currentUserBadge: {
    backgroundColor: "#E8F4FD",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentUserText: {
    fontSize: 12,
    color: "#007AFF",
    fontWeight: "500",
  },
  loadingOlderContainer: {
    padding: 16,
    alignItems: "center",
    backgroundColor: "#F2F2F7",
  },
  loadingOlderText: {
    color: "#666",
    fontSize: 14,
  },
});
