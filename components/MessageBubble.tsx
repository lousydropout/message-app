import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
import { Message } from "@/types/Message";
import { User } from "@/types/User";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface MessageBubbleProps {
  message: Message;
  sender?: User;
  showDisplayName?: boolean;
  onLongPress?: (message: Message) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MAX_BUBBLE_WIDTH = SCREEN_WIDTH * 0.85; // exact pixel width, avoids rounding bug

export function MessageBubble({
  message,
  sender,
  showDisplayName = true,
  onLongPress,
}: MessageBubbleProps) {
  const { user } = useAuthStore();
  const [senderProfile, setSenderProfile] = useState<User | null>(
    sender || null
  );
  const isOwnMessage = user?.uid === message.senderId;

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

  const getReadReceiptStatus = () => {
    if (!isOwnMessage) return null;
    const readBy = message.readBy || {};
    const readCount = Object.keys(readBy).length;
    return readCount <= 1 ? "sent" : "read";
  };

  return (
    <Pressable
      style={[
        styles.container,
        isOwnMessage ? styles.ownMessage : styles.otherMessage,
      ]}
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
        {!isOwnMessage && senderProfile && showDisplayName && (
          <Text style={styles.senderName}>{senderProfile.displayName}</Text>
        )}

        <View
          style={[
            styles.bubble,
            isOwnMessage ? styles.ownBubble : styles.otherBubble,
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
          <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>

          {isOwnMessage && (
            <View style={styles.readReceipt}>
              {getReadReceiptStatus() === "sent" && (
                <Text style={styles.checkmark}>✓</Text>
              )}
              {getReadReceiptStatus() === "read" && (
                <Text style={[styles.checkmark, styles.readCheckmark]}>✓✓</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
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
  readReceipt: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkmark: {
    fontSize: 12,
    color: "#666",
  },
  readCheckmark: {
    color: "#007AFF",
  },
});
