import { db } from "@/config/firebase";
import { Message, TypingStatus } from "@/types/Message";
import {
  addDoc,
  collection,
  doc,
  DocumentSnapshot,
  getDocs,
  increment,
  limit,
  onSnapshot,
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
  private messagesRef = collection(db, "messages");

  async sendMessage(
    conversationId: string,
    senderId: string,
    text: string
  ): Promise<Message> {
    try {
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

      const docRef = await addDoc(this.messagesRef, messageData);

      // Create message object with ID and current timestamp
      const currentTimestamp = new Date();
      const message: Message = {
        id: docRef.id,
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

      // Get conversation to access participants
      const conversation = await conversationService.getConversation(
        conversationId
      );
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
          }
        });

        // Update conversation with last message and unread counts
        await conversationService.updateConversation(
          conversationId,
          updateData
        );
      }

      return message;
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }

  async getMessages(
    conversationId: string,
    limitCount: number = 50,
    startAfterDoc?: DocumentSnapshot
  ): Promise<Message[]> {
    try {
      // Temporary: Use simple query without orderBy to avoid index requirement
      let q = query(
        this.messagesRef,
        where("conversationId", "==", conversationId),
        limit(limitCount)
      );

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
      console.error("Error getting messages:", error);
      throw error;
    }
  }

  async markMessageAsRead(messageId: string, userId: string): Promise<void> {
    try {
      const messageRef = doc(this.messagesRef, messageId);
      await updateDoc(messageRef, {
        [`readBy.${userId}`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error marking message as read:", error);
      throw error;
    }
  }

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
      const q = query(
        this.messagesRef,
        where("conversationId", "==", conversationId),
        limit(50)
      );

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
      console.error("Error marking conversation as read:", error);
      throw error;
    }
  }

  subscribeToMessages(
    conversationId: string,
    callback: (messages: Message[]) => void
  ): Unsubscribe {
    // Temporary: Use simple query without orderBy to avoid index requirement
    const q = query(
      this.messagesRef,
      where("conversationId", "==", conversationId),
      limit(100) // Limit to prevent too much data
    );

    return onSnapshot(q, (querySnapshot) => {
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
    });
  }

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
      console.error("Error updating typing status:", error);
      throw error;
    }
  }

  subscribeToTypingStatus(
    conversationId: string,
    callback: (typingUsers: string[]) => void
  ): Unsubscribe {
    // Temporary: Use simple query without orderBy to avoid index requirement
    const typingRef = collection(db, "conversations", conversationId, "typing");
    const q = query(typingRef, where("isTyping", "==", true));

    return onSnapshot(q, (querySnapshot) => {
      const typingUsers: string[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data() as TypingStatus;
        if (data.isTyping) {
          typingUsers.push(data.userId);
        }
      });

      // Sort by timestamp on client side if needed
      typingUsers.sort((a, b) => {
        const aDoc = querySnapshot.docs.find((doc) => doc.data().userId === a);
        const bDoc = querySnapshot.docs.find((doc) => doc.data().userId === b);
        const aTime = aDoc?.data().timestamp?.toDate?.() || new Date(0);
        const bTime = bDoc?.data().timestamp?.toDate?.() || new Date(0);
        return bTime.getTime() - aTime.getTime();
      });

      callback(typingUsers);
    });
  }
}

export default new MessageService();
