import { ConversationView } from "@/components/ConversationView";
import conversationService from "@/services/conversationService";
import { useAuthStore } from "@/stores/authStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { Conversation } from "@/types/Conversation";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);

  const { user } = useAuthStore();
  const { setCurrentConversation, clearSubscriptions } = useMessagesStore();

  useEffect(() => {
    if (!id || !user) {
      router.back();
      return;
    }

    const loadConversation = async () => {
      try {
        setLoading(true);

        // Load conversation details
        const conversationData = await conversationService.getConversation(id);

        if (!conversationData) {
          Alert.alert("Error", "Conversation not found", [
            { text: "OK", onPress: () => router.back() },
          ]);
          return;
        }

        // Check if user is a participant
        if (!conversationData.participants.includes(user.uid)) {
          Alert.alert("Error", "You don't have access to this conversation", [
            { text: "OK", onPress: () => router.back() },
          ]);
          return;
        }

        setConversation(conversationData);
        setCurrentConversation(id);

        // Subscribe to conversation updates
        const unsubscribe = conversationService.subscribeToConversation(
          id,
          (updatedConversation) => {
            if (updatedConversation) {
              setConversation(updatedConversation);
            }
          }
        );

        return unsubscribe;
      } catch (error) {
        console.error("Error loading conversation:", error);
        Alert.alert("Error", "Failed to load conversation", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } finally {
        setLoading(false);
      }
    };

    const unsubscribePromise = loadConversation();

    return () => {
      // Clean up subscriptions
      clearSubscriptions();
      setCurrentConversation(null);

      // Clean up conversation subscription
      unsubscribePromise.then((unsubscribe) => {
        if (unsubscribe) {
          unsubscribe();
        }
      });
    };
  }, [id, user]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading conversation...</Text>
      </View>
    );
  }

  if (!conversation) {
    return (
      <View style={styles.errorContainer}>
        <Text>Conversation not found</Text>
      </View>
    );
  }

  return <ConversationView conversationId={id} conversation={conversation} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
  },
});
