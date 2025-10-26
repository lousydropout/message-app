/**
 * @fileoverview Contacts Screen - Manages the user's social graph.
 *
 * This screen serves as the central hub for all social interactions within the
 * application. It provides a tabbed interface that allows the user to switch
 * between their list of friends, pending friend requests (both incoming and
 * outgoing), and a user search view to discover new people.
 *
 * The screen is responsible for fetching and displaying the necessary data for
 * each of these views, leveraging the `useContactsStore` for state management
 * and the `userService` to fetch profiles for display. It also handles the
 * creation of new direct conversations when a user taps on a friend in their list.
 *
 * @see useContactsStore for the state and actions related to friends and requests.
 * @see ContactsList, FriendRequestCard, SentRequestCard, UserSearch for the
 *      sub-components that render the different views.
 */

import ContactsList from "@/components/ContactsList";
import FriendRequestCard from "@/components/FriendRequestCard";
import SentRequestCard from "@/components/SentRequestCard";
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

/**
 * Contacts screen component
 *
 * Manages friends, friend requests, and user search.
 * Displays tabs for different contact management views.
 */
export default function ContactsScreen() {
  const { user } = useAuthStore();
  const { friends, friendRequests, sentRequests, loading, loadFriends } =
    useContactsStore();
  const { createOrOpenDirectConversation } = useMessagesStore();

  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "search">(
    "friends"
  );
  const [senderProfiles, setSenderProfiles] = useState<Record<string, User>>(
    {}
  );
  const [recipientProfiles, setRecipientProfiles] = useState<
    Record<string, User>
  >({});

  useEffect(() => {
    if (user) {
      loadFriends(user.uid);
      // Friend requests are now loaded via real-time subscriptions in root layout
    }
  }, [user, loadFriends]);

  // Friend requests are now loaded via real-time subscriptions, no need to refresh

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

  // Fetch recipient profiles when sent requests change
  useEffect(() => {
    if (sentRequests.length > 0) {
      const fetchRecipientProfiles = async () => {
        const recipientIds = sentRequests.map((req) => req.toUserId);
        const uniqueRecipientIds = [...new Set(recipientIds)]; // Remove duplicates

        try {
          const profiles = await userService.getUsersByIds(uniqueRecipientIds);
          const profilesMap: Record<string, User> = {};
          profiles.forEach((profile) => {
            profilesMap[profile.id] = profile;
          });
          setRecipientProfiles(profilesMap);
        } catch (error) {
          console.error("Error fetching recipient profiles:", error);
        }
      };

      fetchRecipientProfiles();
    } else {
      setRecipientProfiles({});
    }
  }, [sentRequests]);

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
          <Text
            style={[
              styles.badgeText,
              { color: activeTab === tab ? "#FFFFFF" : "#6C757D" },
            ]}
          >
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
            {/* Incoming Friend Requests */}
            {friendRequests.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Friend Requests</Text>
                {friendRequests.map((request) => {
                  const senderProfile = senderProfiles[request.fromUserId];
                  return (
                    <FriendRequestCard
                      key={request.id}
                      request={request}
                      senderName={senderProfile?.displayName || "Unknown User"}
                      senderEmail={
                        senderProfile?.email || "unknown@example.com"
                      }
                    />
                  );
                })}
              </>
            )}

            {/* Sent Friend Requests */}
            {sentRequests.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Sent Requests</Text>
                {sentRequests.map((request) => {
                  const recipientProfile = recipientProfiles[request.toUserId];
                  return (
                    <SentRequestCard
                      key={request.id}
                      request={request}
                      recipientName={
                        recipientProfile?.displayName || "Unknown User"
                      }
                      recipientEmail={
                        recipientProfile?.email || "unknown@example.com"
                      }
                    />
                  );
                })}
              </>
            )}

            {/* Empty State */}
            {friendRequests.length === 0 && sentRequests.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No friend requests</Text>
                <Text style={styles.emptySubtext}>
                  When someone sends you a friend request, it will appear here
                </Text>
              </View>
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
        {renderTabButton(
          "requests",
          "Requests",
          friendRequests.length + sentRequests.length
        )}
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
    fontSize: 14,
    fontWeight: "bold",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 12,
    marginTop: 8,
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
