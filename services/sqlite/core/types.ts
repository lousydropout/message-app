/**
 * @fileoverview Shared type definitions for SQLite operations
 *
 * This module contains all the TypeScript interfaces and types used across
 * the SQLite service modules. These types represent the SQLite database
 * schema and provide type safety for database operations.
 */

import { Conversation } from "@/types/Conversation";
import { Message } from "@/types/Message";
import { User } from "@/types/User";
import { Timestamp } from "firebase/firestore";

/**
 * Helper types for SQLite representations
 *
 * These interfaces define the structure of data as stored in SQLite tables,
 * which may differ from the Firestore types due to SQLite's type system
 * and storage optimizations (e.g., JSON strings for complex objects).
 */
/**
 * SQLite representation of a Message
 *
 * This interface represents how messages are stored in the SQLite database.
 * Complex objects like readBy and aiFeatures are serialized as JSON strings
 * to work with SQLite's type system.
 */
export interface SQLiteMessage {
  /** Unique message identifier */
  id: string;
  /** ID of the conversation this message belongs to */
  conversationId: string;
  /** ID of the user who sent this message */
  senderId: string;
  /** The message text content */
  text: string;
  /** Timestamp when the message was sent (epoch milliseconds) */
  timestamp: number;
  /** JSON string of read status by user ID -> timestamp mapping */
  readBy: string; // JSON
  /** Message status: 'sent', 'delivered', 'read', 'failed' */
  status: string;
  /** JSON string of AI features data, null if no AI features */
  aiFeatures: string | null; // JSON
  /** Timestamp when message was created (epoch milliseconds) */
  createdAt: number | null;
  /** Timestamp when message was last updated (epoch milliseconds) */
  updatedAt: number | null;
  /** Timestamp when message was last synced with Firestore (epoch milliseconds) */
  syncedAt: number | null;
}

/**
 * SQLite representation of a Conversation
 *
 * This interface represents how conversations are stored in the SQLite database.
 * Arrays and objects are serialized as JSON strings for SQLite compatibility.
 */
export interface SQLiteConversation {
  /** Unique conversation identifier */
  id: string;
  /** Conversation type: 'direct' or 'group' */
  type: string;
  /** JSON string array of participant user IDs */
  participants: string; // JSON array
  /** Conversation name (null for direct messages) */
  name: string | null;
  /** Timestamp when conversation was created (epoch milliseconds) */
  createdAt: number;
  /** Timestamp when conversation was last updated (epoch milliseconds) */
  updatedAt: number;
  /** ID of the last message in this conversation */
  lastMessageId: string | null;
  /** Text content of the last message */
  lastMessageText: string | null;
  /** ID of the sender of the last message */
  lastMessageSenderId: string | null;
  /** Timestamp of the last message (epoch milliseconds) */
  lastMessageTimestamp: number | null;
  /** JSON string of unread message counts by user ID */
  unreadCounts: string | null; // JSON
  /** Timestamp when conversation was last synced with Firestore (epoch milliseconds) */
  syncedAt: number | null;
}

/**
 * SQLite representation of a User
 *
 * This interface represents how user profiles are stored in the SQLite database.
 * Complex objects are serialized as JSON strings for SQLite compatibility.
 */
export interface SQLiteUser {
  /** Unique user identifier */
  id: string;
  /** User's email address */
  email: string;
  /** User's display name */
  displayName: string;
  /** URL to user's avatar image (null if no avatar) */
  avatar: string | null;
  /** JSON string array of supported language codes */
  languagePreferences: string; // JSON array
  /** JSON string object of AI-related settings */
  aiSettings: string; // JSON object
  /** JSON string array of blocked user IDs */
  blockedUsers: string; // JSON array
  /** Timestamp when user account was created (epoch milliseconds) */
  createdAt: number;
  /** Timestamp when user was last seen (epoch milliseconds) */
  lastSeen: number;
  /** Online status: 1 for online, 0 for offline */
  online: number; // 0 or 1
  /** Timestamp of last heartbeat (epoch milliseconds) */
  heartbeat: number; // timestamp in milliseconds
  /** Timestamp when user profile was last synced with Firestore (epoch milliseconds) */
  syncedAt: number | null;
}

/**
 * Represents a message queued for sending when offline
 *
 * This interface represents messages that are stored in the queue table
 * when the app is offline or experiencing network issues.
 */
export interface QueuedMessage {
  /** Auto-incrementing primary key for the queue entry */
  id?: number;
  /** The actual message ID (UUID) that will be used when sent */
  messageId: string; // Actual message ID (UUID)
  /** ID of the conversation this message belongs to */
  conversationId: string;
  /** ID of the user who is sending this message */
  senderId: string;
  /** The message text content */
  text: string;
  /** Timestamp when the message was queued (epoch milliseconds) */
  timestamp: number;
  /** Number of times this message has been retried */
  retryCount: number;
  /** Timestamp of the last retry attempt (epoch milliseconds) */
  lastRetryAt: number | null;
  /** Error message from the last failed attempt */
  error: string | null;
  /** Timestamp when this message was first queued (epoch milliseconds) */
  createdAt: number;
}

/**
 * Represents sync metadata stored in the database
 *
 * This interface is used for storing key-value pairs of sync-related data,
 * such as last sync timestamps for conversations.
 */
export interface SyncMetadata {
  /** Unique key identifier for the metadata */
  key: string;
  /** JSON string value of the metadata */
  value: string; // JSON
  /** Timestamp when this metadata was last updated (epoch milliseconds) */
  updatedAt: number;
}

/**
 * Represents a search result from message search operations
 *
 * This interface contains the essential fields needed for displaying
 * search results in the UI.
 */
export interface SearchResult {
  /** Message ID */
  id: string;
  /** Conversation ID this message belongs to */
  conversationId: string;
  /** The message text content */
  text: string;
  /** Timestamp when the message was sent (epoch milliseconds) */
  timestamp: number;
  /** ID of the user who sent this message */
  senderId: string;
}

/**
 * Utility type for timestamp conversion
 *
 * This type represents the various timestamp formats that can be converted
 * to SQLite-compatible epoch milliseconds.
 */
export type TimestampInput = Timestamp | Date | any;

/**
 * Data conversion helpers
 *
 * These functions handle the conversion between Firestore types and SQLite
 * representations, including timestamp conversion and JSON serialization.
 */

/**
 * Converts various timestamp formats to epoch milliseconds for SQLite storage
 *
 * @param timestamp - Firestore Timestamp, Date object, or any timestamp-like value
 * @returns Epoch milliseconds as a number
 */
export const toSQLiteTimestamp = (timestamp: TimestampInput): number => {
  if (timestamp?.toMillis) {
    return timestamp.toMillis();
  }
  if (timestamp?.toDate) {
    return timestamp.toDate().getTime();
  }
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  return Date.now();
};

/**
 * Converts epoch milliseconds to Firestore Timestamp
 *
 * @param timestamp - Epoch milliseconds
 * @returns Firestore Timestamp object
 */
export const toFirestoreTimestamp = (timestamp: number): Timestamp => {
  return Timestamp.fromMillis(timestamp);
};

/**
 * Converts a Message object to SQLite representation
 *
 * @param message - Firestore Message object
 * @returns SQLite Message representation
 */
export const messageToSQLite = (message: Message): SQLiteMessage => {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    text: message.text,
    timestamp: toSQLiteTimestamp(message.timestamp),
    readBy: JSON.stringify(
      Object.fromEntries(
        Object.entries(message.readBy || {}).map(([k, v]) => [
          k,
          toSQLiteTimestamp(v),
        ])
      )
    ),
    status: message.status || "sent",
    aiFeatures: message.aiFeatures ? JSON.stringify(message.aiFeatures) : null,
    createdAt: message.createdAt ? toSQLiteTimestamp(message.createdAt) : null,
    updatedAt: message.updatedAt ? toSQLiteTimestamp(message.updatedAt) : null,
    syncedAt: Date.now(),
  };
};

/**
 * Converts SQLite Message representation back to Firestore Message object
 *
 * @param row - SQLite Message row
 * @returns Firestore Message object
 */
export const sqliteToMessage = (row: SQLiteMessage): Message => {
  const readByParsed = JSON.parse(row.readBy);
  const readBy = Object.fromEntries(
    Object.entries(readByParsed).map(([k, v]) => [
      k,
      toFirestoreTimestamp(v as number),
    ])
  );

  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    text: row.text,
    timestamp: toFirestoreTimestamp(row.timestamp),
    readBy,
    status: row.status as any,
    aiFeatures: row.aiFeatures ? JSON.parse(row.aiFeatures) : undefined,
    createdAt: row.createdAt ? toFirestoreTimestamp(row.createdAt) : undefined,
    updatedAt: row.updatedAt ? toFirestoreTimestamp(row.updatedAt) : undefined,
  };
};

/**
 * Converts a Conversation object to SQLite representation
 *
 * @param conversation - Firestore Conversation object
 * @returns SQLite Conversation representation
 */
export const conversationToSQLite = (
  conversation: Conversation
): SQLiteConversation => {
  return {
    id: conversation.id,
    type: conversation.type,
    participants: JSON.stringify(conversation.participants),
    name: conversation.name || null,
    createdAt: toSQLiteTimestamp(conversation.createdAt),
    updatedAt: toSQLiteTimestamp(conversation.updatedAt),
    lastMessageId: conversation.lastMessage?.id || null,
    lastMessageText: conversation.lastMessage?.text || null,
    lastMessageSenderId: conversation.lastMessage?.senderId || null,
    lastMessageTimestamp: conversation.lastMessage?.timestamp
      ? toSQLiteTimestamp(conversation.lastMessage.timestamp)
      : null,
    unreadCounts: conversation.unreadCounts
      ? JSON.stringify(conversation.unreadCounts)
      : null,
    syncedAt: Date.now(),
  };
};

/**
 * Converts SQLite Conversation representation back to Firestore Conversation object
 *
 * @param row - SQLite Conversation row
 * @returns Firestore Conversation object
 */
export const sqliteToConversation = (row: SQLiteConversation): Conversation => {
  return {
    id: row.id,
    type: row.type as "direct" | "group",
    participants: JSON.parse(row.participants),
    name: row.name || undefined,
    createdAt: toFirestoreTimestamp(row.createdAt),
    updatedAt: toFirestoreTimestamp(row.updatedAt),
    lastMessage: row.lastMessageId
      ? {
          id: row.lastMessageId,
          text: row.lastMessageText!,
          senderId: row.lastMessageSenderId!,
          timestamp: toFirestoreTimestamp(row.lastMessageTimestamp!),
        }
      : undefined,
    unreadCounts: row.unreadCounts ? JSON.parse(row.unreadCounts) : undefined,
  };
};

/**
 * Converts SQLite User representation back to Firestore User object
 *
 * @param row - SQLite User row
 * @returns Firestore User object
 */
export const sqliteToUser = (row: SQLiteUser): User => {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatar: row.avatar || undefined,
    languagePreferences: JSON.parse(row.languagePreferences),
    aiSettings: JSON.parse(row.aiSettings),
    blockedUsers: JSON.parse(row.blockedUsers),
    createdAt: Timestamp.fromMillis(row.createdAt),
    lastSeen: Timestamp.fromMillis(row.lastSeen),
    online: row.online === 1,
    heartbeat: Timestamp.fromMillis(row.heartbeat),
  };
};
