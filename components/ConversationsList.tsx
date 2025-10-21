import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { Conversation } from "@/types/Conversation";
import { User } from "@/types/User";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export function ConversationsList() {
  const [refreshing, setRefreshing] = useState(false);
  const [participantProfiles, setParticipantProfiles] = useState<
    Record<string, User>
  >({});

  const { user, userProfile } = useAuthStore();
  const {
    conversations,
    loading,
    loadConversations,
    subscribeToConversations,
    createOrOpenDirectConversation,
    messages,
  } = useMessagesStore();

  useEffect(() => {
    if (user) {
      // Load conversations and subscribe to updates
      loadConversations(user.uid);
      subscribeToConversations(user.uid);
    }
  }, [user]);

  useEffect(() => {
    // Load participant profiles for all conversations
    const loadParticipantProfiles = async () => {
      const allParticipantIds = new Set<string>();

      conversations.forEach((conversation) => {
        conversation.participants.forEach((participantId) => {
          if (participantId !== user?.uid) {
            allParticipantIds.add(participantId);
          }
        });
      });

      const profiles: Record<string, User> = {};

      for (const participantId of allParticipantIds) {
        try {
          const profile = await userService.getUserProfile(participantId);
          if (profile) {
            profiles[participantId] = profile;
          }
        } catch (error) {
          console.error(`Error loading profile for ${participantId}:`, error);
        }
      }

      setParticipantProfiles(profiles);
    };

    if (conversations.length > 0) {
      loadParticipantProfiles();
    }
  }, [conversations, user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (user) {
        await loadConversations(user.uid);
      }
    } catch (error) {
      console.error("Error refreshing conversations:", error);
      Alert.alert("Error", "Failed to refresh conversations");
    } finally {
      setRefreshing(false);
    }
  };

  const handleConversationPress = useCallback((conversation: Conversation) => {
    router.push(`/conversation/${conversation.id}`);
  }, []);

  const handleNewConversation = useCallback(() => {
    router.push("/contacts");
  }, []);

  const formatTime = useCallback((timestamp: any) => {
    if (!timestamp) return "";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60)
      );
      return diffInMinutes < 1 ? "now" : `${diffInMinutes}m`;
    } else if (diffInHours < 24) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  }, []);

  const getConversationTitle = useCallback(
    (conversation: Conversation) => {
      if (conversation.type === "group") {
        return conversation.name || "Group Chat";
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
    },
    [user, participantProfiles]
  );

  const getConversationSubtitle = useCallback(
    (conversation: Conversation) => {
      if (conversation.lastMessage) {
        const senderName =
          conversation.lastMessage.senderId === user?.uid
            ? "You"
            : participantProfiles[conversation.lastMessage.senderId]
                ?.displayName || "Someone";

        return `${senderName}: ${conversation.lastMessage.text}`;
      }

      if (conversation.type === "group") {
        return `${conversation.participants.length} participants`;
      } else {
        return "No messages yet";
      }
    },
    [user, participantProfiles]
  );

  const getInitials = useCallback((name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }, []);

  // Memoize unread counts calculation to avoid expensive operations on every render
  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    if (!user) return counts;

    conversations.forEach((conversation) => {
      if (!conversation.lastMessage) {
        counts[conversation.id] = 0;
        return;
      }

      const conversationMessages = messages[conversation.id] || [];
      const unreadMessages = conversationMessages.filter((message) => {
        // Count messages that are not from current user and not read by current user
        return message.senderId !== user.uid && !message.readBy[user.uid];
      });

      counts[conversation.id] = unreadMessages.length;
    });

    return counts;
  }, [conversations, messages, user]);

  const getUnreadCount = useCallback(
    (conversation: Conversation): number => {
      return unreadCounts[conversation.id] || 0;
    },
    [unreadCounts]
  );

  const renderConversation = useCallback(
    ({ item }: { item: Conversation }) => {
      const unreadCount = getUnreadCount(item);
      const hasUnreadMessages = unreadCount > 0;

      return (
        <TouchableOpacity
          style={[
            styles.conversationItem,
            hasUnreadMessages && styles.conversationItemUnread,
          ]}
          onPress={() => handleConversationPress(item)}
        >
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.type === "group"
                  ? "G"
                  : getInitials(getConversationTitle(item))}
              </Text>
            </View>
          </View>

          <View style={styles.conversationContent}>
            <View style={styles.conversationHeader}>
              <View style={styles.titleContainer}>
                <Text
                  style={[
                    styles.conversationTitle,
                    hasUnreadMessages && styles.conversationTitleUnread,
                  ]}
                  numberOfLines={1}
                >
                  {getConversationTitle(item)}
                </Text>
                {hasUnreadMessages && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.conversationTime}>
                {formatTime(item.lastMessage?.timestamp || item.updatedAt)}
              </Text>
            </View>

            <Text
              style={[
                styles.conversationSubtitle,
                hasUnreadMessages && styles.conversationSubtitleUnread,
              ]}
              numberOfLines={2}
            >
              {getConversationSubtitle(item)}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [
      getUnreadCount,
      getConversationTitle,
      getConversationSubtitle,
      formatTime,
      getInitials,
      handleConversationPress,
    ]
  );

  const keyExtractor = useCallback((item: Conversation) => item.id, []);

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Ionicons name="chatbubbles-outline" size={64} color="#C7C7CC" />
        <Text style={styles.emptyStateTitle}>No Conversations Yet</Text>
        <Text style={styles.emptyStateSubtitle}>
          Start a conversation with your friends
        </Text>
        <TouchableOpacity
          style={styles.startConversationButton}
          onPress={handleNewConversation}
        >
          <Text style={styles.startConversationButtonText}>
            Start Conversation
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [handleNewConversation]
  );

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading conversations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={keyExtractor}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={
          conversations.length === 0 ? styles.emptyContainer : undefined
        }
        removeClippedSubviews={false}
      />

      <TouchableOpacity style={styles.fab} onPress={handleNewConversation}>
        <Ionicons name="add" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  conversationItemUnread: {
    backgroundColor: "#FFF8E1", // Light gold background
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    flex: 1,
  },
  conversationTitleUnread: {
    fontWeight: "700",
  },
  conversationTime: {
    fontSize: 12,
    color: "#666",
    marginLeft: 8,
    minWidth: Platform.OS === "android" ? 40 : 35,
    flexShrink: 0,
  },
  conversationSubtitle: {
    fontSize: 14,
    color: "#666",
    lineHeight: 18,
  },
  conversationSubtitleUnread: {
    fontWeight: "500",
  },
  unreadBadge: {
    backgroundColor: "#FF6B35",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#007AFF",
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  startConversationButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  startConversationButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
