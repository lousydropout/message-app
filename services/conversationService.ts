/**
 * @fileoverview Conversation Service - Manages conversations in Firestore
 *
 * This service is the primary interface for all conversation-related operations
 * in Firestore. It encapsulates the logic for creating, retrieving, updating,
 * and subscribing to conversations, abstracting the underlying Firestore queries
 * and data manipulation from the rest of the application.
 *
 * @see /docs/firestore-data-model.md for the data schema.
 */

/**
 * @fileoverview Conversation Service - Manages conversations in Firestore
 *
 * This service handles:
 * - Creating conversations (direct and group)
 * - Fetching conversations
 * - Finding or creating direct conversations
 * - Updating conversation metadata
 * - Real-time conversation subscriptions
 * - Firestore connection state tracking
 *
 * Key features:
 * - Subcollection pattern for messages (conversations/{id}/messages)
 * - Atomic unread count updates
 * - Client-side sorting (avoiding index requirements)
 * - Firestore connection monitoring for offline handling
 *
 * @notes
 * The current implementation uses client-side sorting for conversations to avoid
 * the need for a composite index on `participants` and `updatedAt`. This is a
 * temporary measure to simplify development and will be replaced with a proper
 * index as the application scales. The `subscribeToConversations` method also
 * handles Firestore connection state updates, which is crucial for the app's
 * offline functionality.
 */

import { db } from "@/config/firebase";
import { useConnectionStore } from "@/stores/connectionStore";
import { logger } from "@/stores/loggerStore";
import { Conversation } from "@/types/Conversation";
import { Message } from "@/types/Message";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where,
} from "firebase/firestore";

class ConversationService {
  private conversationsRef = collection(db, "conversations");

  /**
   * Create a new conversation
   *
   * Creates a conversation document in Firestore with participants,
   * type, and optional name (for group chats).
   *
   * @param participants - Array of user IDs participating in the conversation
   * @param type - Type of conversation: "direct" or "group"
   * @param name - Optional name for group conversations
   * @returns Conversation ID
   * @throws Error if creation fails
   */
  async createConversation(
    participants: string[],
    type: "direct" | "group",
    name?: string
  ): Promise<string> {
    try {
      const conversationData = {
        type,
        participants,
        name: name || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadCounts: {}, // Initialize empty
      };

      const docRef = await addDoc(this.conversationsRef, conversationData);
      return docRef.id;
    } catch (error) {
      logger.error("conversations", "Error creating conversation:", error);
      throw error;
    }
  }

  /**
   * Retrieves a single conversation by its ID.
   *
   * @param conversationId - The ID of the conversation to fetch.
   * @returns A promise that resolves to the Conversation object or null if not found.
   * @throws Throws an error if the fetch operation fails.
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const methodStartTime = Date.now();
    logger.info(
      "conversations",
      `🔍 getConversation called for ${conversationId}`
    );

    try {
      const docRefStartTime = Date.now();
      const docRef = doc(this.conversationsRef, conversationId);
      const docRefEndTime = Date.now();
      logger.info(
        "conversations",
        `📄 doc() call completed in ${docRefEndTime - docRefStartTime}ms`
      );

      const getDocStartTime = Date.now();
      logger.info(
        "conversations",
        `🌐 About to call getDoc for ${conversationId}`
      );
      const docSnap = await getDoc(docRef);
      const getDocEndTime = Date.now();
      logger.info(
        "conversations",
        `🌐 getDoc completed in ${getDocEndTime - getDocStartTime}ms`
      );

      if (docSnap.exists()) {
        const dataProcessingStartTime = Date.now();
        const result = {
          id: docSnap.id,
          ...docSnap.data(),
        } as Conversation;
        const dataProcessingEndTime = Date.now();
        logger.info(
          "conversations",
          `🔄 Data processing completed in ${
            dataProcessingEndTime - dataProcessingStartTime
          }ms`
        );

        const totalTime = Date.now() - methodStartTime;
        logger.info(
          "conversations",
          `✅ getConversation completed successfully in ${totalTime}ms`
        );
        return result;
      }

      const totalTime = Date.now() - methodStartTime;
      logger.info(
        "conversations",
        `❌ Conversation ${conversationId} not found, completed in ${totalTime}ms`
      );
      return null;
    } catch (error) {
      const totalTime = Date.now() - methodStartTime;
      logger.error(
        "conversations",
        `❌ Error getting conversation ${conversationId} after ${totalTime}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Retrieves all conversations for a specific user.
   *
   * Queries for conversations where the user's ID is in the 'participants' array.
   * Currently sorts conversations on the client-side by `updatedAt` timestamp
   * to avoid requiring a composite Firestore index during early development.
   *
   * @param userId - The ID of the user whose conversations are to be fetched.
   * @returns A promise that resolves to an array of Conversation objects.
   * @throws Throws an error if the query fails.
   * @note This method currently sorts conversations on the client-side to avoid
   * the need for a composite Firestore index on `participants` and `updatedAt`.
   * This is a temporary measure for performance and will be updated later.
   */
  async getUserConversations(userId: string): Promise<Conversation[]> {
    try {
      // Temporary: Use simple query without orderBy to avoid index requirement
      const q = query(
        this.conversationsRef,
        where("participants", "array-contains", userId)
      );

      const querySnapshot = await getDocs(q);
      const conversations: Conversation[] = [];

      querySnapshot.forEach((doc) => {
        conversations.push({
          id: doc.id,
          ...doc.data(),
        } as Conversation);
      });

      // Sort on client side until index is ready
      conversations.sort((a, b) => {
        const aTime = a.updatedAt?.toDate?.() || new Date(0);
        const bTime = b.updatedAt?.toDate?.() || new Date(0);
        return bTime.getTime() - aTime.getTime();
      });

      return conversations;
    } catch (error) {
      logger.error("conversations", "Error getting user conversations:", error);
      throw error;
    }
  }

  /**
   * Finds an existing direct conversation between two users or creates a new one.
   *
   * This function prevents duplicate direct conversations. It queries for a 'direct'
   * conversation that includes both user IDs as participants. If none is found,
   * it creates a new one.
   *
   * @param userId1 - The ID of the first user.
   * @param userId2 - The ID of the second user.
   * @returns A promise that resolves to the conversation ID.
   * @throws Throws an error if the operation fails.
   * @note The query for existing conversations is designed to be efficient by
   * filtering on one user ID and then checking the participants array in-memory.
   * This is more scalable than querying for both user IDs in the array.
   */
  async getOrCreateDirectConversation(
    userId1: string,
    userId2: string
  ): Promise<string> {
    try {
      // Check if direct conversation already exists
      const q = query(
        this.conversationsRef,
        where("type", "==", "direct"),
        where("participants", "array-contains", userId1)
      );

      const querySnapshot = await getDocs(q);

      for (const doc of querySnapshot.docs) {
        const data = doc.data() as Conversation;
        if (
          data.participants.includes(userId2) &&
          data.participants.length === 2
        ) {
          return doc.id;
        }
      }

      // Create new direct conversation
      return await this.createConversation([userId1, userId2], "direct");
    } catch (error) {
      logger.error(
        "conversations",
        "Error getting or creating direct conversation:",
        error
      );
      throw error;
    }
  }

  /**
   * Updates a conversation document with the provided data.
   *
   * @param conversationId - The ID of the conversation to update.
   * @param data - An object containing the fields to update.
   * @returns A promise that resolves when the update is complete.
   * @throws Throws an error if the update fails.
   */
  async updateConversation(conversationId: string, data: any): Promise<void> {
    try {
      const conversationRef = doc(this.conversationsRef, conversationId);
      await updateDoc(conversationRef, data);
    } catch (error) {
      logger.error("conversations", "Error updating conversation:", error);
      throw error;
    }
  }

  /**
   * Updates the `lastMessage` and `updatedAt` fields of a conversation.
   *
   * This is typically called after a new message is sent to keep conversation
   * previews up-to-date.
   *
   * @param conversationId - The ID of the conversation to update.
   * @param message - The latest message object.
   * @returns A promise that resolves when the update is complete.
   * @throws Throws an error if the update fails.
   */
  async updateConversationLastMessage(
    conversationId: string,
    message: Message
  ): Promise<void> {
    try {
      const conversationRef = doc(this.conversationsRef, conversationId);
      await updateDoc(conversationRef, {
        lastMessage: {
          id: message.id,
          text: message.text,
          senderId: message.senderId,
          timestamp: message.timestamp,
        },
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      logger.error(
        "conversations",
        "Error updating conversation last message:",
        error
      );
      throw error;
    }
  }

  /**
   * Subscribes to real-time updates for a user's conversations.
   *
   * Sets up a Firestore listener that triggers the callback with an updated
   * list of conversations whenever a change occurs. It also monitors the
   * connection state with Firestore and updates the `connectionStore`.
   *
   * @param userId - The ID of the user to get conversations for.
   * @param callback - The function to call with the updated conversations array.
   * @returns An `Unsubscribe` function to stop the listener.
   * @note This subscription is essential for the real-time functionality of the
   * app. The error handling logic is designed to detect offline scenarios and
   * update the connection state accordingly, allowing the app to switch to
   * offline mode gracefully.
   */
  subscribeToConversations(
    userId: string,
    callback: (conversations: Conversation[]) => void
  ): Unsubscribe {
    // Temporary: Use simple query without orderBy to avoid index requirement
    const q = query(
      this.conversationsRef,
      where("participants", "array-contains", userId)
    );

    logger.debug(
      "conversations",
      `[DEBUG] Setting up conversation subscription for user: ${userId}`
    );

    return onSnapshot(
      q,
      (querySnapshot) => {
        // SUCCESS: Firestore is connected and working
        const { updateFirestoreConnectionState } =
          useConnectionStore.getState();
        updateFirestoreConnectionState(true);

        logger.debug(
          "conversations",
          `[DEBUG] Conversation subscription received ${querySnapshot.docs.length} documents`
        );

        const conversations: Conversation[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          logger.debug("conversations", `[DEBUG] Conversation ${doc.id}:`, {
            type: data.type,
            name: data.name,
            participants: data.participants?.length,
            unreadCounts: data.unreadCounts,
            lastMessage: data.lastMessage?.text?.substring(0, 20) + "...",
          });

          conversations.push({
            id: doc.id,
            ...data,
          } as Conversation);
        });

        // Sort on client side until index is ready
        conversations.sort((a, b) => {
          const aTime = a.updatedAt?.toDate?.() || new Date(0);
          const bTime = b.updatedAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        logger.debug(
          "conversations",
          `[DEBUG] Calling callback with ${conversations.length} sorted conversations`
        );
        callback(conversations);
      },
      (error) => {
        // FAILURE: Check if it's a connection issue
        const { updateFirestoreConnectionState } =
          useConnectionStore.getState();

        if (
          error.code === "unavailable" ||
          error.message.includes("client was offline") ||
          error.code === "deadline-exceeded" ||
          error.code === "permission-denied"
        ) {
          updateFirestoreConnectionState(false);
        }

        logger.error("conversations", "Conversation subscription error:", {
          error: error.message,
          code: error.code,
          userId,
        });
        // Don't call callback on error, just log it
      }
    );
  }

  /**
   * Subscribes to real-time updates for a single conversation.
   *
   * @param conversationId - The ID of the conversation to subscribe to.
   * @param callback - The function to call with the updated conversation data, or null if it's deleted.
   * @returns An `Unsubscribe` function to stop the listener.
   * @note This provides a real-time view of a single conversation's metadata,
   * which is useful for displaying details like the group name or participant list.
   */
  subscribeToConversation(
    conversationId: string,
    callback: (conversation: Conversation | null) => void
  ): Unsubscribe {
    const conversationRef = doc(this.conversationsRef, conversationId);

    return onSnapshot(conversationRef, (doc) => {
      if (doc.exists()) {
        callback({
          id: doc.id,
          ...doc.data(),
        } as Conversation);
      } else {
        callback(null);
      }
    });
  }
}

export default new ConversationService();
