import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
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
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ConversationViewProps {
  conversationId: string;
  conversation?: Conversation;
}

export function ConversationView({
  conversationId,
  conversation,
}: ConversationViewProps) {
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [otherParticipant, setOtherParticipant] = useState<User | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<any>(null);

  const { user } = useAuthStore();
  const {
    messages,
    typingUsers,
    loading,
    sendingMessage,
    sendMessage,
    markAsRead,
    updateTyping,
    subscribeToMessages,
  } = useMessagesStore();

  const conversationMessages = messages[conversationId] || [];
  const conversationTypingUsers = typingUsers[conversationId] || [];

  useEffect(() => {
    // Subscribe to messages and typing status
    subscribeToMessages(conversationId);

    // Mark conversation as read when opened
    if (user) {
      markAsRead(conversationId, user.uid);
    }

    // Fetch other participant's profile for direct conversations
    if (conversation && conversation.type === "direct" && user) {
      const otherUserId = conversation.participants.find((p) => p !== user.uid);
      if (otherUserId) {
        userService
          .getUserProfile(otherUserId)
          .then(setOtherParticipant)
          .catch(console.error);
      }
    }

    return () => {
      // Stop typing when component unmounts
      if (isTyping && user) {
        updateTyping(conversationId, false);
      }
    };
  }, [conversationId, user, conversation]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || sendingMessage) return;

    const text = messageText.trim();
    setMessageText("");

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

  const handleMessageLongPress = (message: Message) => {
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

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const previousMessage = index > 0 ? conversationMessages[index - 1] : null;
    const showDisplayName =
      !previousMessage || previousMessage.senderId !== item.senderId;

    return (
      <MessageBubble
        message={item}
        showDisplayName={showDisplayName}
        onLongPress={handleMessageLongPress}
      />
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

  const getConversationTitle = () => {
    if (!conversation) return "Conversation";

    if (conversation.type === "group") {
      return conversation.name || "Group";
    } else {
      // For direct conversations, show the other participant's display name
      return (
        otherParticipant?.displayName ||
        otherParticipant?.email ||
        "Direct Message"
      );
    }
  };

  const getConversationSubtitle = () => {
    if (!conversation) return "";

    if (conversation.type === "group") {
      return `${conversation.participants.length} participants`;
    } else {
      // For direct conversations, show the other participant's email
      return otherParticipant?.email || "";
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading conversation...</Text>
      </View>
    );
  }

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
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{getConversationTitle()}</Text>
            <Text style={styles.headerSubtitle}>
              {getConversationSubtitle()}
            </Text>
          </View>
        </View>

        <FlashList
          ref={flatListRef}
          data={[...conversationMessages].reverse()} // Reverse array to show newest at bottom
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          removeClippedSubviews={false}
          ListHeaderComponent={renderTypingIndicator}
          contentContainerStyle={styles.messagesContent}
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
});
