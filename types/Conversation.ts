/**
 * @fileoverview Type definitions for the Conversation data model.
 *
 * This file contains the TypeScript interfaces that define the shape of
 * conversation-related data objects used throughout the application. These types
 * are crucial for ensuring data consistency between Firestore, the local SQLite
 * cache, and the application's state management.
 *
 * The `Conversation` interface represents the full data model for a conversation,
 * including participant information, metadata, and a preview of the last message.
 * The `unreadCounts` field is particularly important, as it is updated atomically
 * in Firestore to provide an efficient way to track unread messages for each user.
 *
 * @see conversationService for the service that manages these data structures in Firestore.
 * @see ConversationRepository for the local database implementation.
 */

import { Timestamp } from "firebase/firestore";

/**
 * Conversation interface
 *
 * Represents a conversation between users (direct message or group chat).
 * Stored in Firestore with messages in a subcollection.
 */
export interface Conversation {
  /** Unique conversation ID */
  id: string;
  /** Type of conversation: direct message or group chat */
  type: "direct" | "group";
  /** Array of user IDs participating in the conversation */
  participants: string[];
  /** Optional name for group conversations */
  name?: string;
  /** Timestamp when conversation was created */
  createdAt: Timestamp;
  /** Timestamp when conversation was last updated */
  updatedAt: Timestamp;
  /** Preview of the most recent message */
  lastMessage?: {
    /** Message ID */
    id: string;
    /** Message text */
    text: string;
    /** ID of user who sent the message */
    senderId: string;
    /** Message timestamp */
    timestamp: Timestamp;
  };
  /** Map of user IDs to unread message counts (tracked atomically) */
  unreadCounts?: Record<string, number>;
}

/**
 * Conversation preview interface
 *
 * Lightweight version of conversation for list views and previews.
 * Contains only essential information for display.
 */
export interface ConversationPreview {
  /** Unique conversation ID */
  id: string;
  /** Type of conversation: direct message or group chat */
  type: "direct" | "group";
  /** Array of user IDs participating in the conversation */
  participants: string[];
  /** Optional name for group conversations */
  name?: string;
  /** Preview of the most recent message */
  lastMessage?: {
    /** Message text */
    text: string;
    /** ID of user who sent the message */
    senderId: string;
    /** Message timestamp */
    timestamp: Timestamp;
  };
  /** Timestamp when conversation was last updated */
  updatedAt: Timestamp;
  /** Map of user IDs to unread message counts */
  unreadCounts?: Record<string, number>;
}
