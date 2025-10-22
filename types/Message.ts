import { Timestamp } from "firebase/firestore";

export interface Message {
  id: string; // UUID - same ID throughout message lifecycle (UI → Queue → Firestore)
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: Timestamp;
  readBy: { [userId: string]: Timestamp };
  status?: "sending" | "sent" | "read" | "failed" | "queued"; // Message status including queued
  aiFeatures?: {
    translation?: string;
    culturalHints?: string[];
    formalityLevel?: "formal" | "informal" | "casual";
  };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TypingStatus {
  userId: string;
  isTyping: boolean;
  timestamp: Timestamp;
}
