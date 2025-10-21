import { Timestamp } from "firebase/firestore";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: Timestamp;
  readBy: { [userId: string]: Timestamp };
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
