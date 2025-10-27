/**
 * @fileoverview Tab Layout - Defines the main tab navigation for the application.
 *
 * `Tabs`. It defines the main sections of the application: Home (conversation
 * list), Contacts, Profile, and conditionally a Diagnostics screen for debugging
 * (only shown when EXPO_PUBLIC_DEV_MODE=true).
 *
 * A key feature of this layout is the dynamic badge notifications on the "Home"
 * and "Contacts" tabs. These badges provide at-a-glance information about the
 * number of unread messages and pending friend requests, respectively. The
 * component subscribes to the relevant stores to keep these counts up-to-date
 * in real-time.
 *
 * @see useMessagesStore for unread message counts.
 * @see useContactsStore for friend request counts.
 */

import { useAuthStore } from "@/stores/authStore";
import { useContactsStore } from "@/stores/contactsStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { Tabs } from "expo-router";
import React, { useEffect } from "react";
import { Text } from "react-native";

/**
 * Tab layout component
 *
 * Sets up the main tab navigation and initializes conversations
 * when user is authenticated. Displays badge counts for notifications.
 */
export default function TabLayout() {
  const { user } = useAuthStore();
  const { friendRequests, sentRequests } = useContactsStore();
  const { getTotalUnreadCount, loadConversations, subscribeToConversations } =
    useMessagesStore();

  const pendingRequestsCount = friendRequests.length + sentRequests.length;
  const totalUnreadMessages = user ? getTotalUnreadCount(user.uid) : 0;
  const isDevMode = process.env.EXPO_PUBLIC_DEV_MODE === "true";

  // Initialize conversations when user is available
  useEffect(() => {
    if (user) {
      // Load conversations and subscribe to updates for badge calculation
      loadConversations(user.uid);
      subscribeToConversations(user.uid);
    }
  }, [user, loadConversations, subscribeToConversations]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: "#6C757D",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E9ECEF",
        },
        headerStyle: {
          backgroundColor: "#FFFFFF",
        },
        headerTitleStyle: {
          fontWeight: "600",
          color: "#000000",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>🏠</Text>
          ),
          tabBarBadge:
            totalUnreadMessages > 0 ? totalUnreadMessages : undefined,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>👥</Text>
          ),
          tabBarBadge:
            pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>👤</Text>
          ),
        }}
      />
      {isDevMode && (
        <Tabs.Screen
          name="diagnostics"
          options={{
            title: "Diagnostics",
            tabBarIcon: ({ color, size }) => (
              <Text style={{ color, fontSize: size }}>🩺</Text>
            ),
          }}
        />
      )}
    </Tabs>
  );
}
