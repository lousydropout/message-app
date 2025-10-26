import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import {
  SQLiteMessage,
  SearchResult,
  TimestampInput,
} from "@/services/sqlite/core/types";
import { Message } from "@/types/Message";
import { Timestamp } from "firebase/firestore";

/**
 * @fileoverview Message Repository - handles all message-related database operations
 *
 * This repository provides methods for:
 * - Saving messages (single and batch)
 * - Retrieving messages with pagination
 * - Full-text search using FTS5
 * - Message status updates and read tracking
 *
 * The MessageRepository is responsible for all CRUD operations on the messages table,
 * including complex operations like batch saving, search, and read status management.
 */
export class MessageRepository {
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
   * Convert Firestore Message to SQLite format
   */
  private messageToSQLite(message: Message): SQLiteMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      text: message.text,
      timestamp: this.toSQLiteTimestamp(message.timestamp),
      readBy: JSON.stringify(
        Object.fromEntries(
          Object.entries(message.readBy || {}).map(([k, v]) => [
            k,
            this.toSQLiteTimestamp(v),
          ])
        )
      ),
      status: message.status || "sent",
      aiFeatures: message.aiFeatures
        ? JSON.stringify(message.aiFeatures)
        : null,
      createdAt: message.createdAt
        ? this.toSQLiteTimestamp(message.createdAt)
        : null,
      updatedAt: message.updatedAt
        ? this.toSQLiteTimestamp(message.updatedAt)
        : null,
      syncedAt: Date.now(),
    };
  }

  /**
   * Convert SQLite message to Firestore format
   */
  private sqliteToMessage(row: SQLiteMessage): Message {
    const readByParsed = JSON.parse(row.readBy);
    const readBy = Object.fromEntries(
      Object.entries(readByParsed).map(([k, v]) => [
        k,
        this.toFirestoreTimestamp(v as number),
      ])
    );

    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      text: row.text,
      timestamp: this.toFirestoreTimestamp(row.timestamp),
      readBy,
      status: row.status as any,
      aiFeatures: row.aiFeatures ? JSON.parse(row.aiFeatures) : undefined,
      createdAt: row.createdAt
        ? this.toFirestoreTimestamp(row.createdAt)
        : undefined,
      updatedAt: row.updatedAt
        ? this.toFirestoreTimestamp(row.updatedAt)
        : undefined,
    };
  }

  /**
   * Save a batch of messages to SQLite
   */
  async saveMessagesBatch(messages: Message[]): Promise<void> {
    if (messages.length === 0) return;

    const db = this.db.getDb();

    // For small batches, use simple writes to avoid exclusive transaction overhead
    if (messages.length <= 10) {
      try {
        await this.db.enqueueWrite(async () => {
          for (const message of messages) {
            const m = this.messageToSQLite(message);
            await db.runAsync(
              `INSERT OR REPLACE INTO messages 
               (id, conversationId, senderId, text, timestamp, readBy, status, aiFeatures, createdAt, updatedAt, syncedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                m.id,
                m.conversationId,
                m.senderId,
                m.text,
                m.timestamp,
                m.readBy,
                m.status,
                m.aiFeatures,
                m.createdAt,
                m.updatedAt,
                m.syncedAt,
              ]
            );
          }
        });
        console.log(
          "sqlite",
          `Saved ${messages.length} messages (simple batch)`
        );
        return;
      } catch (error) {
        console.error("sqlite", "Error in simple batch save:", error);
        throw error;
      }
    }

    // For larger batches, use manual transaction to avoid exclusive transaction issues
    const BATCH_SIZE = 90; // Each message has 11 bound parameters -> 999 / 11 ≈ 90 messages per batch

    try {
      await this.db.runWithRetries(async () => {
        await this.db.enqueueWrite(async () => {
          // Use manual transaction instead of withExclusiveTransactionAsync
          await db.execAsync("BEGIN IMMEDIATE");
          try {
            for (let i = 0; i < messages.length; i += BATCH_SIZE) {
              const batch = messages.slice(i, i + BATCH_SIZE);

              const placeholders = batch
                .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .join(", ");

              const sql = `INSERT OR REPLACE INTO messages 
                          (id, conversationId, senderId, text, timestamp, readBy, status, aiFeatures, createdAt, updatedAt, syncedAt)
                          VALUES ${placeholders}`;

              const params: any[] = [];
              for (const message of batch) {
                const m = this.messageToSQLite(message);
                params.push(
                  m.id,
                  m.conversationId,
                  m.senderId,
                  m.text,
                  m.timestamp,
                  m.readBy,
                  m.status,
                  m.aiFeatures,
                  m.createdAt,
                  m.updatedAt,
                  m.syncedAt
                );
              }

              // Defensive check against SQLite parameter limit
              if (params.length > 999) {
                throw new Error(
                  `SQLite parameter limit exceeded (${params.length})`
                );
              }

              await db.runAsync(sql, params);
            }
            await db.execAsync("COMMIT");
          } catch (error) {
            await db.execAsync("ROLLBACK");
            throw error;
          }
        });
      });

      console.log(
        "sqlite",
        `Batch saved ${messages.length} messages (manual transaction)`
      );
    } catch (error) {
      console.error("sqlite", "Error batch saving messages:", error);
      throw error;
    }
  }

  /**
   * Save a message to SQLite (from Firestore sync)
   */
  async saveMessage(message: Message): Promise<void> {
    const db = this.db.getDb();

    try {
      const sqliteMessage = this.messageToSQLite(message);
      await this.db.runSingleWrite(async () => {
        await db.runAsync(
          `INSERT OR REPLACE INTO messages 
           (id, conversationId, senderId, text, timestamp, readBy, status, aiFeatures, createdAt, updatedAt, syncedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sqliteMessage.id,
            sqliteMessage.conversationId,
            sqliteMessage.senderId,
            sqliteMessage.text,
            sqliteMessage.timestamp,
            sqliteMessage.readBy,
            sqliteMessage.status,
            sqliteMessage.aiFeatures,
            sqliteMessage.createdAt,
            sqliteMessage.updatedAt,
            sqliteMessage.syncedAt,
          ]
        );
      });
    } catch (error) {
      console.error("sqlite", "Error saving message to SQLite:", error);
      throw error;
    }
  }

  /**
   * Get the latest message timestamp for a conversation
   */
  async getLatestMessageTimestamp(conversationId: string): Promise<number> {
    const db = this.db.getDb();

    try {
      const rows = await db.getAllAsync<{ timestamp: number }>(
        `SELECT timestamp FROM messages 
         WHERE conversationId = ? 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [conversationId]
      );

      return rows.length > 0 ? rows[0].timestamp : 0;
    } catch (error) {
      console.debug("sqlite", "Error getting latest message timestamp:", error);
      return 0; // Return 0 to fetch all messages if error
    }
  }

  /**
   * Get messages for a conversation with pagination
   */
  async getMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    const db = this.db.getDb();

    try {
      const rows = await db.getAllAsync<SQLiteMessage>(
        `SELECT * FROM messages 
         WHERE conversationId = ? 
         ORDER BY timestamp DESC 
         LIMIT ? OFFSET ?`,
        [conversationId, limit, offset]
      );

      return rows.map((row) => this.sqliteToMessage(row));
    } catch (error) {
      console.error("sqlite", "Error getting messages from SQLite:", error);
      throw error;
    }
  }

  /**
   * Get messages around a specific timestamp (for jump-to-message)
   */
  async getMessagesAroundTimestamp(
    conversationId: string,
    targetTimestamp: number,
    beforeCount: number = 25,
    afterCount: number = 25
  ): Promise<Message[]> {
    const db = this.db.getDb();

    try {
      // Get messages before (including target)
      const beforeRows = await db.getAllAsync<SQLiteMessage>(
        `SELECT * FROM messages 
         WHERE conversationId = ? AND timestamp <= ?
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [conversationId, targetTimestamp, beforeCount]
      );

      // Get messages after
      const afterRows = await db.getAllAsync<SQLiteMessage>(
        `SELECT * FROM messages 
         WHERE conversationId = ? AND timestamp > ?
         ORDER BY timestamp ASC 
         LIMIT ?`,
        [conversationId, targetTimestamp, afterCount]
      );

      // Combine and sort
      const allRows = [...beforeRows, ...afterRows.reverse()];
      allRows.sort((a, b) => b.timestamp - a.timestamp);

      return allRows.map((row) => this.sqliteToMessage(row));
    } catch (error) {
      console.error(
        "sqlite",
        "Error getting messages around timestamp:",
        error
      );
      throw error;
    }
  }

  /**
   * Search messages using FTS5 full-text search (fallback to LIKE if FTS5 unavailable)
   */
  async searchMessages(
    searchQuery: string,
    conversationId?: string,
    limit: number = 50
  ): Promise<SearchResult[]> {
    const db = this.db.getDb();

    try {
      // Check if FTS5 table exists
      const fts5Exists = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='messages_fts'"
      );

      if (fts5Exists && fts5Exists.count > 0) {
        // Use FTS5 full-text search
        let sql: string;
        let params: any[];

        if (conversationId) {
          sql = `SELECT m.id, m.conversationId, m.text, m.timestamp, m.senderId
                 FROM messages_fts fts
                 JOIN messages m ON fts.rowid = m.rowid
                 WHERE messages_fts MATCH ? AND m.conversationId = ?
                 ORDER BY m.timestamp DESC
                 LIMIT ?`;
          params = [searchQuery, conversationId, limit];
        } else {
          sql = `SELECT m.id, m.conversationId, m.text, m.timestamp, m.senderId
                 FROM messages_fts fts
                 JOIN messages m ON fts.rowid = m.rowid
                 WHERE messages_fts MATCH ?
                 ORDER BY m.timestamp DESC
                 LIMIT ?`;
          params = [searchQuery, limit];
        }

        const rows = await db.getAllAsync<SearchResult>(sql, params);
        return rows;
      } else {
        // Fallback to LIKE search if FTS5 not available
        console.warn(
          "sqlite",
          "FTS5 not available, falling back to LIKE search"
        );
        let sql: string;
        let params: any[];

        if (conversationId) {
          sql = `SELECT id, conversationId, text, timestamp, senderId
                 FROM messages
                 WHERE text LIKE ? AND conversationId = ?
                 ORDER BY timestamp DESC
                 LIMIT ?`;
          params = [`%${searchQuery}%`, conversationId, limit];
        } else {
          sql = `SELECT id, conversationId, text, timestamp, senderId
                 FROM messages
                 WHERE text LIKE ?
                 ORDER BY timestamp DESC
                 LIMIT ?`;
          params = [`%${searchQuery}%`, limit];
        }

        const rows = await db.getAllAsync<SearchResult>(sql, params);
        return rows;
      }
    } catch (error) {
      console.error("sqlite", "Error searching messages:", error);
      throw error;
    }
  }

  /**
   * Load recent messages for a conversation (for windowed Zustand) - optimized
   */
  async loadRecentMessages(
    conversationId: string,
    limit: number = 10000
  ): Promise<Message[]> {
    const db = this.db.getDb();

    try {
      const startTime = Date.now();
      console.log(
        "sqlite",
        `[SQLite] 🔍 Starting query for conversation: ${conversationId}`
      );

      const queryStartTime = Date.now();
      const rows = await db.getAllAsync<SQLiteMessage>(
        `SELECT * FROM messages 
         WHERE conversationId = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [conversationId, limit]
      );
      const queryEndTime = Date.now();
      console.log(
        "sqlite",
        `[SQLite] 📊 Query completed: ${rows.length} rows in ${
          queryEndTime - queryStartTime
        }ms`
      );

      // Optimize message conversion
      const conversionStartTime = Date.now();
      const messages = rows.map((row) => {
        try {
          const readByParsed = JSON.parse(row.readBy);
          const readBy = Object.fromEntries(
            Object.entries(readByParsed).map(([k, v]) => [
              k,
              this.toFirestoreTimestamp(v as number),
            ])
          );

          return {
            id: row.id,
            conversationId: row.conversationId,
            senderId: row.senderId,
            text: row.text,
            timestamp: this.toFirestoreTimestamp(row.timestamp),
            readBy,
            status: row.status as any,
            aiFeatures: row.aiFeatures ? JSON.parse(row.aiFeatures) : undefined,
            createdAt: row.createdAt
              ? this.toFirestoreTimestamp(row.createdAt)
              : undefined,
            updatedAt: row.updatedAt
              ? this.toFirestoreTimestamp(row.updatedAt)
              : undefined,
          };
        } catch (parseError) {
          console.debug(
            "sqlite",
            `[SQLite] Error parsing message ${row.id}:`,
            parseError
          );
          // Return a minimal message object to prevent crashes
          return {
            id: row.id,
            conversationId: row.conversationId,
            senderId: row.senderId,
            text: row.text,
            timestamp: this.toFirestoreTimestamp(row.timestamp),
            readBy: {},
            status: row.status as any,
            aiFeatures: undefined,
            createdAt: undefined,
            updatedAt: undefined,
          };
        }
      });
      const conversionEndTime = Date.now();
      console.log(
        "sqlite",
        `[SQLite] 🔄 Message conversion completed: ${
          messages.length
        } messages in ${conversionEndTime - conversionStartTime}ms`
      );

      const totalTime = Date.now() - startTime;
      console.log(
        "sqlite",
        `[SQLite] ✅ Total loadRecentMessages completed in ${totalTime}ms`
      );
      return messages;
    } catch (error) {
      console.error("sqlite", "Error loading recent messages:", error);
      throw error;
    }
  }

  /**
   * Delete old messages (for cleanup)
   */
  async deleteOldMessages(olderThanTimestamp: number): Promise<number> {
    const db = this.db.getDb();

    try {
      const result = await db.runAsync(
        `DELETE FROM messages WHERE timestamp < ?`,
        [olderThanTimestamp]
      );
      return result.changes;
    } catch (error) {
      console.debug("sqlite", "Error deleting old messages:", error);
      throw error;
    }
  }

  /**
   * Save a message to SQLite cache (distinct from queued messages)
   */
  async saveMessageToCache(message: Message): Promise<void> {
    const db = this.db.getDb();

    try {
      const sqliteMessage = this.messageToSQLite(message);
      await this.db.runSingleWrite(async () => {
        await db.runAsync(
          `INSERT OR REPLACE INTO messages 
           (id, conversationId, senderId, text, timestamp, readBy, status, aiFeatures, createdAt, updatedAt, syncedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sqliteMessage.id,
            sqliteMessage.conversationId,
            sqliteMessage.senderId,
            sqliteMessage.text,
            sqliteMessage.timestamp,
            sqliteMessage.readBy,
            sqliteMessage.status,
            sqliteMessage.aiFeatures,
            sqliteMessage.createdAt,
            sqliteMessage.updatedAt,
            sqliteMessage.syncedAt,
          ]
        );
      });
    } catch (error) {
      console.error("sqlite", "Error saving message to cache:", error);
      throw error;
    }
  }

  /**
   * Mark all messages in a conversation as read by a specific user
   */
  async markConversationAsRead(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const db = this.db.getDb();

    try {
      const currentTime = Date.now();

      // Only update messages where this user hasn't read them yet
      await this.db.runSingleWrite(async () => {
        await db.runAsync(
          `UPDATE messages 
           SET readBy = json_set(COALESCE(readBy, '{}'), '$."${userId}"', ?),
               updatedAt = ?,
               syncedAt = ?
           WHERE conversationId = ? 
           AND (readBy IS NULL OR json_extract(readBy, '$."${userId}"') IS NULL)`,
          [currentTime, currentTime, currentTime, conversationId]
        );
      });
    } catch (error) {
      console.debug("sqlite", "Error marking conversation as read:", error);
      throw error;
    }
  }
}
