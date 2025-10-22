import conversationService from "@/services/conversationService";
import messageService from "@/services/messageService";
import sqliteService from "@/services/sqliteService";
import { useAuthStore } from "@/stores/authStore";
import { Conversation } from "@/types/Conversation";
import { Message } from "@/types/Message";
import * as Crypto from "expo-crypto";
import { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

// Constants
const MAX_MESSAGES_IN_MEMORY = 200; // Window size per conversation

// Mutex to prevent concurrent queue processing
let queueProcessingMutex = false;

// Connection status getter - will be set by connection store
let getConnectionStatus: (() => { isOnline: boolean }) | null = null;

// Function to register connection status getter
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
  clearSubscriptions: () => void;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: {},
  typingUsers: {},
  loading: false,
  sendingMessage: false,
  subscriptions: {},

  async loadConversations(userId: string) {
    set({ loading: true });
    try {
      const conversations = await conversationService.getUserConversations(
        userId
      );
      set({ conversations, loading: false });
    } catch (error) {
      console.error("Error loading conversations:", error);
      set({ loading: false });
      throw error;
    }
  },

  subscribeToConversations(userId: string) {
    const { subscriptions } = get();

    // Clear existing subscription
    if (subscriptions.conversations) {
      subscriptions.conversations();
    }

    console.log(`[DEBUG] Subscribing to conversations for user: ${userId}`);

    const unsubscribe = conversationService.subscribeToConversations(
      userId,
      (conversations) => {
        console.log(
          `[DEBUG] Received ${conversations.length} conversations:`,
          conversations.map((c) => ({
            id: c.id,
            type: c.type,
            name: c.name,
            participants: c.participants.length,
            unreadCounts: c.unreadCounts,
          }))
        );
        set({ conversations });
      }
    );

    set({
      subscriptions: {
        ...subscriptions,
        conversations: unsubscribe,
      },
    });
  },

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
            console.log(
              `📦 Loaded ${sqliteMessages.length} messages from SQLite`
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
          console.warn(
            "SQLite load failed, falling back to Firestore:",
            sqliteError
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
      console.error("Error loading messages:", error);
      set({ loading: false });
      throw error;
    }
  },

  subscribeToMessages(conversationId: string) {
    const { subscriptions } = get();

    // Clear existing subscriptions
    if (subscriptions.messages) {
      subscriptions.messages();
    }
    if (subscriptions.typing) {
      subscriptions.typing();
    }

    // Subscribe to messages
    const messagesUnsubscribe = messageService.subscribeToMessages(
      conversationId,
      async (messages) => {
        // First: Save ALL messages to SQLite
        for (const msg of messages) {
          await sqliteService.saveMessage(msg);
        }

        // Second: Update Zustand window (only most recent 200)
        set((state) => {
          const currentMessages = state.messages[conversationId] || [];
          const mergedMessages = [...currentMessages];

          for (const newMsg of messages) {
            const existingIndex = mergedMessages.findIndex(
              (m) => m.id === newMsg.id
            );

            if (existingIndex >= 0) {
              // Update existing message (replace in-place)
              mergedMessages[existingIndex] = { ...newMsg, status: "sent" };
            } else {
              // New message - insert in correct chronological position
              // Find the correct position based on timestamp
              const insertIndex = mergedMessages.findIndex((msg) => {
                const msgTime = msg.timestamp?.toDate?.() || new Date(0);
                const newMsgTime = newMsg.timestamp?.toDate?.() || new Date(0);
                return msgTime.getTime() < newMsgTime.getTime();
              });

              if (insertIndex === -1) {
                // New message is older than all existing messages, add to end
                mergedMessages.push(newMsg);
              } else {
                // Insert at the correct position
                mergedMessages.splice(insertIndex, 0, newMsg);
              }
            }
          }

          // Sort all messages by timestamp to ensure correct order
          mergedMessages.sort((a, b) => {
            const aTime = a.timestamp?.toDate?.() || new Date(0);
            const bTime = b.timestamp?.toDate?.() || new Date(0);
            return bTime.getTime() - aTime.getTime(); // Newest first
          });

          // Trim to MAX_MESSAGES_IN_MEMORY
          const trimmed = mergedMessages.slice(0, MAX_MESSAGES_IN_MEMORY);

          return {
            messages: {
              ...state.messages,
              [conversationId]: trimmed,
            },
          };
        });
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
  },

  async sendMessage(conversationId: string, text: string) {
    const { user } = useAuthStore.getState();
    if (!user) throw new Error("User not authenticated");

    const isOnline = getConnectionStatus?.()?.isOnline ?? true;
    set({ sendingMessage: true });
    const messageId = Crypto.randomUUID(); // Generate UUID for message

    try {
      // Always queue first (unified flow)
      if (sqliteService.isInitialized()) {
        await sqliteService.queueMessage(
          messageId,
          conversationId,
          user.uid,
          text
        );
      }

      // Optimistic update - add message to local state immediately
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

      // If online: process queue immediately
      if (isOnline) {
        console.log("📡 Online: Processing queue immediately");
        await get().processQueue();
      } else {
        console.log("📴 Offline: Message queued");
        // Note: Queue count updates will be handled by connection store callbacks
      }

      set({ sendingMessage: false });
    } catch (error) {
      console.error("Error sending message:", error);

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
          console.warn("Failed to update queued message retry:", sqliteError);
        }
      }

      throw error;
    }
  },

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
      console.error("Error retrying message:", error);

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

  async markAsRead(conversationId: string, userId: string) {
    try {
      await messageService.markConversationAsRead(conversationId, userId);

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
              // Update status to 'read' if this user is not the sender
              status: message.senderId !== userId ? "read" : message.status,
            })) || [],
        },
      }));
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      throw error;
    }
  },

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
      console.error("Error updating typing status:", error);
    }
  },

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
      console.error("Error creating direct conversation:", error);
      throw error;
    }
  },

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
      console.error("Error creating group conversation:", error);
      throw error;
    }
  },

  async processQueue() {
    // Prevent concurrent queue processing
    if (queueProcessingMutex) {
      console.log("🔄 Queue processing already in progress, skipping...");
      return;
    }

    const { user } = useAuthStore.getState();
    if (!user) {
      console.warn("Cannot process queue: User not authenticated");
      return;
    }

    const isOnline = getConnectionStatus?.()?.isOnline ?? true;
    if (!isOnline) {
      console.log("📴 Cannot process queue: Currently offline");
      return;
    }

    if (!sqliteService.isInitialized()) {
      console.warn("Cannot process queue: SQLite not initialized");
      return;
    }

    // Set mutex immediately
    queueProcessingMutex = true;

    try {
      console.log("🔄 Processing message queue...");
      // Note: Sync status will be managed by connection store callbacks

      const queuedMessages = await sqliteService.getQueuedMessages();
      console.log(`📦 Found ${queuedMessages.length} queued messages`);

      if (queuedMessages.length === 0) {
        // Note: Sync status will be managed by connection store callbacks
        return;
      }

      let successCount = 0;
      let failedCount = 0;

      // Process messages in smaller batches to prevent memory issues
      const BATCH_SIZE = 5;
      for (let i = 0; i < queuedMessages.length; i += BATCH_SIZE) {
        const batch = queuedMessages.slice(i, i + BATCH_SIZE);

        for (const queued of batch) {
          try {
            console.log(`📤 Sending queued message: ${queued.messageId}`);

            // Check if conversation exists before sending message
            const conversation = await conversationService.getConversation(
              queued.conversationId
            );
            if (!conversation) {
              console.warn(
                `⚠️ Conversation ${queued.conversationId} not found, skipping message ${queued.messageId}`
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

            console.log(
              `✅ Conversation ${queued.conversationId} found, participants:`,
              conversation.participants
            );

            // Send to Firestore with UUID
            const message = await messageService.sendMessage(
              queued.messageId,
              queued.conversationId,
              queued.senderId,
              queued.text
            );

            // Save to messages table
            await sqliteService.saveMessage(message);

            // Remove from queue
            await sqliteService.removeQueuedMessage(queued.messageId);

            // Update local state - replace temp message with real message
            set((state) => {
              const currentMessages =
                state.messages[queued.conversationId] || [];
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
            console.log(
              `✅ Queued message sent successfully: ${queued.messageId}`
            );
          } catch (error) {
            console.error(
              `❌ Failed to send queued message: ${queued.messageId}`,
              error
            );

            // Update retry count
            const errorMessage =
              error instanceof Error ? error.message : String(error);
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
        }

        // Small delay between batches to prevent overwhelming the system
        if (i + BATCH_SIZE < queuedMessages.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Update sync stats
      const remainingQueued = await sqliteService.getQueuedMessages();
      // Note: Queue counts and sync stats will be managed by connection store callbacks

      console.log(
        `✅ Queue processing complete: ${successCount} sent, ${failedCount} failed`
      );
      // Note: Sync status will be managed by connection store callbacks
    } catch (error) {
      console.error("Error processing queue:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Note: Error handling will be managed by connection store callbacks
    } finally {
      // Always clear the mutex
      queueProcessingMutex = false;
    }
  },

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
        await sqliteService.saveMessage(msg);
      }

      // Load most recent 200 into Zustand
      const recentMessages = await sqliteService.loadRecentMessages(
        conv.id,
        MAX_MESSAGES_IN_MEMORY
      );
      set((state) => ({
        messages: {
          ...state.messages,
          [conv.id]: recentMessages,
        },
      }));

      // Update sync timestamp to max updatedAt from batch
      if (newMessages.length > 0) {
        const maxUpdatedAt = Math.max(
          ...newMessages.map((m) => m.updatedAt?.toMillis() || 0)
        );
        await sqliteService.setLastSyncedAt(conv.id, maxUpdatedAt);
      }
    }
  },

  async loadConversationMessages(conversationId: string) {
    const messages = await sqliteService.loadRecentMessages(
      conversationId,
      MAX_MESSAGES_IN_MEMORY
    );

    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: messages,
      },
    }));
  },

  unloadConversationMessages(conversationId: string) {
    set((state) => {
      const { [conversationId]: removed, ...rest } = state.messages;
      return { messages: rest };
    });
  },

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
}));

// Setup function to register callbacks with connection store
export const setupMessagesStoreCallbacks = (
  registerCallback: (callback: () => Promise<void>) => () => void
) => {
  // Register the sync callback
  const unsubscribeSync = registerCallback(async () => {
    console.log("📤 Processing queued messages...");
    await useMessagesStore.getState().processQueue();

    console.log("📥 Syncing missed messages...");
    await useMessagesStore.getState().syncMissedMessages();
  });

  return unsubscribeSync;
};
