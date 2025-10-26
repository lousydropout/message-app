/**
 * @fileoverview Message Service - Manages all message-related operations in Firestore.
 *
 * This service is responsible for the entire lifecycle of a message, from sending
 * to real-time updates and read status. It leverages a subcollection model where
 * messages are stored under their respective conversations, providing a clean
 * and scalable data structure.
 *
 * @see /docs/firestore-data-model.md for the data schema.
 * @see messagesStore for how this service is integrated into the app's state.
 */

/**
 * @fileoverview Message Service - Manages messages in Firestore
 *
 * This service handles:
 * - Sending messages with idempotency (UUID-based)
 * - Fetching messages with pagination
 * - Incremental sync (messages since timestamp)
 * - Read receipts (marking messages as read)
 * - Typing indicators
 * - Real-time message subscriptions
 * - Atomic unread count updates
 *
 * Key features:
 * - Subcollection pattern: conversations/{conversationId}/messages
 * - Idempotency check prevents duplicate sends
 * - Atomic unread count increments via Firestore increment()
 * - Client-side sorting (avoiding index requirements)
 * - Read receipts with timestamp tracking
 *
 * @notes
 * The `sendMessage` method is a critical, multi-step operation. It first checks
 * for message existence to ensure idempotency, then creates the message document,
 * and finally updates the parent conversation's metadata (last message and unread
 * counts) in a single atomic update. This ensures data consistency. The service
 * also uses client-side sorting for messages to avoid complex composite indexes
 * during early development.
 */

import { db } from "@/config/firebase";
import { logger } from "@/stores/loggerStore";
import { Message, TypingStatus } from "@/types/Message";
import {
  collection,
  doc,
  DocumentSnapshot,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Unsubscribe,
  updateDoc,
  where,
} from "firebase/firestore";
import conversationService from "./conversationService";

class MessageService {
  /**
   * Send a message to a conversation
   *
   * Creates a message document in Firestore with an idempotency check to prevent
   * duplicates. It also atomically updates the parent conversation's `lastMessage`
   * and increments the `unreadCounts` for all participants except the sender.
   *
   * @param messageId - A client-generated UUID for the message to ensure idempotency.
   * @param conversationId - The ID of the conversation to send the message to.
   * @param senderId - The ID of the user sending the message.
   * @param text - The text content of the message.
   * @returns A promise that resolves to the newly created `Message` object.
   * @throws An error if the conversation is not found or if the send operation fails.
   */
  async sendMessage(
    messageId: string,
    conversationId: string,
    senderId: string,
    text: string
  ): Promise<Message> {
    try {
      const messageRef = doc(
        db,
        "conversations",
        conversationId,
        "messages",
        messageId
      );

      // Idempotency check
      const existing = await getDoc(messageRef);
      if (existing.exists()) {
        logger.info("messages", "Message already exists, skipping:", messageId);
        return { id: messageId, ...existing.data() } as Message;
      }

      // Fetch conversation to get participants
      const conversation = await conversationService.getConversation(
        conversationId
      );
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const messageData = {
        conversationId,
        senderId,
        text,
        timestamp: serverTimestamp(),
        readBy: {
          [senderId]: serverTimestamp(),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Debug logging
      logger.info("messages", "📤 Message data being sent:", {
        messageId,
        conversationId,
        senderId,
        text: text.substring(0, 50) + "...",
      });

      // Use setDoc with provided UUID (not addDoc)
      logger.info(
        "messages",
        `📤 Attempting to send message ${messageId} to conversation ${conversationId}`
      );
      await setDoc(messageRef, messageData);
      logger.info(
        "messages",
        `✅ Message ${messageId} sent successfully to Firestore`
      );

      // Create message object with ID and current timestamp
      const currentTimestamp = new Date();
      const message: Message = {
        id: messageId,
        conversationId,
        senderId,
        text,
        timestamp: currentTimestamp as any, // Use current timestamp for immediate display
        readBy: {
          [senderId]: currentTimestamp as any,
        },
        createdAt: currentTimestamp as any,
        updatedAt: currentTimestamp as any,
      };

      // Update conversation with last message info
      if (conversation) {
        // Prepare update data for conversation
        const updateData: any = {
          lastMessage: {
            id: message.id,
            text: message.text,
            senderId: message.senderId,
            timestamp: message.timestamp,
          },
          updatedAt: serverTimestamp(),
        };

        // Increment unread count for each participant except sender
        conversation.participants.forEach((participantId) => {
          if (participantId !== senderId) {
            updateData[`unreadCounts.${participantId}`] = increment(1);
            logger.info(
              "messages",
              `[DEBUG] Incrementing unread count for participant: ${participantId} in conversation: ${conversationId}`
            );
          }
        });

        logger.info(
          "messages",
          `[DEBUG] Updating conversation ${conversationId} with:`,
          updateData
        );

        // Update conversation with last message and unread counts
        await conversationService.updateConversation(
          conversationId,
          updateData
        );
      }

      return message;
    } catch (error) {
      logger.debug("messages", "Error sending message:", error);
      throw error;
    }
  }

  /**
   * Retrieves a paginated list of messages for a conversation.
   *
   * @param conversationId - The ID of the conversation to fetch messages from.
   * @param limitCount - The maximum number of messages to retrieve.
   * @param startAfterDoc - A Firestore `DocumentSnapshot` to start fetching after, used for pagination.
   * @returns A promise that resolves to an array of `Message` objects.
   * @throws An error if the fetch operation fails.
   * @note Messages are sorted by timestamp on the client-side.
   */
  async getMessages(
    conversationId: string,
    limitCount: number = 10000,
    startAfterDoc?: DocumentSnapshot
  ): Promise<Message[]> {
    try {
      // Use conversation-specific messages collection
      const messagesRef = collection(
        db,
        "conversations",
        conversationId,
        "messages"
      );
      let q = query(messagesRef, limit(limitCount));

      if (startAfterDoc) {
        q = query(q, startAfter(startAfterDoc));
      }

      const querySnapshot = await getDocs(q);
      const messages: Message[] = [];

      querySnapshot.forEach((doc) => {
        messages.push({
          id: doc.id,
          ...doc.data(),
        } as Message);
      });

      // Sort on client side until index is ready
      messages.sort((a, b) => {
        const aTime = a.timestamp?.toDate?.() || new Date(0);
        const bTime = b.timestamp?.toDate?.() || new Date(0);
        return bTime.getTime() - aTime.getTime();
      });

      return messages;
    } catch (error) {
      logger.error("messages", "Error getting messages:", error);
      throw error;
    }
  }

  /**
   * Retrieves messages that have been created or updated since a given timestamp.
   *
   * This is a key function for the app's offline-first strategy, allowing the
   * client to efficiently sync missed messages after reconnecting.
   *
   * @param conversationId - The ID of the conversation to sync messages for.
   * @param lastSyncedAt - The timestamp (in milliseconds) of the last sync.
   * @param limitCount - The maximum number of messages to retrieve.
   * @returns A promise that resolves to an array of new or updated `Message` objects.
   * @throws An error if the fetch operation fails.
   */
  async getMessagesSince(
    conversationId: string,
    lastSyncedAt: number,
    limitCount: number = 100
  ): Promise<Message[]> {
    try {
      const lastSyncedTimestamp = new Date(lastSyncedAt);

      // Use conversation-specific messages collection
      const messagesRef = collection(
        db,
        "conversations",
        conversationId,
        "messages"
      );
      const q = query(
        messagesRef,
        where("updatedAt", ">", lastSyncedTimestamp),
        orderBy("updatedAt", "desc"),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      const messages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Message[];

      logger.info(
        "messages",
        `Retrieved ${messages.length} new messages since ${lastSyncedAt} for conversation: ${conversationId}`
      );

      return messages;
    } catch (error) {
      logger.error(
        "messages",
        "Error getting messages since timestamp:",
        error
      );
      throw error;
    }
  }

  /**
   * Marks a single message as read by a specific user.
   *
   * This updates the `readBy` map on the message document, adding the user's ID
   * and the timestamp they read the message.
   *
   * @param messageId - The ID of the message to mark as read.
   * @param userId - The ID of the user who read the message.
   * @param conversationId - The ID of the conversation the message belongs to.
   * @returns A promise that resolves when the update is complete.
   * @throws An error if the update fails.
   */
  async markMessageAsRead(
    messageId: string,
    userId: string,
    conversationId: string
  ): Promise<void> {
    try {
      const messageRef = doc(
        db,
        "conversations",
        conversationId,
        "messages",
        messageId
      );
      await updateDoc(messageRef, {
        [`readBy.${userId}`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      logger.debug("messages", "Error marking message as read:", error);
      throw error;
    }
  }

  /**
   * Marks all recent messages in a conversation as read by a user.
   *
   * This function performs two main actions:
   * 1. Atomically resets the user's unread count for the conversation to zero.
   * 2. Updates the `readBy` map for the 50 most recent messages to provide
   *    detailed read receipts.
   *
   * @param conversationId - The ID of the conversation to mark as read.
   * @param userId - The ID of the user who has read the conversation.
   * @returns A promise that resolves when all updates are complete.
   * @throws An error if the operation fails.
   */
  async markConversationAsRead(
    conversationId: string,
    userId: string
  ): Promise<void> {
    try {
      // Reset unread count atomically for this user
      await conversationService.updateConversation(conversationId, {
        [`unreadCounts.${userId}`]: 0,
      });

      // Still mark messages as read for read receipts
      const messagesRef = collection(
        db,
        "conversations",
        conversationId,
        "messages"
      );
      const q = query(messagesRef, limit(50));

      const querySnapshot = await getDocs(q);
      const batch: Promise<void>[] = [];

      querySnapshot.forEach((doc) => {
        const message = doc.data() as Message;
        if (!message.readBy[userId]) {
          batch.push(
            updateDoc(doc.ref, {
              [`readBy.${userId}`]: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
          );
        }
      });

      // Execute batch update
      await Promise.all(batch);
    } catch (error) {
      logger.debug("messages", "Error marking conversation as read:", error);
      throw error;
    }
  }

  /**
   * Subscribes to real-time updates for messages in a conversation.
   *
   * @param conversationId - The ID of the conversation to subscribe to.
   * @param callback - The function to call with the updated messages array.
   * @returns An `Unsubscribe` function to stop the listener.
   * @note This subscription is limited to the 100 most recent messages to
   * manage performance and data usage.
   */
  subscribeToMessages(
    conversationId: string,
    callback: (messages: Message[]) => void
  ): Unsubscribe {
    logger.info(
      "messages",
      `🔍 Setting up Firestore subscription for conversation: ${conversationId}`
    );

    // Use conversation-specific messages collection
    const messagesRef = collection(
      db,
      "conversations",
      conversationId,
      "messages"
    );
    const q = query(messagesRef, limit(100)); // Limit to prevent too much data

    return onSnapshot(
      q,
      (querySnapshot) => {
        logger.info(
          "messages",
          `✅ Firestore subscription success: ${querySnapshot.docs.length} messages for ${conversationId}`
        );

        const messages: Message[] = [];
        querySnapshot.forEach((doc) => {
          messages.push({
            id: doc.id,
            ...doc.data(),
          } as Message);
        });

        // Sort on client side until index is ready
        messages.sort((a, b) => {
          const aTime = a.timestamp?.toDate?.() || new Date(0);
          const bTime = b.timestamp?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        callback(messages);
      },
      (error) => {
        logger.error(
          "messages",
          `❌ Firestore subscription FAILED for conversation ${conversationId}:`,
          {
            error: error.message,
            code: error.code,
            conversationId,
            operation: "subscribeToMessages",
            query: "messages where conversationId == conversationId",
          }
        );
      }
    );
  }

  /**
   * Updates the typing status for a user in a conversation.
   *
   * This is used to show the "is typing..." indicator to other participants.
   *
   * @param conversationId - The ID of the conversation.
   * @param userId - The ID of the user whose typing status is being updated.
   * @param isTyping - A boolean indicating whether the user is typing.
   * @returns A promise that resolves when the status is updated.
   * @throws An error if the update fails.
   */
  async updateTypingStatus(
    conversationId: string,
    userId: string,
    isTyping: boolean
  ): Promise<void> {
    try {
      const typingRef = doc(
        collection(db, "conversations", conversationId, "typing"),
        userId
      );

      if (isTyping) {
        await setDoc(typingRef, {
          userId,
          isTyping: true,
          timestamp: serverTimestamp(),
        });
      } else {
        await setDoc(typingRef, {
          userId,
          isTyping: false,
          timestamp: serverTimestamp(),
        });
      }
    } catch (error) {
      logger.debug("messages", "Error updating typing status:", error);
      throw error;
    }
  }

  /**
   * Subscribes to real-time typing status updates in a conversation.
   *
   * @param conversationId - The ID of the conversation to monitor.
   * @param callback - A function to be called with an array of user IDs who are currently typing.
   * @returns An `Unsubscribe` function to stop the listener.
   */
  subscribeToTypingStatus(
    conversationId: string,
    callback: (typingUsers: string[]) => void
  ): Unsubscribe {
    logger.info(
      "messages",
      `🔍 Setting up typing subscription for conversation: ${conversationId}`
    );

    // Temporary: Use simple query without orderBy to avoid index requirement
    const typingRef = collection(db, "conversations", conversationId, "typing");
    const q = query(typingRef, where("isTyping", "==", true));

    return onSnapshot(
      q,
      (querySnapshot) => {
        logger.info(
          "messages",
          `✅ Typing subscription success: ${querySnapshot.docs.length} typing users for ${conversationId}`
        );

        const typingUsers: string[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data() as TypingStatus;
          if (data.isTyping) {
            typingUsers.push(data.userId);
          }
        });

        // Sort by timestamp on client side if needed
        typingUsers.sort((a, b) => {
          const aDoc = querySnapshot.docs.find(
            (doc) => doc.data().userId === a
          );
          const bDoc = querySnapshot.docs.find(
            (doc) => doc.data().userId === b
          );
          const aTime = aDoc?.data().timestamp?.toDate?.() || new Date(0);
          const bTime = bDoc?.data().timestamp?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        callback(typingUsers);
      },
      (error) => {
        logger.error(
          "messages",
          `❌ Typing subscription FAILED for conversation ${conversationId}:`,
          {
            error: error.message,
            code: error.code,
            conversationId,
            operation: "subscribeToTypingStatus",
            query: "typing where isTyping == true",
          }
        );
      }
    );
  }
}

export default new MessageService();
