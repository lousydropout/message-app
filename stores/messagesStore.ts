/**
 * @fileoverview Messages Store (Zustand) - The core of the real-time messaging system.
 *
 * This store is the most complex and central piece of the application's state
 * management. It orchestrates everything related to messaging, including fetching
 * and displaying conversations and messages, handling real-time updates through
 * Firestore subscriptions, managing an offline message queue, and synchronizing
 * data when the application comes back online.
 *
 * Key Architectural Patterns:
 * - **SQLite-first Loading**: For instant UI rendering, message and conversation
 *   data is first loaded from the local SQLite database. Firestore is then used
 *   to fetch any new or updated data.
 * - **Unified Message Flow**: The `sendMessage` action uses a "queue-first"
 *   approach. All outgoing messages are first written to the SQLite queue,
 *   providing an optimistic UI update. If the app is online, the queue is
 *   processed immediately; if offline, it waits for reconnection.
 * - **Real-time Subscriptions**: Manages Firestore listeners for both the list
 *   of conversations and the messages within the currently active conversation.
 * - **Memory Management**: Implements a "windowed" approach to messages, only
 *   keeping a certain number of recent messages in memory to prevent bloat.
 *
 * @see connectionStore for how this store's sync and queue processing logic is
 *      triggered by network state changes.
 * @see ConversationScreen and ConversationsList for the primary UI components
 *      that interact with this store.
 */

/**
 * @fileoverview Messages Store - Manages messages, conversations, and real-time subscriptions
 *
 * This store handles:
 * - Conversation list management with real-time subscriptions
 * - Message list management per conversation with SQLite caching
 * - Message sending with offline queue support
 * - Optimistic updates for instant UI feedback
 * - Read receipts and typing indicators
 * - Background message synchronization
 * - Queue processing for offline messages
 *
 * Key features:
 * - SQLite-first loading for instant display
 * - Firestore real-time subscriptions for updates
 * - Optimistic UI updates with fallback
 * - Automatic queue processing when online
 * - Pagination support for loading older messages
 * - Windowed message storage (10k messages per conversation)
 */

import conversationService from "@/services/conversationService";
import messageService from "@/services/messageService";
import sqliteService from "@/services/sqliteService";
import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { logger } from "@/stores/loggerStore";
import { useToastStore } from "@/stores/toastStore";
import { useUsersStore } from "@/stores/usersStore";
import { Conversation } from "@/types/Conversation";
import { Message } from "@/types/Message";
import * as Crypto from "expo-crypto";
import { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

/**
 * Maximum number of messages to keep in memory per conversation
 * Older messages are removed to prevent memory bloat
 */
const MAX_MESSAGES_IN_MEMORY = 10000;

/**
 * Mutex to prevent concurrent queue processing
 * Ensures messages are sent in order and prevents race conditions
 */
let queueProcessingMutex = false;

/**
 * Connection status getter function
 * Set by connection store to allow checking online status
 */
let getConnectionStatus: (() => { isOnline: boolean }) | null = null;

/**
 * Register a function to get connection status
 *
 * Allows the messages store to check online status for decision-making
 * (e.g., whether to queue messages or send immediately)
 *
 * @param getter - Function that returns connection status
 */
export const setConnectionStatusGetter = (
  getter: () => { isOnline: boolean }
) => {
  getConnectionStatus = getter;
};

export interface MessagesState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  loading: boolean;
  sendingMessage: boolean;
  subscriptions: {
    conversations?: Unsubscribe;
    messages?: Unsubscribe;
    typing?: Unsubscribe;
  };
  paginationState: Record<
    string,
    {
      hasMoreMessages: boolean;
      isLoadingOlder: boolean;
    }
  >;

  // Actions
  loadConversations: (userId: string) => Promise<void>;
  subscribeToConversations: (userId: string) => void;
  setCurrentConversation: (conversationId: string | null) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  subscribeToMessages: (conversationId: string) => void;
  sendMessage: (conversationId: string, text: string) => Promise<void>;
  retryMessage: (conversationId: string, messageId: string) => Promise<void>;
  markAsRead: (conversationId: string, userId: string) => Promise<void>;
  updateTyping: (conversationId: string, isTyping: boolean) => Promise<void>;
  createOrOpenDirectConversation: (otherUserId: string) => Promise<string>;
  createGroupConversation: (
    participantIds: string[],
    name: string
  ) => Promise<string>;
  processQueue: () => Promise<void>;
  syncMissedMessages: () => Promise<void>;
  loadConversationMessages: (conversationId: string) => Promise<void>;
  unloadConversationMessages: (conversationId: string) => void;
  syncNewMessagesForConversation: (conversationId: string) => Promise<void>;
  clearSubscriptions: () => void;
  clearAllData: () => void;
  getTotalUnreadCount: (userId: string) => number;
  loadOlderMessages: (conversationId: string) => Promise<void>;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: {},
  typingUsers: {},
  loading: false,
  sendingMessage: false,
  subscriptions: {},
  paginationState: {},

  async loadConversations(userId: string) {
    set({ loading: true });
    try {
      const conversations = await conversationService.getUserConversations(
        userId
      );
      set({ conversations, loading: false });
    } catch (error) {
      logger.error("messages", "Error loading conversations", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      set({ loading: false });
      throw error;
    }
  },

  /**
   * Subscribes to real-time updates for the user's conversations.
   *
   * This sets up a Firestore listener that keeps the `conversations` array in
   * the store synchronized with the backend. It also includes logic to show
   * toast notifications for new messages in conversations that are not currently
   * active, and it pre-fetches and caches the profiles of all conversation
   * participants for better performance.
   *
   * @param userId The ID of the current user.
   */
  subscribeToConversations(userId: string) {
    const { subscriptions } = get();

    // Clear existing subscription
    if (subscriptions.conversations) {
      subscriptions.conversations();
    }

    logger.debug(
      "messages",
      `Subscribing to conversations for user: ${userId}`
    );

    const unsubscribe = conversationService.subscribeToConversations(
      userId,
      async (conversations) => {
        logger.debug(
          "messages",
          `Received ${conversations.length} conversations`,
          conversations.map((c) => ({
            id: c.id,
            type: c.type,
            name: c.name,
            participants: c.participants.length,
            unreadCounts: c.unreadCounts,
          }))
        );

        // Check for new messages to show toast
        const { currentConversationId } = get();
        const { addToast } = useToastStore.getState();
        const { user } = useAuthStore.getState();

        // Get previous conversations to detect changes
        const { conversations: previousConversations } = get();

        // Create a map of previous conversations for quick lookup
        const previousConversationsMap = new Map(
          previousConversations.map((conv) => [conv.id, conv])
        );

        // Check each conversation for new messages
        for (const conversation of conversations) {
          const previousConversation = previousConversationsMap.get(
            conversation.id
          );

          // Only show toast if:
          // 1. User is not currently viewing this conversation
          // 2. This conversation has a lastMessage
          // 3. The lastMessage is different from the previous one (new message)
          // 4. The message is not from the current user
          if (
            currentConversationId !== conversation.id &&
            conversation.lastMessage &&
            conversation.lastMessage.senderId !== user?.uid &&
            (!previousConversation?.lastMessage ||
              previousConversation.lastMessage.id !==
                conversation.lastMessage.id)
          ) {
            try {
              // Get sender profile
              const senderProfile = await userService.getUserProfile(
                conversation.lastMessage.senderId
              );
              const senderName = senderProfile?.displayName || "Unknown User";

              addToast({
                type: "message",
                title: senderName,
                message: conversation.lastMessage.text,
                conversationId: conversation.id,
                senderId: conversation.lastMessage.senderId,
                senderName,
              });
            } catch (error) {
              logger.error(
                "messages",
                "Error getting sender profile for toast:",
                error
              );
            }
          }
        }

        // Update conversations state
        set({ conversations });

        // Save conversations to SQLite for offline access
        for (const conversation of conversations) {
          try {
            await sqliteService.saveConversation(conversation);
          } catch (error) {
            logger.debug("messages", "Failed to save conversation to SQLite", {
              conversationId: conversation.id,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        // Pre-populate user profiles for all conversation participants
        const allParticipantIds = new Set<string>();
        conversations.forEach((conv) => {
          conv.participants.forEach((pid) => allParticipantIds.add(pid));
        });

        // Fetch and cache all participant profiles
        if (allParticipantIds.size > 0) {
          try {
            await userService.getUsersByIds(Array.from(allParticipantIds));

            // Subscribe to real-time updates for all participants
            const { subscribeToUsers } = useUsersStore.getState();
            subscribeToUsers(Array.from(allParticipantIds));
          } catch (error) {
            logger.debug("messages", "Failed to cache participant profiles", {
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        // Background sync: For each conversation with unread messages, sync new messages
        for (const conversation of conversations) {
          const unreadCount = conversation.unreadCounts?.[userId] || 0;
          if (unreadCount > 0) {
            // Don't await - run in background
            get()
              .syncNewMessagesForConversation(conversation.id)
              .catch((error) => {
                logger.debug("messages", "Background sync failed", {
                  conversationId: conversation.id,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                });
              });
          }
        }
      }
    );

    set({
      subscriptions: {
        ...subscriptions,
        conversations: unsubscribe,
      },
    });
  },

  /**
   * Sets the currently active conversation and manages message subscriptions.
   *
   * When a conversation is selected, this action clears any existing message
   * and typing subscriptions and prepares the store for loading the new
   * conversation's messages.
   *
   * @param conversationId The ID of the conversation to set as current, or `null` to clear.
   */
  setCurrentConversation(conversationId: string | null) {
    set({ currentConversationId: conversationId });

    // Clear existing message subscription
    const { subscriptions } = get();
    if (subscriptions.messages) {
      subscriptions.messages();
    }
    if (subscriptions.typing) {
      subscriptions.typing();
    }

    set({
      subscriptions: {
        ...subscriptions,
        messages: undefined,
        typing: undefined,
      },
    });
  },

  /**
   * Loads the messages for a conversation, using a "SQLite-first" strategy.
   *
   * @param conversationId The ID of the conversation to load messages for.
   * @returns A promise that resolves when the messages are loaded.
   * @throws An error if the loading fails.
   */
  async loadMessages(conversationId: string) {
    set({ loading: true });
    try {
      // Load from SQLite first for instant display
      if (sqliteService.isInitialized()) {
        try {
          const sqliteMessages = await sqliteService.getMessages(
            conversationId
          );
          if (sqliteMessages.length > 0) {
            logger.debug(
              "messages",
              `Loaded ${sqliteMessages.length} messages from SQLite`
            );
            set((state) => ({
              messages: {
                ...state.messages,
                [conversationId]: sqliteMessages,
              },
              loading: false,
            }));
          }
        } catch (sqliteError) {
          logger.warning(
            "messages",
            "SQLite load failed, falling back to Firestore",
            {
              error:
                sqliteError instanceof Error
                  ? sqliteError.message
                  : "Unknown error",
            }
          );
        }
      }

      // Then load from Firestore to sync any new messages
      const messages = await messageService.getMessages(conversationId);

      // Save to SQLite for future instant loading
      if (sqliteService.isInitialized()) {
        for (const message of messages) {
          await sqliteService.saveMessage(message);
        }
      }

      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: messages,
        },
        loading: false,
      }));
    } catch (error) {
      logger.error("messages", "Error loading messages", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      set({ loading: false });
      throw error;
    }
  },

  /**
   * Subscribes to real-time message and typing status updates for a conversation.
   *
   * This is a key method for the real-time chat experience. It sets up
   * Firestore listeners for new messages and typing indicators. The message
   * listener is highly optimized: it batch-saves incoming messages to SQLite,
   * efficiently merges new messages and read receipt updates into the Zustand
   * state, and automatically marks new messages as read if the user is
   * currently viewing the conversation.
   *
   * @param conversationId The ID of the conversation to subscribe to.
   */
  subscribeToMessages(conversationId: string) {
    const startTime = Date.now();
    logger.info(
      "messages",
      `🌐 Starting Firestore subscription for ${conversationId}`
    );

    const { subscriptions } = get();

    // Clear existing subscriptions
    const cleanupStartTime = Date.now();
    if (subscriptions.messages) {
      subscriptions.messages();
    }
    if (subscriptions.typing) {
      subscriptions.typing();
    }
    const cleanupEndTime = Date.now();
    logger.info(
      "messages",
      `🧹 Subscription cleanup completed in ${
        cleanupEndTime - cleanupStartTime
      }ms`
    );

    // Subscribe to messages
    const subscriptionStartTime = Date.now();
    const messagesUnsubscribe = messageService.subscribeToMessages(
      conversationId,
      async (messages) => {
        const callbackStartTime = Date.now();
        logger.info(
          "messages",
          `📨 Firestore callback received ${messages.length} messages`
        );

        // First: Save ALL messages to SQLite
        const sqliteSaveStartTime = Date.now();
        await sqliteService.saveMessagesBatch(messages);
        const sqliteSaveEndTime = Date.now();
        logger.info(
          "messages",
          `💾 SQLite batch save completed in ${
            sqliteSaveEndTime - sqliteSaveStartTime
          }ms`
        );

        // Second: Update Zustand state with new messages AND read receipt updates
        const zustandUpdateStartTime = Date.now();
        set((state) => {
          const currentMessages = state.messages[conversationId] || [];

          // Find messages that are truly new (not already in current state)
          const newMessages = messages.filter(
            (newMsg) =>
              !currentMessages.some(
                (existingMsg) => existingMsg.id === newMsg.id
              )
          );

          // Auto-mark new messages as read if user is viewing this conversation
          const { user } = useAuthStore.getState();
          if (newMessages.length > 0 && user) {
            // Mark new messages as read asynchronously (don't block state update)
            Promise.all(
              newMessages
                .filter((msg) => !msg.readBy[user.uid]) // Only mark if not already read
                .map((msg) =>
                  messageService.markMessageAsRead(
                    msg.id,
                    user.uid,
                    conversationId
                  )
                )
            ).catch((error) => {
              logger.debug(
                "messages",
                "Error auto-marking new messages as read:",
                error
              );
            });
          }

          // Find existing messages that have read receipt updates
          const updatedMessages = currentMessages.map((existingMsg) => {
            const firestoreMsg = messages.find(
              (msg) => msg.id === existingMsg.id
            );
            if (
              firestoreMsg &&
              JSON.stringify(firestoreMsg.readBy) !==
                JSON.stringify(existingMsg.readBy)
            ) {
              // Read receipts have been updated
              return { ...existingMsg, readBy: firestoreMsg.readBy };
            }
            return existingMsg;
          });

          if (newMessages.length === 0) {
            // No new messages, but check if we have read receipt updates
            const hasReadReceiptUpdates = updatedMessages.some(
              (msg, index) => msg !== currentMessages[index]
            );

            if (!hasReadReceiptUpdates) {
              // No updates at all, keep current state unchanged
              return state;
            }

            // Only read receipt updates, return updated messages
            return {
              messages: {
                ...state.messages,
                [conversationId]: updatedMessages,
              },
            };
          }

          // Merge new messages with existing ones
          const mergedMessages = [...updatedMessages, ...newMessages];

          // Sort by timestamp and keep only recent messages
          const recentMessages = mergedMessages
            .sort((a, b) => {
              const aTime = a.timestamp?.toDate?.() || new Date(0);
              const bTime = b.timestamp?.toDate?.() || new Date(0);
              return bTime.getTime() - aTime.getTime(); // Newest first
            })
            .slice(0, MAX_MESSAGES_IN_MEMORY);

          return {
            messages: {
              ...state.messages,
              [conversationId]: recentMessages,
            },
          };
        });
        const zustandUpdateEndTime = Date.now();
        logger.info(
          "messages",
          `🔄 Zustand update completed in ${
            zustandUpdateEndTime - zustandUpdateStartTime
          }ms`
        );

        const callbackTotalTime = Date.now() - callbackStartTime;
        logger.info(
          "messages",
          `✅ Firestore callback completed in ${callbackTotalTime}ms`
        );
      }
    );

    // Subscribe to typing status
    const typingUnsubscribe = messageService.subscribeToTypingStatus(
      conversationId,
      (typingUsers) => {
        set((state) => ({
          typingUsers: {
            ...state.typingUsers,
            [conversationId]: typingUsers,
          },
        }));
      }
    );

    set({
      subscriptions: {
        ...subscriptions,
        messages: messagesUnsubscribe,
        typing: typingUnsubscribe,
      },
    });

    const subscriptionSetupEndTime = Date.now();
    logger.info(
      "messages",
      `🌐 Firestore subscription setup completed in ${
        subscriptionSetupEndTime - subscriptionStartTime
      }ms`
    );

    const totalSubscriptionTime = Date.now() - startTime;
    logger.info(
      "messages",
      `✅ subscribeToMessages completed in ${totalSubscriptionTime}ms`
    );
  },

  /**
   * Sends a message using a unified, offline-first flow.
   *
   * This action implements a "queue-first" strategy:
   * 1. A unique UUID is generated for the message.
   * 2. The message is immediately saved to the SQLite `queued_messages` table.
   * 3. An optimistic update is applied to the UI, showing the message in a "sending" or "queued" state.
   * 4. If the app is online, the queue processing is triggered immediately.
   * 5. If offline, the message remains in the queue to be sent upon reconnection.
   *
   * This approach ensures a fast, responsive UI and reliable message delivery.
   *
   * @param conversationId The ID of the conversation to send the message to.
   * @param text The content of the message.
   * @returns A promise that resolves when the message has been queued and the UI has been updated.
   * @throws An error if the user is not authenticated or if the queuing operation fails.
   */
  async sendMessage(conversationId: string, text: string) {
    const { user } = useAuthStore.getState();
    if (!user) throw new Error("User not authenticated");

    const isOnline = getConnectionStatus?.()?.isOnline ?? true;
    set({ sendingMessage: true });
    const messageId = Crypto.randomUUID(); // Generate UUID for message

    logger.info("messages", "Starting to send message", {
      messageId,
      conversationId,
      senderId: user.uid,
      isOnline,
      textLength: text.length,
    });

    try {
      // Always queue first (unified flow - works online and offline)
      if (sqliteService.isInitialized()) {
        await sqliteService.queueMessage(
          messageId,
          conversationId,
          user.uid,
          text
        );
      }

      // Optimistic update - add message to local state immediately for instant UI feedback
      const tempMessage: Message = {
        id: messageId,
        conversationId,
        senderId: user.uid,
        text,
        timestamp: new Date() as any,
        readBy: { [user.uid]: new Date() as any },
        status: isOnline ? "sending" : "queued",
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
      };

      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: [
            tempMessage,
            ...(state.messages[conversationId] || []),
          ],
        },
      }));

      // If online: process queue immediately to send to Firestore
      if (isOnline) {
        logger.debug("messages", "Processing queue immediately (online)", {
          messageId,
          conversationId,
        });
        await get().processQueue();

        logger.info("messages", "Message sent successfully", {
          messageId,
          conversationId,
        });
      } else {
        logger.info("messages", "Message queued (offline)", { messageId });

        // Update queue count in connection store to show user status
        const { updateQueueCounts } = useConnectionStore.getState();
        const currentStats = useConnectionStore.getState();
        updateQueueCounts(
          currentStats.queuedMessagesCount + 1,
          currentStats.failedMessagesCount
        );
      }

      set({ sendingMessage: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("messages", "Failed to send message", {
        messageId,
        conversationId,
        error: errorMessage,
      });

      // Mark message as failed
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]:
            state.messages[conversationId]?.map((msg) =>
              msg.id === messageId ? { ...msg, status: "failed" } : msg
            ) || [],
        },
        sendingMessage: false,
      }));

      // Update queued message with error
      if (sqliteService.isInitialized()) {
        try {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          await sqliteService.updateQueuedMessageRetry(messageId, errorMessage);
        } catch (sqliteError) {
          logger.warning("messages", "Failed to update queued message retry", {
            error:
              sqliteError instanceof Error
                ? sqliteError.message
                : "Unknown error",
          });
        }
      }

      throw error;
    }
  },

  /**
   * Retries sending a message that has previously failed.
   *
   * @param conversationId The ID of the conversation the message belongs to.
   * @param messageId The ID of the failed message.
   * @returns A promise that resolves when the retry attempt is complete.
   * @throws An error if the message is not in a failed state or if the retry fails.
   */
  async retryMessage(conversationId: string, messageId: string) {
    const { user } = useAuthStore.getState();
    if (!user) throw new Error("User not authenticated");

    const state = get();
    const messages = state.messages[conversationId] || [];
    const failedMessage = messages.find((msg) => msg.id === messageId);

    if (!failedMessage || failedMessage.status !== "failed") {
      throw new Error("Message not found or not in failed state");
    }

    // Change status to sending
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]:
          state.messages[conversationId]?.map((msg) =>
            msg.id === messageId ? { ...msg, status: "sending" } : msg
          ) || [],
      },
    }));

    try {
      // Send the message again
      const message = await messageService.sendMessage(
        messageId,
        conversationId,
        user.uid,
        failedMessage.text
      );

      // Remove failed message and add new confirmed message
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: [
            { ...message, status: "sent" },
            ...(state.messages[conversationId]?.filter(
              (msg) => msg.id !== messageId
            ) || []),
          ],
        },
      }));
    } catch (error) {
      logger.error("messages", "Error retrying message", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Revert to failed status
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]:
            state.messages[conversationId]?.map((msg) =>
              msg.id === messageId ? { ...msg, status: "failed" } : msg
            ) || [],
        },
      }));
      throw error;
    }
  },

  /**
   * Marks all messages in a conversation as read by the current user.
   *
   * @param conversationId The ID of the conversation.
   * @param userId The ID of the current user.
   * @returns A promise that resolves when the operation is complete.
   * @throws An error if the operation fails.
   */
  async markAsRead(conversationId: string, userId: string) {
    try {
      await messageService.markConversationAsRead(conversationId, userId);

      // Update SQLite with read status
      if (sqliteService.isInitialized()) {
        await sqliteService.markConversationAsRead(conversationId, userId);
      }

      // Update local state to reflect read status
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]:
            state.messages[conversationId]?.map((message) => ({
              ...message,
              readBy: {
                ...message.readBy,
                [userId]: new Date() as any, // Mark as read locally
              },
            })) || [],
        },
      }));
    } catch (error) {
      logger.error("messages", "Error marking conversation as read", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },

  /**
   * Updates the read receipts for a specific message in the local state.
   *
   * @param conversationId The ID of the conversation.
   * @param messageId The ID of the message to update.
   * @param readBy The new `readBy` map for the message.
   * @private
   */
  async updateMessageReadReceipts(
    conversationId: string,
    messageId: string,
    readBy: { [userId: string]: any }
  ) {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]:
          state.messages[conversationId]?.map((message) =>
            message.id === messageId ? { ...message, readBy } : message
          ) || [],
      },
    }));
  },

  /**
   * Updates the current user's typing status in a conversation.
   *
   * @param conversationId The ID of the conversation.
   * @param isTyping A boolean indicating whether the user is typing.
   * @returns A promise that resolves when the typing status is updated in Firestore.
   */
  async updateTyping(conversationId: string, isTyping: boolean) {
    const { user } = useAuthStore.getState();
    if (!user) return;

    try {
      await messageService.updateTypingStatus(
        conversationId,
        user.uid,
        isTyping
      );
    } catch (error) {
      logger.debug("messages", "Error updating typing status", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  /**
   * Creates a new direct conversation with another user, or opens it if it already exists.
   *
   * @param otherUserId The ID of the other user in the conversation.
   * @returns A promise that resolves to the ID of the direct conversation.
   * @throws An error if the current user is not authenticated or if the operation fails.
   */
  async createOrOpenDirectConversation(otherUserId: string): Promise<string> {
    const { user } = useAuthStore.getState();
    if (!user) throw new Error("User not authenticated");

    try {
      const conversationId =
        await conversationService.getOrCreateDirectConversation(
          user.uid,
          otherUserId
        );

      // Reload conversations to include the new one
      await get().loadConversations(user.uid);

      return conversationId;
    } catch (error) {
      logger.error("messages", "Error creating direct conversation", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },

  /**
   * Creates a new group conversation.
   *
   * @param participantIds An array of user IDs to include in the group.
   * @param name The name of the group.
   * @returns A promise that resolves to the ID of the new group conversation.
   * @throws An error if the current user is not authenticated or if the operation fails.
   */
  async createGroupConversation(
    participantIds: string[],
    name: string
  ): Promise<string> {
    const { user } = useAuthStore.getState();
    if (!user) throw new Error("User not authenticated");

    try {
      const allParticipants = [user.uid, ...participantIds];
      const conversationId = await conversationService.createConversation(
        allParticipants,
        "group",
        name
      );

      // Reload conversations to include the new one
      await get().loadConversations(user.uid);

      return conversationId;
    } catch (error) {
      logger.error("messages", "Error creating group conversation", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },

  /**
   * Processes the offline message queue, sending any pending messages to Firestore.
   *
   * This is a critical function for the app's offline-first architecture. It is
   * designed to be robust, with features such as:
   * - A mutex to prevent concurrent processing.
   * - Pre-checks for network connectivity and user authentication.
   * - Sequential processing to maintain message order.
   * - Error handling and retry logic for individual messages.
   *
   * @returns A promise that resolves when the queue processing is complete.
   */
  async processQueue() {
    // Prevent concurrent queue processing (mutex pattern)
    if (queueProcessingMutex) {
      logger.debug(
        "messages",
        "Queue processing already in progress, skipping",
        {
          timestamp: Date.now(),
        }
      );
      return;
    }

    const { user } = useAuthStore.getState();
    if (!user) {
      logger.warning(
        "messages",
        "Cannot process queue: User not authenticated",
        {
          timestamp: Date.now(),
        }
      );
      return;
    }

    const isOnline = getConnectionStatus?.()?.isOnline ?? true;
    const { firestoreConnected } = useConnectionStore.getState();

    // Validate prerequisites before processing
    if (!isOnline) {
      logger.debug("messages", "Cannot process queue: Currently offline", {
        timestamp: Date.now(),
      });
      return;
    }

    if (!firestoreConnected) {
      logger.debug(
        "messages",
        "Cannot process queue: Firestore not connected",
        {
          timestamp: Date.now(),
        }
      );
      return;
    }

    if (!sqliteService.isInitialized()) {
      logger.warning(
        "messages",
        "Cannot process queue: SQLite not initialized",
        {
          timestamp: Date.now(),
        }
      );
      return;
    }

    // Set mutex immediately to prevent race conditions
    queueProcessingMutex = true;

    try {
      logger.info("messages", "Starting to process message queue", {
        userId: user.uid,
        timestamp: Date.now(),
      });
      // Note: Sync status will be managed by connection store callbacks

      const queuedMessages = await sqliteService.getQueuedMessages();
      logger.info("messages", "Retrieved queued messages", {
        queuedCount: queuedMessages.length,
        timestamp: Date.now(),
      });

      if (queuedMessages.length === 0) {
        logger.debug("messages", "No queued messages to process", {
          timestamp: Date.now(),
        });
        // Note: Sync status will be managed by connection store callbacks
        return;
      }

      let successCount = 0;
      let failedCount = 0;

      // Process messages sequentially to maintain order
      for (let i = 0; i < queuedMessages.length; i++) {
        const queued = queuedMessages[i];

        logger.debug(
          "messages",
          `Processing message ${i + 1} of ${queuedMessages.length}`,
          {
            messageId: queued.messageId,
            conversationId: queued.conversationId,
            timestamp: Date.now(),
          }
        );

        try {
          logger.debug("messages", "Processing queued message", {
            messageId: queued.messageId,
            conversationId: queued.conversationId,
            timestamp: Date.now(),
          });

          // Check if conversation exists before sending message
          const conversation = await conversationService.getConversation(
            queued.conversationId
          );
          if (!conversation) {
            logger.warning(
              "messages",
              `Conversation ${queued.conversationId} not found, skipping message ${queued.messageId}`,
              {
                conversationId: queued.conversationId,
                messageId: queued.messageId,
                timestamp: Date.now(),
              }
            );

            // Remove from queue since conversation doesn't exist
            await sqliteService.removeQueuedMessage(queued.messageId);

            // Update local state to mark as failed
            set((state) => {
              const currentMessages =
                state.messages[queued.conversationId] || [];
              return {
                messages: {
                  ...state.messages,
                  [queued.conversationId]: currentMessages.map((msg) =>
                    msg.id === queued.messageId
                      ? { ...msg, status: "failed" }
                      : msg
                  ),
                },
              };
            });

            failedCount++;
            continue;
          }

          logger.debug(
            "messages",
            "Conversation found, attempting to send message",
            {
              messageId: queued.messageId,
              conversationId: queued.conversationId,
              participantCount: conversation.participants.length,
              timestamp: Date.now(),
            }
          );

          // Send to Firestore with UUID
          const message = await messageService.sendMessage(
            queued.messageId,
            queued.conversationId,
            queued.senderId,
            queued.text
          );

          logger.info("messages", "Queued message sent successfully", {
            messageId: queued.messageId,
            conversationId: queued.conversationId,
            timestamp: Date.now(),
          });

          // Save to messages table
          await sqliteService.saveMessage(message);

          // Remove from queue
          await sqliteService.removeQueuedMessage(queued.messageId);

          // Update local state - replace temp message with real message
          set((state) => {
            const currentMessages = state.messages[queued.conversationId] || [];
            const tempMessageExists = currentMessages.some(
              (msg) => msg.id === queued.messageId
            );

            if (tempMessageExists) {
              // Replace temp message with real message
              return {
                messages: {
                  ...state.messages,
                  [queued.conversationId]: currentMessages.map((msg) =>
                    msg.id === queued.messageId
                      ? { ...message, status: "sent" as const }
                      : msg
                  ),
                },
              };
            } else {
              // Temp message not in state, add real message in correct position
              const newMessage = { ...message, status: "sent" as const };
              const updatedMessages = [...currentMessages];

              // Find correct position based on timestamp
              const insertIndex = updatedMessages.findIndex((msg) => {
                const msgTime = msg.timestamp?.toDate?.() || new Date(0);
                const newMsgTime =
                  newMessage.timestamp?.toDate?.() || new Date(0);
                return msgTime.getTime() < newMsgTime.getTime();
              });

              if (insertIndex === -1) {
                // New message is older than all existing messages, add to end
                updatedMessages.push(newMessage);
              } else {
                // Insert at the correct position
                updatedMessages.splice(insertIndex, 0, newMessage);
              }

              // Sort to ensure correct order
              updatedMessages.sort((a, b) => {
                const aTime = a.timestamp?.toDate?.() || new Date(0);
                const bTime = b.timestamp?.toDate?.() || new Date(0);
                return bTime.getTime() - aTime.getTime(); // Newest first
              });

              return {
                messages: {
                  ...state.messages,
                  [queued.conversationId]: updatedMessages,
                },
              };
            }
          });

          successCount++;
          logger.info("messages", "Queued message sent successfully", {
            messageId: queued.messageId,
            conversationId: queued.conversationId,
            timestamp: Date.now(),
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.debug("messages", "Failed to send queued message", {
            messageId: queued.messageId,
            conversationId: queued.conversationId,
            error: errorMessage,
            errorType:
              error instanceof Error ? error.constructor.name : typeof error,
            timestamp: Date.now(),
          });

          // Update retry count
          await sqliteService.updateQueuedMessageRetry(
            queued.messageId,
            errorMessage
          );
          failedCount++;

          // Mark message as failed in local state
          set((state) => ({
            messages: {
              ...state.messages,
              [queued.conversationId]:
                state.messages[queued.conversationId]?.map((msg) =>
                  msg.id === queued.messageId
                    ? { ...msg, status: "failed" }
                    : msg
                ) || [],
            },
          }));
        }

        // Small delay between messages to prevent overwhelming the system
        if (i < queuedMessages.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      // Update sync stats and queue counts
      const remainingQueued = await sqliteService.getQueuedMessages();
      const remainingFailed = await sqliteService
        .getQueuedMessages()
        .then((msgs) => msgs.filter((m) => m.retryCount >= 3).length);

      // Update connection store with current queue counts
      const { updateQueueCounts } = useConnectionStore.getState();
      updateQueueCounts(remainingQueued.length, remainingFailed);

      logger.info(
        "messages",
        `Queue processing complete: ${successCount} sent, ${failedCount} failed`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("messages", "Error processing queue", {
        error: errorMessage,
      });
      // Note: Error handling will be managed by connection store callbacks
    } finally {
      // Always clear the mutex
      queueProcessingMutex = false;
    }
  },

  /**
   * Fetches and caches any messages that were missed while the app was offline or in the background.
   *
   * This method iterates through all conversations, checks the last sync timestamp
   * for each, and fetches any new messages from Firestore.
   *
   * @returns A promise that resolves when the sync is complete.
   */
  async syncMissedMessages() {
    const { conversations } = get();

    for (const conv of Object.values(conversations)) {
      const lastSyncedAt = await sqliteService.getLastSyncedAt(conv.id);
      const newMessages = await messageService.getMessagesSince(
        conv.id,
        lastSyncedAt
      );

      // Save ALL to SQLite
      for (const msg of newMessages) {
        await sqliteService.saveMessageToCache(msg);
      }

      // Only add NEW messages to Zustand (if conversation is loaded)
      if (newMessages.length > 0) {
        set((state) => {
          const currentMessages = state.messages[conv.id] || [];
          const mergedMessages = [...currentMessages];

          for (const newMsg of newMessages) {
            const existingIndex = mergedMessages.findIndex(
              (m) => m.id === newMsg.id
            );

            if (existingIndex >= 0) {
              // Update existing message
              mergedMessages[existingIndex] = { ...newMsg, status: "sent" };
            } else {
              // New message - insert in correct chronological position
              const insertIndex = mergedMessages.findIndex((msg) => {
                const msgTime = msg.timestamp?.toDate?.() || new Date(0);
                const newMsgTime = newMsg.timestamp?.toDate?.() || new Date(0);
                return msgTime.getTime() < newMsgTime.getTime();
              });

              if (insertIndex === -1) {
                mergedMessages.push(newMsg);
              } else {
                mergedMessages.splice(insertIndex, 0, newMsg);
              }
            }
          }

          // Sort and trim to MAX_MESSAGES_IN_MEMORY
          mergedMessages.sort((a, b) => {
            const aTime = a.timestamp?.toDate?.() || new Date(0);
            const bTime = b.timestamp?.toDate?.() || new Date(0);
            return bTime.getTime() - aTime.getTime();
          });

          const trimmed = mergedMessages.slice(0, MAX_MESSAGES_IN_MEMORY);

          return {
            messages: {
              ...state.messages,
              [conv.id]: trimmed,
            },
          };
        });
      }

      // Update sync timestamp to max updatedAt from batch
      if (newMessages.length > 0) {
        const maxUpdatedAt = Math.max(
          ...newMessages.map((m) => m.updatedAt?.toMillis() || 0)
        );
        await sqliteService.setLastSyncedAt(conv.id, maxUpdatedAt);
      }
    }
  },

  /**
   * Loads the messages for a conversation into memory from the SQLite cache.
   *
   * This is the first step when opening a conversation. It provides an instant
   * view of the message history while a real-time subscription is being set up.
   *
   * @param conversationId The ID of the conversation to load.
   * @returns A promise that resolves when the messages are loaded into the store's state.
   */
  async loadConversationMessages(conversationId: string) {
    const startTime = Date.now();
    logger.info(
      "messages",
      `🚀 Starting conversation load for ${conversationId}`
    );

    // Load recent messages from SQLite cache
    const sqliteStartTime = Date.now();
    const messages = await sqliteService.loadRecentMessages(
      conversationId,
      MAX_MESSAGES_IN_MEMORY
    );
    const sqliteEndTime = Date.now();
    logger.info(
      "messages",
      `📱 SQLite load completed: ${messages.length} messages in ${
        sqliteEndTime - sqliteStartTime
      }ms`
    );

    // Add to Zustand
    const zustandStartTime = Date.now();
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: messages,
      },
      paginationState: {
        ...state.paginationState,
        [conversationId]: {
          hasMoreMessages: messages.length === MAX_MESSAGES_IN_MEMORY,
          isLoadingOlder: false,
        },
      },
    }));
    const zustandEndTime = Date.now();
    logger.info(
      "messages",
      `🔄 Zustand update completed in ${zustandEndTime - zustandStartTime}ms`
    );

    // Only initialize Firestore subscription if online
    const connectionStatus = getConnectionStatus?.();
    if (connectionStatus?.isOnline) {
      const firestoreStartTime = Date.now();
      logger.info("messages", `🌐 Starting Firestore subscription (online)`);
      get().subscribeToMessages(conversationId);
      const firestoreEndTime = Date.now();
      logger.info(
        "messages",
        `🌐 Firestore subscription initiated in ${
          firestoreEndTime - firestoreStartTime
        }ms`
      );
    } else {
      logger.info("messages", `📴 Skipping Firestore subscription - offline`);
    }

    const totalTime = Date.now() - startTime;
    logger.info("messages", `✅ Conversation load completed in ${totalTime}ms`);
  },

  /**
   * Loads older messages for a conversation from the SQLite cache for pagination.
   *
   * @param conversationId The ID of the conversation.
   * @returns A promise that resolves when the older messages are loaded and added to the state.
   */
  async loadOlderMessages(conversationId: string) {
    const state = get();
    const paginationState = state.paginationState[conversationId];

    if (!paginationState?.hasMoreMessages || paginationState.isLoadingOlder) {
      return;
    }

    // Set loading state
    set((state) => ({
      paginationState: {
        ...state.paginationState,
        [conversationId]: {
          ...state.paginationState[conversationId],
          isLoadingOlder: true,
        },
      },
    }));

    try {
      const currentMessages = state.messages[conversationId] || [];

      // Load older messages from SQLite using offset
      const olderMessages = await sqliteService.getMessages(
        conversationId,
        100, // Load 100 more messages
        currentMessages.length // Offset by current message count
      );

      if (olderMessages.length === 0) {
        // No more messages to load
        set((state) => ({
          paginationState: {
            ...state.paginationState,
            [conversationId]: {
              ...state.paginationState[conversationId],
              hasMoreMessages: false,
              isLoadingOlder: false,
            },
          },
        }));
        return;
      }

      // Merge older messages with existing ones
      const allMessages = [...currentMessages, ...olderMessages];

      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: allMessages,
        },
        paginationState: {
          ...state.paginationState,
          [conversationId]: {
            hasMoreMessages: olderMessages.length === 100, // If we got exactly 100, there might be more
            isLoadingOlder: false,
          },
        },
      }));

      logger.info(
        "messages",
        `Loaded ${olderMessages.length} older messages for ${conversationId}`
      );
    } catch (error) {
      logger.error("messages", "Error loading older messages:", error);
      set((state) => ({
        paginationState: {
          ...state.paginationState,
          [conversationId]: {
            ...state.paginationState[conversationId],
            isLoadingOlder: false,
          },
        },
      }));
    }
  },

  /**
   * Performs a background sync of new messages for a single conversation.
   *
   * This is typically triggered when the conversation list is updated and shows
   * an unread count for a conversation that is not currently active.
   *
   * @param conversationId The ID of the conversation to sync.
   * @returns A promise that resolves when the sync is complete.
   */
  async syncNewMessagesForConversation(conversationId: string) {
    try {
      // Don't sync if not online
      const connectionStatus = getConnectionStatus?.();
      if (!connectionStatus?.isOnline) {
        return;
      }

      // 1. Get latest timestamp from SQLite
      const latestTimestamp = await sqliteService.getLatestMessageTimestamp(
        conversationId
      );

      // 2. Query Firestore for messages since that timestamp
      const newMessages = await messageService.getMessagesSince(
        conversationId,
        latestTimestamp,
        100 // Reasonable limit for background sync
      );

      if (newMessages.length === 0) {
        return; // No new messages
      }

      // 3. Batch upsert to SQLite (deduplicated by id)
      await sqliteService.saveMessagesBatch(newMessages);

      logger.info(
        "messages",
        `Background synced ${newMessages.length} messages for conversation ${conversationId}`
      );
    } catch (error) {
      logger.debug("messages", "Failed to sync new messages", {
        conversationId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Don't throw - background sync failure shouldn't break the app
    }
  },

  /**
   * Unloads a conversation's messages from memory and unsubscribes from its real-time updates.
   *
   * This is a crucial memory management function that is called when the user
   * navigates away from a conversation screen.
   *
   * @param conversationId The ID of the conversation to unload.
   */
  unloadConversationMessages(conversationId: string) {
    const { subscriptions } = get();

    // Unsubscribe from Firestore listeners for this conversation
    if (subscriptions.messages) {
      subscriptions.messages();
    }
    if (subscriptions.typing) {
      subscriptions.typing();
    }

    // Clear subscriptions
    set({
      subscriptions: {},
    });

    // Remove messages from Zustand
    set((state) => {
      const { [conversationId]: removed, ...rest } = state.messages;
      return { messages: rest };
    });
  },

  /**
   * Unsubscribes from all active Firestore listeners.
   */
  clearSubscriptions() {
    const { subscriptions } = get();

    if (subscriptions.conversations) {
      subscriptions.conversations();
    }
    if (subscriptions.messages) {
      subscriptions.messages();
    }
    if (subscriptions.typing) {
      subscriptions.typing();
    }

    set({
      subscriptions: {},
    });
  },

  /**
   * Clears all data from the store, including conversations, messages, and subscriptions.
   *
   * This is called during the logout process to ensure a clean state for the next user.
   */
  clearAllData() {
    // Clear all subscriptions
    get().clearSubscriptions();

    // Clear all state
    set({
      conversations: [],
      currentConversationId: null,
      messages: {},
      typingUsers: {},
      loading: false,
      sendingMessage: false,
    });
  },

  /**
   * Calculates the total number of unread messages for the current user across all conversations.
   *
   * @param userId The ID of the current user.
   * @returns The total unread message count.
   */
  getTotalUnreadCount(userId: string) {
    const { conversations } = get();
    return conversations.reduce((total, conversation) => {
      const unreadCount = conversation.unreadCounts?.[userId] || 0;
      return total + unreadCount;
    }, 0);
  },
}));

/**
 * Sets up the necessary callbacks between the messages store and the connection store.
 *
 * This function registers the `processQueue` and `syncMissedMessages` actions
 * as network event callbacks, so they are automatically executed when the
 * application comes back online.
 *
 * @param registerCallback The `registerNetworkCallback` function from the connection store.
 * @returns An `unsubscribe` function to remove the callbacks.
 */
export const setupMessagesStoreCallbacks = (
  registerCallback: (callback: () => Promise<void>) => () => void
) => {
  // Register the sync callback
  const unsubscribeSync = registerCallback(async () => {
    logger.info("messages", "Processing queued messages");
    await useMessagesStore.getState().processQueue();

    logger.info("messages", "Syncing missed messages");
    await useMessagesStore.getState().syncMissedMessages();
  });

  return unsubscribeSync;
};
