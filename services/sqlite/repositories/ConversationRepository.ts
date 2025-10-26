import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import {
  SQLiteConversation,
  TimestampInput,
} from "@/services/sqlite/core/types";
import { Conversation } from "@/types/Conversation";
import { Timestamp } from "firebase/firestore";

/**
 * @fileoverview Conversation Repository - Manages conversation data in SQLite.
 *
 * This repository is responsible for all database operations related to conversations,
 * serving as a local cache for data synced from Firestore. It handles the
 * transformation of data between the Firestore `Conversation` format and the
 * SQLite-compatible `SQLiteConversation` format, which involves serializing
 * complex types like arrays and nested objects into JSON strings.
 *
 * @see SQLiteService for how this repository is used.
 * @see SchemaManager for the `conversations` table schema.
 */

/**
 * Conversation Repository - handles all conversation-related database operations
 *
 * This repository provides methods for:
 * - Saving conversations
 * - Retrieving conversations for users
 * - Conversation metadata management
 */
export class ConversationRepository {
  constructor(private db: SQLiteDatabase) {}

  /**
   * Convert Firestore Timestamp to SQLite INTEGER (epoch milliseconds)
   */
  private toSQLiteTimestamp(timestamp: TimestampInput): number {
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
  }

  /**
   * Converts a SQLite INTEGER (epoch milliseconds) back to a Firestore `Timestamp`.
   * @param timestamp The epoch milliseconds from the SQLite database.
   * @returns A Firestore `Timestamp` object.
   */
  private toFirestoreTimestamp(timestamp: number): Timestamp {
    return Timestamp.fromMillis(timestamp);
  }

  /**
   * Convert Firestore Conversation to SQLite format
   *
   * This involves serializing complex types like arrays and nested objects into JSON strings.
   * @param conversation The `Conversation` object from Firestore.
   * @returns An `SQLiteConversation` object ready for insertion into the database.
   */
  private conversationToSQLite(conversation: Conversation): SQLiteConversation {
    return {
      id: conversation.id,
      type: conversation.type,
      participants: JSON.stringify(conversation.participants),
      name: conversation.name || null,
      createdAt: this.toSQLiteTimestamp(conversation.createdAt),
      updatedAt: this.toSQLiteTimestamp(conversation.updatedAt),
      lastMessageId: conversation.lastMessage?.id || null,
      lastMessageText: conversation.lastMessage?.text || null,
      lastMessageSenderId: conversation.lastMessage?.senderId || null,
      lastMessageTimestamp: conversation.lastMessage?.timestamp
        ? this.toSQLiteTimestamp(conversation.lastMessage.timestamp)
        : null,
      unreadCounts: conversation.unreadCounts
        ? JSON.stringify(conversation.unreadCounts)
        : null,
      syncedAt: Date.now(),
    };
  }

  /**
   * Converts a raw SQLite row into a `Conversation` object.
   *
   * This involves parsing JSON strings back into their original object/array
   * formats and converting timestamps.
   * @param row The `SQLiteConversation` object from the database.
   * @returns A `Conversation` object.
   */
  private sqliteToConversation(row: SQLiteConversation): Conversation {
    return {
      id: row.id,
      type: row.type as "direct" | "group",
      participants: JSON.parse(row.participants),
      name: row.name || undefined,
      createdAt: this.toFirestoreTimestamp(row.createdAt),
      updatedAt: this.toFirestoreTimestamp(row.updatedAt),
      lastMessage: row.lastMessageId
        ? {
            id: row.lastMessageId,
            text: row.lastMessageText!,
            senderId: row.lastMessageSenderId!,
            timestamp: this.toFirestoreTimestamp(row.lastMessageTimestamp!),
          }
        : undefined,
      unreadCounts: row.unreadCounts ? JSON.parse(row.unreadCounts) : undefined,
    };
  }

  /**
   * Saves a conversation from Firestore to the local SQLite database.
   *
   * This method performs an "upsert" (INSERT OR REPLACE) to ensure the local
   * cache is kept up-to-date with the latest data from Firestore. It includes
   * a pre-insert guard to prevent foreign key constraint violations if the
   * conversation's `lastMessage` doesn't yet exist in the local `messages` table.
   *
   * @param conversation The `Conversation` object to save.
   * @returns A promise that resolves when the conversation is successfully saved.
   * @throws An error if the database operation fails.
   */
  async saveConversation(conversation: Conversation): Promise<void> {
    const db = this.db.getDb();

    try {
      const sqliteConversation = this.conversationToSQLite(conversation);

      // Pre-insert guard: Check if referenced lastMessage exists
      if (sqliteConversation.lastMessageId) {
        const messageExists = await db.getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) as count FROM messages WHERE id = ?",
          [sqliteConversation.lastMessageId]
        );

        if (!messageExists || messageExists.count === 0) {
          console.warn(
            "sqlite",
            `Conversation ${conversation.id} references missing message ${sqliteConversation.lastMessageId}, nullifying lastMessage fields`
          );
          // Nullify the lastMessage fields to avoid FK constraint violation
          sqliteConversation.lastMessageId = null;
          sqliteConversation.lastMessageText = null;
          sqliteConversation.lastMessageSenderId = null;
          sqliteConversation.lastMessageTimestamp = null;
        }
      }

      await this.db.runSingleWrite(async () => {
        await db.runAsync(
          `INSERT OR REPLACE INTO conversations 
           (id, type, participants, name, createdAt, updatedAt, lastMessageId, lastMessageText, 
            lastMessageSenderId, lastMessageTimestamp, unreadCounts, syncedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sqliteConversation.id,
            sqliteConversation.type,
            sqliteConversation.participants,
            sqliteConversation.name,
            sqliteConversation.createdAt,
            sqliteConversation.updatedAt,
            sqliteConversation.lastMessageId,
            sqliteConversation.lastMessageText,
            sqliteConversation.lastMessageSenderId,
            sqliteConversation.lastMessageTimestamp,
            sqliteConversation.unreadCounts,
            sqliteConversation.syncedAt,
          ]
        );
      });
    } catch (error) {
      console.error("sqlite", "Error saving conversation to SQLite:", error);
      throw error;
    }
  }

  /**
   * Retrieves all conversations for a specific user from the local cache.
   *
   * This method is optimized for performance by fetching all conversations and
   * then filtering them in memory. This is generally faster than using a `LIKE`
   * query on the JSON `participants` string in SQLite, especially as the number
   * of conversations grows.
   *
   * @param userId The ID of the user whose conversations are to be fetched.
   * @returns A promise that resolves to an array of `Conversation` objects.
   * @throws An error if the database operation fails.
   */
  async getConversations(userId: string): Promise<Conversation[]> {
    const db = this.db.getDb();

    try {
      console.log(
        "sqlite",
        `[SQLite] Loading conversations for user: ${userId}`
      );
      const startTime = Date.now();

      // Use a more efficient query - get all conversations and filter in memory
      // This is faster than LIKE queries on JSON strings
      const rows = await db.getAllAsync<SQLiteConversation>(
        `SELECT * FROM conversations 
         ORDER BY updatedAt DESC`
      );

      console.log(
        "sqlite",
        `[SQLite] Found ${rows.length} total conversations in ${
          Date.now() - startTime
        }ms`
      );

      // Filter conversations that include the user (more efficient than LIKE)
      const userConversations = rows.filter((row) => {
        try {
          const participants = JSON.parse(row.participants);
          return Array.isArray(participants) && participants.includes(userId);
        } catch (parseError) {
          console.debug(
            "sqlite",
            `[SQLite] Error parsing participants for conversation ${row.id}:`,
            parseError
          );
          return false;
        }
      });

      console.log(
        "sqlite",
        `[SQLite] Filtered to ${
          userConversations.length
        } user conversations in ${Date.now() - startTime}ms`
      );

      // Optimize JSON parsing by doing it in batch
      const conversations = userConversations.map((row) => {
        try {
          return {
            id: row.id,
            type: row.type as "direct" | "group",
            participants: JSON.parse(row.participants),
            name: row.name || undefined,
            createdAt: this.toFirestoreTimestamp(row.createdAt),
            updatedAt: this.toFirestoreTimestamp(row.updatedAt),
            lastMessage: row.lastMessageId
              ? {
                  id: row.lastMessageId,
                  text: row.lastMessageText!,
                  senderId: row.lastMessageSenderId!,
                  timestamp: this.toFirestoreTimestamp(
                    row.lastMessageTimestamp!
                  ),
                }
              : undefined,
            unreadCounts: row.unreadCounts
              ? JSON.parse(row.unreadCounts)
              : undefined,
          };
        } catch (parseError) {
          console.debug(
            "sqlite",
            `[SQLite] Error parsing conversation ${row.id}:`,
            parseError
          );
          // Return a minimal conversation object to prevent crashes
          return {
            id: row.id,
            type: row.type as "direct" | "group",
            participants: [userId], // Fallback
            name: row.name || undefined,
            createdAt: this.toFirestoreTimestamp(row.createdAt),
            updatedAt: this.toFirestoreTimestamp(row.updatedAt),
            lastMessage: undefined,
            unreadCounts: undefined,
          };
        }
      });

      console.log(
        "sqlite",
        `[SQLite] Parsed ${conversations.length} conversations in ${
          Date.now() - startTime
        }ms total`
      );
      return conversations;
    } catch (error) {
      console.error(
        "sqlite",
        "Error getting conversations from SQLite:",
        error
      );
      throw error;
    }
  }

  /**
   * Retrieves a single conversation by its ID from the local cache.
   *
   * @param conversationId The ID of the conversation to retrieve.
   * @returns A promise that resolves to the `Conversation` object or `null` if not found.
   * @throws An error if the database operation fails.
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const db = this.db.getDb();

    try {
      const row = await db.getFirstAsync<SQLiteConversation>(
        `SELECT * FROM conversations WHERE id = ?`,
        [conversationId]
      );

      return row ? this.sqliteToConversation(row) : null;
    } catch (error) {
      console.error("sqlite", "Error getting conversation from SQLite:", error);
      throw error;
    }
  }
}
