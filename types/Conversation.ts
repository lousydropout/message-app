import { Timestamp } from "firebase/firestore";

export interface Conversation {
  id: string;
  type: "direct" | "group";
  participants: string[];
  name?: string; // For group conversations
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessage?: {
    id: string;
    text: string;
    senderId: string;
    timestamp: Timestamp;
  };
  unreadCounts?: Record<string, number>; // Track unread count per user atomically
}

export interface ConversationPreview {
  id: string;
  type: "direct" | "group";
  participants: string[];
  name?: string;
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: Timestamp;
  };
  updatedAt: Timestamp;
  unreadCounts?: Record<string, number>;
}
