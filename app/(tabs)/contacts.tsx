import ContactsList from "@/components/ContactsList";
import FriendRequestCard from "@/components/FriendRequestCard";
import UserSearch from "@/components/UserSearch";
import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
import { useContactsStore } from "@/stores/contactsStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { User } from "@/types/User";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function ContactsScreen() {
  const { user } = useAuthStore();
  const { friends, friendRequests, loading, loadFriends, loadFriendRequests } =
    useContactsStore();
  const { createOrOpenDirectConversation } = useMessagesStore();

  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "search">(
    "friends"
  );
  const [senderProfiles, setSenderProfiles] = useState<Record<string, User>>(
    {}
  );

  useEffect(() => {
    if (user) {
      loadFriends(user.uid);
      loadFriendRequests(user.uid);
    }
  }, [user, loadFriends, loadFriendRequests]);

  // Refresh friend requests when switching to requests tab
  useEffect(() => {
    if (activeTab === "requests" && user) {
      loadFriendRequests(user.uid);
    }
  }, [activeTab, user, loadFriendRequests]);

  // Fetch sender profiles when friend requests change
  useEffect(() => {
    if (friendRequests.length > 0) {
      const fetchSenderProfiles = async () => {
        const senderIds = friendRequests.map((req) => req.fromUserId);
        const uniqueSenderIds = [...new Set(senderIds)]; // Remove duplicates

        try {
          const profiles = await userService.getUsersByIds(uniqueSenderIds);
          const profilesMap: Record<string, User> = {};
          profiles.forEach((profile) => {
            profilesMap[profile.id] = profile;
          });
          setSenderProfiles(profilesMap);
        } catch (error) {
          console.error("Error fetching sender profiles:", error);
        }
      };

      fetchSenderProfiles();
    } else {
      setSenderProfiles({});
    }
  }, [friendRequests]);

  const handleFriendSelect = async (friend: User) => {
    if (!user) return;

    try {
      const conversationId = await createOrOpenDirectConversation(friend.id);
      router.push(`/conversation/${conversationId}`);
    } catch (error) {
      console.error("Error starting conversation:", error);
      Alert.alert("Error", "Failed to start conversation. Please try again.");
    }
  };

  const handleBlockFriend = (friend: User) => {
    // Friend is removed from list automatically by the store
    console.log(`Blocked ${friend.displayName}`);
  };

  const renderTabButton = (
    tab: "friends" | "requests" | "search",
    label: string,
    count?: number
  ) => (
    <View
      style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
    >
      <Text
        style={[
          styles.tabButtonText,
          activeTab === tab && styles.activeTabButtonText,
        ]}
        onPress={() => setActiveTab(tab)}
      >
        {label}
        {count !== undefined && count > 0 && (
          <Text style={styles.badgeText}>
            {"  "}({count})
          </Text>
        )}
      </Text>
    </View>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      );
    }

    switch (activeTab) {
      case "search":
        return <UserSearch />;
      case "requests":
        return (
          <ScrollView style={styles.content}>
            {friendRequests.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No friend requests</Text>
                <Text style={styles.emptySubtext}>
                  When someone sends you a friend request, it will appear here
                </Text>
              </View>
            ) : (
              friendRequests.map((request) => {
                const senderProfile = senderProfiles[request.fromUserId];
                return (
                  <FriendRequestCard
                    key={request.id}
                    request={request}
                    senderName={senderProfile?.displayName || "Unknown User"}
                    senderEmail={senderProfile?.email || "unknown@example.com"}
                  />
                );
              })
            )}
          </ScrollView>
        );
      default:
        return (
          <ContactsList
            friends={friends}
            onFriendSelect={handleFriendSelect}
            onBlockFriend={handleBlockFriend}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        {renderTabButton("friends", "Friends", friends.length)}
        {renderTabButton("requests", "Requests", friendRequests.length)}
        {renderTabButton("search", "Search")}
      </View>

      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#212529",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 16,
    borderRadius: 8,
  },
  activeTabButton: {
    backgroundColor: "#007AFF",
  },
  tabButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6C757D",
  },
  activeTabButtonText: {
    color: "#FFFFFF",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6C757D",
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6C757D",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#ADB5BD",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
