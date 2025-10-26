/**
 * @fileoverview Type definitions for the Message data model.
 *
 * This file contains the TypeScript interfaces for `Message` and `TypingStatus`
 * objects. These definitions are fundamental to the application's real-time
 * messaging capabilities, ensuring data consistency across Firestore, the local
 * cache, and the UI.
 *
 * The `Message` interface is designed to support the entire lifecycle of a
 * message, from being optimistically displayed in the UI with a "sending" or
 * "queued" status, to being persisted in Firestore and updated with read
 * receipts. The `id` is a client-generated UUID, which is crucial for
 * idempotency and preventing duplicate messages.
 *
 * The `TypingStatus` interface supports the real-time typing indicator feature,
 * allowing for a more dynamic and engaging chat experience.
 *
 * @see messageService for the service that manages messages in Firestore.
 * @see MessageRepository for the local database implementation.
 */

import { Timestamp } from "firebase/firestore";

/**
 * Message interface
 *
 * Represents a message in a conversation. Uses UUID for idempotency
 * throughout the message lifecycle (UI → Queue → Firestore).
 */
export interface Message {
  /** UUID generated upfront, used for idempotency throughout message lifecycle */
  id: string;
  /** ID of the conversation this message belongs to */
  conversationId: string;
  /** ID of the user who sent the message */
  senderId: string;
  /** Message text content */
  text: string;
  /** Timestamp when message was sent */
  timestamp: Timestamp;
  /** Map of user IDs to timestamps when they read the message */
  readBy: { [userId: string]: Timestamp };
  /** Message delivery status */
  status?: "sending" | "sent" | "read" | "failed" | "queued";
  /** AI-powered message enhancements */
  aiFeatures?: {
    /** Translated version of the message */
    translation?: string;
    /** Cultural context hints for the message */
    culturalHints?: string[];
    /** Formality level detected or set */
    formalityLevel?: "formal" | "informal" | "casual";
  };
  /** Timestamp when message was created in Firestore */
  createdAt?: Timestamp;
  /** Timestamp when message was last updated */
  updatedAt?: Timestamp;
}

/**
 * Typing status interface
 *
 * Tracks when a user is typing in a conversation for real-time typing indicators.
 */
export interface TypingStatus {
  /** ID of the user who is typing */
  userId: string;
  /** Whether the user is currently typing */
  isTyping: boolean;
  /** Timestamp of the typing status update */
  timestamp: Timestamp;
}
