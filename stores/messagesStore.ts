import conversationService from "@/services/conversationService";
import messageService from "@/services/messageService";
import sqliteService from "@/services/sqliteService";
import { useAuthStore } from "@/stores/authStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { Conversation } from "@/types/Conversation";
import { Message } from "@/types/Message";
import { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

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
  syncQueuedMessages: () => Promise<void>;
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

    const unsubscribe = conversationService.subscribeToConversations(
      userId,
      (conversations) => {
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
      (messages) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: messages,
          },
        }));
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

    const { isOnline } = useConnectionStore.getState();
    set({ sendingMessage: true });
    const tempId = `temp_${Date.now()}`;

    try {
      // Optimistic update - add message to local state immediately
      const tempMessage: Message = {
        id: tempId,
        conversationId,
        senderId: user.uid,
        text,
        timestamp: new Date() as any,
        readBy: { [user.uid]: new Date() as any },
        status: isOnline ? "sending" : "sending", // Will be queued if offline
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

      // Check if online
      if (!isOnline) {
        console.log("📴 Offline: Queuing message");

        // Queue message in SQLite
        if (sqliteService.isInitialized()) {
          await sqliteService.queueMessage(
            tempId,
            conversationId,
            user.uid,
            text
          );

          // Update connection store queue count
          const queuedMessages = await sqliteService.getQueuedMessages();
          useConnectionStore
            .getState()
            .updateQueueCounts(queuedMessages.length, 0);
        }

        // FIX: Update message status to "queued" in UI
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]:
              state.messages[conversationId]?.map((msg) =>
                msg.id === tempId ? { ...msg, status: "queued" as const } : msg
              ) || [],
          },
          sendingMessage: false,
        }));

        return; // Don't try to send to Firestore when offline
      }

      // Online: Send to Firestore
      console.log("📡 Online: Sending message to Firestore");
      const message = await messageService.sendMessage(
        conversationId,
        user.uid,
        text
      );

      // Save to SQLite
      if (sqliteService.isInitialized()) {
        await sqliteService.saveMessage(message);
      }

      // Replace temp message with real message
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: state.messages[conversationId]?.map((msg) =>
            msg.id === tempId ? { ...message, status: "sent" } : msg
          ) || [{ ...message, status: "sent" }],
        },
        sendingMessage: false,
      }));
    } catch (error) {
      console.error("Error sending message:", error);

      // Mark temp message as failed instead of removing
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]:
            state.messages[conversationId]?.map((msg) =>
              msg.id === tempId ? { ...msg, status: "failed" } : msg
            ) || [],
        },
        sendingMessage: false,
      }));

      // If SQLite is initialized, update the queued message with error
      if (sqliteService.isInitialized()) {
        try {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          await sqliteService.updateQueuedMessageRetry(tempId, errorMessage);
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

  async syncQueuedMessages() {
    const { user } = useAuthStore.getState();
    if (!user) {
      console.warn("Cannot sync queued messages: User not authenticated");
      return;
    }

    const { isOnline } = useConnectionStore.getState();
    if (!isOnline) {
      console.log("📴 Cannot sync queued messages: Currently offline");
      return;
    }

    if (!sqliteService.isInitialized()) {
      console.warn("Cannot sync queued messages: SQLite not initialized");
      return;
    }

    try {
      console.log("🔄 Syncing queued messages...");
      useConnectionStore.getState().setSyncing(true);

      const queuedMessages = await sqliteService.getQueuedMessages();
      console.log(`📦 Found ${queuedMessages.length} queued messages`);

      if (queuedMessages.length === 0) {
        useConnectionStore.getState().setSyncing(false);
        useConnectionStore.getState().setSyncStatus("synced");
        return;
      }

      let successCount = 0;
      let failedCount = 0;

      for (const queued of queuedMessages) {
        try {
          console.log(`📤 Sending queued message: ${queued.tempId}`);

          // Send to Firestore
          const message = await messageService.sendMessage(
            queued.conversationId,
            queued.senderId,
            queued.text
          );

          // Save to messages table
          await sqliteService.saveMessage(message);

          // Remove from queue
          await sqliteService.removeQueuedMessage(queued.tempId);

          // Update local state - replace temp message with real message
          set((state) => {
            const currentMessages = state.messages[queued.conversationId] || [];
            const tempMessageExists = currentMessages.some(
              (msg) => msg.id === queued.tempId
            );

            if (tempMessageExists) {
              // Replace temp message with real message
              return {
                messages: {
                  ...state.messages,
                  [queued.conversationId]: currentMessages.map((msg) =>
                    msg.id === queued.tempId
                      ? { ...message, status: "sent" }
                      : msg
                  ),
                },
              };
            } else {
              // Temp message not in state, add real message
              return {
                messages: {
                  ...state.messages,
                  [queued.conversationId]: [
                    { ...message, status: "sent" },
                    ...currentMessages,
                  ],
                },
              };
            }
          });

          successCount++;
          console.log(`✅ Queued message sent successfully: ${queued.tempId}`);
        } catch (error) {
          console.error(
            `❌ Failed to send queued message: ${queued.tempId}`,
            error
          );

          // Update retry count
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          await sqliteService.updateQueuedMessageRetry(
            queued.tempId,
            errorMessage
          );
          failedCount++;

          // Mark message as failed in local state
          set((state) => ({
            messages: {
              ...state.messages,
              [queued.conversationId]:
                state.messages[queued.conversationId]?.map((msg) =>
                  msg.id === queued.tempId ? { ...msg, status: "failed" } : msg
                ) || [],
            },
          }));
        }
      }

      // Update sync stats
      const remainingQueued = await sqliteService.getQueuedMessages();
      useConnectionStore
        .getState()
        .updateQueueCounts(remainingQueued.length, failedCount);
      useConnectionStore.getState().updateSyncStats({
        messagesSynced: successCount,
        messagesFailed: failedCount,
        lastSyncAt: Date.now(),
      });

      console.log(
        `✅ Sync complete: ${successCount} sent, ${failedCount} failed`
      );
      useConnectionStore.getState().setSyncing(false);
      useConnectionStore
        .getState()
        .setSyncStatus(failedCount > 0 ? "error" : "synced");
      // Add this line to update lastSyncAt:
      useConnectionStore.getState().updateSyncStats({ lastSyncAt: Date.now() });
    } catch (error) {
      console.error("Error syncing queued messages:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      useConnectionStore.getState().setSyncing(false);
      useConnectionStore.getState().setError(`Sync failed: ${errorMessage}`);
    }
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
