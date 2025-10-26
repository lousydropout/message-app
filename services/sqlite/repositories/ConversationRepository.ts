import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import {
  SQLiteConversation,
  TimestampInput,
} from "@/services/sqlite/core/types";
import { Conversation } from "@/types/Conversation";
import { Timestamp } from "firebase/firestore";

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
   * Convert SQLite INTEGER to Firestore Timestamp
   */
  private toFirestoreTimestamp(timestamp: number): Timestamp {
    return Timestamp.fromMillis(timestamp);
  }

  /**
   * Convert Firestore Conversation to SQLite format
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
   * Convert SQLite conversation to Firestore format
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
   * Save a conversation to SQLite (from Firestore sync)
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
   * Get all conversations for a user (optimized)
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
   * Get a single conversation by ID
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
