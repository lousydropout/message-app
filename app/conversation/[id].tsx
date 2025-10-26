/**
 * @fileoverview Conversation Screen - Renders a single, active conversation.
 *
 * This screen is responsible for displaying the contents of a specific chat
 * conversation. It uses a dynamic route parameter (`[id]`) to identify which
 * conversation to load. The screen follows a "SQLite-first" loading strategy,
 * attempting to retrieve the conversation details from the local database for an
 * instant-on experience before fetching updates from Firestore.
 *
 * It manages the lifecycle of the conversation view, including setting up
 * real-time subscriptions for new messages and conversation updates when the
 * screen is mounted, and tearing down these subscriptions when it is unmounted.
 * This ensures that the application is only listening for updates that are
 * relevant to the user's current context, which is crucial for performance and
 * managing Firestore costs.
 *
 * @see ConversationView for the UI component that renders the conversation.
 * @see useMessagesStore for the state management of the active conversation.
 */

import { ConversationView } from "@/components/ConversationView";
import conversationService from "@/services/conversationService";
import sqliteService from "@/services/sqliteService";
import { useAuthStore } from "@/stores/authStore";
import { logger } from "@/stores/loggerStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { Conversation } from "@/types/Conversation";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

/**
 * Conversation screen component
 *
 * Displays a single conversation with messages. Handles loading,
 * subscriptions, and cleanup lifecycle.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);

  const { user } = useAuthStore();
  const { setCurrentConversation } = useMessagesStore();

  logger.info("ConversationScreen", `🎬 ConversationScreen mounted for ${id}`);

  useEffect(() => {
    if (!id || !user) {
      router.back();
      return;
    }

    const loadConversation = async () => {
      const screenStartTime = Date.now();
      logger.info(
        "ConversationScreen",
        `🚀 Starting conversation screen load for ${id}`
      );

      try {
        setLoading(true);
        logger.info(
          "ConversationScreen",
          `📡 Attempting to load conversation ${id}`
        );

        // Load conversation details
        const conversationLoadStartTime = Date.now();
        logger.info(
          "ConversationScreen",
          `📡 About to call sqliteService.getConversation for ${id}`
        );
        const conversationData = await sqliteService.getConversation(id);
        const conversationLoadEndTime = Date.now();
        logger.info(
          "ConversationScreen",
          `📋 sqliteService.getConversation returned in ${
            conversationLoadEndTime - conversationLoadStartTime
          }ms`
        );

        if (!conversationData) {
          logger.info("ConversationScreen", `❌ Conversation ${id} not found`);
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

        const stateUpdateStartTime = Date.now();
        setConversation(conversationData);
        setCurrentConversation(id);
        const stateUpdateEndTime = Date.now();
        logger.info(
          "ConversationScreen",
          `🔄 State update completed in ${
            stateUpdateEndTime - stateUpdateStartTime
          }ms`
        );

        // Subscribe to conversation updates
        const subscriptionStartTime = Date.now();
        const unsubscribe = conversationService.subscribeToConversation(
          id,
          (updatedConversation) => {
            if (updatedConversation) {
              setConversation(updatedConversation);
            }
          }
        );
        const subscriptionEndTime = Date.now();
        logger.info(
          "ConversationScreen",
          `📡 Conversation subscription completed in ${
            subscriptionEndTime - subscriptionStartTime
          }ms`
        );

        const totalScreenTime = Date.now() - screenStartTime;
        logger.info(
          "ConversationScreen",
          `✅ Conversation screen setup completed in ${totalScreenTime}ms`
        );

        return unsubscribe;
      } catch (error) {
        logger.error(
          "ConversationScreen",
          `❌ Error loading conversation ${id}:`,
          error
        );
        Alert.alert("Error", "Failed to load conversation", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } finally {
        logger.info(
          "ConversationScreen",
          `🔄 Setting loading to false for ${id}`
        );
        setLoading(false);
      }
    };

    const unsubscribePromise = loadConversation();

    return () => {
      // Clean up current conversation
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
