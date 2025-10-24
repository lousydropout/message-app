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

  async updateConversation(conversationId: string, data: any): Promise<void> {
    try {
      const conversationRef = doc(this.conversationsRef, conversationId);
      await updateDoc(conversationRef, data);
    } catch (error) {
      logger.error("conversations", "Error updating conversation:", error);
      throw error;
    }
  }

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

  subscribeToConversations(
    userId: string,
    callback: (conversations: Conversation[]) => void
  ): Unsubscribe {
    // Temporary: Use simple query without orderBy to avoid index requirement
    const q = query(
      this.conversationsRef,
      where("participants", "array-contains", userId)
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
