import { useAuthStore } from "@/stores/authStore";
import { useContactsStore } from "@/stores/contactsStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { Tabs } from "expo-router";
import React, { useEffect } from "react";
import { Text } from "react-native";

export default function TabLayout() {
  const { user } = useAuthStore();
  const { friendRequests, sentRequests } = useContactsStore();
  const { getTotalUnreadCount, loadConversations, subscribeToConversations } =
    useMessagesStore();

  const pendingRequestsCount = friendRequests.length + sentRequests.length;
  const totalUnreadMessages = user ? getTotalUnreadCount(user.uid) : 0;

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
      <Tabs.Screen
        name="diagnostics"
        options={{
          title: "Diagnostics",
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size }}>🩺</Text>
          ),
        }}
      />
    </Tabs>
  );
}
