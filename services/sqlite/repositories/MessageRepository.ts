import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import {
  SQLiteMessage,
  SearchResult,
  TimestampInput,
} from "@/services/sqlite/core/types";
import { Message } from "@/types/Message";
import { Timestamp } from "firebase/firestore";

/**
 * @fileoverview Message Repository - Manages message data in the local SQLite database.
 *
 * This repository is responsible for all CRUD (Create, Read, Update, Delete)
 * operations on the `messages` table. It serves as the primary local cache for
 * message data synced from Firestore, providing offline access and enabling
 * features like full-text search. It includes optimized methods for batch
 * saving, paginated retrieval, and context-aware queries (e.g., fetching
 * messages around a specific timestamp).
 *
 * @see messagesStore for how this repository is used to manage the message cache.
 * @see SchemaManager for the `messages` and `messages_fts` table schemas.
 */
export class MessageRepository {
  constructor(private db: SQLiteDatabase) {}

  /**
   * Converts a Firestore `Timestamp` object to a SQLite INTEGER (epoch milliseconds).
   * @param timestamp The `Timestamp` object from Firestore.
   * @returns An epoch milliseconds number.
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
   * Converts a Firestore `Message` object to a format suitable for SQLite.
   *
   * This involves serializing complex types like the `readBy` and `aiFeatures`
   * objects into JSON strings and converting Firestore `Timestamp` objects to
   * epoch milliseconds.
   *
   * @param message The `Message` object from Firestore.
   * @returns An `SQLiteMessage` object ready for insertion into the database.
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
   * Converts a raw SQLite row into a `Message` object.
   *
   * This involves parsing JSON strings back into their original object formats
   * and converting epoch millisecond timestamps back to Firestore `Timestamp` objects.
   *
   * @param row The `SQLiteMessage` object from the database.
   * @returns A `Message` object.
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
   * Saves a batch of messages to the SQLite database with high efficiency.
   *
   * This method is optimized to handle both small and large batches of messages.
   * For small batches (<= 10 messages), it uses a simple series of individual writes.
   * For larger batches, it uses a manual transaction with batched `INSERT` statements
   * to avoid exceeding SQLite's 999-parameter limit per query and to ensure
   * atomicity and performance.
   *
   * @param messages An array of `Message` objects to save.
   * @returns A promise that resolves when the batch save is complete.
   * @throws An error if the database operation fails.
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
   * Saves a single message to the SQLite database.
   *
   * This performs an "upsert" (INSERT OR REPLACE) operation.
   *
   * @param message The `Message` object to save.
   * @returns A promise that resolves when the message is saved.
   * @throws An error if the database operation fails.
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
   * Retrieves the timestamp of the most recent message in a conversation.
   *
   * This is used to determine the starting point for an incremental sync,
   * allowing the app to fetch only the messages it has missed.
   *
   * @param conversationId The ID of the conversation.
   * @returns A promise that resolves to the timestamp of the latest message, or 0 if none exists.
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
   * Retrieves a paginated list of messages for a conversation.
   *
   * @param conversationId The ID of the conversation.
   * @param limit The maximum number of messages to retrieve.
   * @param offset The number of messages to skip (for pagination).
   * @returns A promise that resolves to an array of `Message` objects.
   * @throws An error if the database query fails.
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
   * Retrieves messages centered around a specific timestamp.
   *
   * This is useful for features like "jump to message" from a search result,
   * where the UI needs to display the context around a particular message.
   *
   * @param conversationId The ID of the conversation.
   * @param targetTimestamp The timestamp to center the results around.
   * @param beforeCount The number of messages to fetch before the target.
   * @param afterCount The number of messages to fetch after the target.
   * @returns A promise that resolves to an array of `Message` objects.
   * @throws An error if the database query fails.
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
   * Searches for messages using the FTS5 full-text search extension.
   *
   * If the FTS5 virtual table is available, it performs an efficient full-text
   * search. If not, it falls back to a slower `LIKE` query to ensure functionality.
   *
   * @param searchQuery The text to search for.
   * @param conversationId An optional ID to limit the search to a specific conversation.
   * @param limit The maximum number of search results to return.
   * @returns A promise that resolves to an array of `SearchResult` objects.
   * @throws An error if the search operation fails.
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
          sql = `WITH fts_results AS (
                   SELECT rowid
                   FROM messages_fts
                   WHERE messages_fts MATCH ?
                 )
                 SELECT m.id, m.conversationId, m.text, m.timestamp, m.senderId
                 FROM messages m
                 JOIN fts_results f ON m.rowid = f.rowid
                 WHERE m.conversationId = ?
                 ORDER BY m.timestamp DESC
                 LIMIT ?`;
          params = [searchQuery, conversationId, limit];
        } else {
          sql = `WITH fts_results AS (
                   SELECT rowid
                   FROM messages_fts
                   WHERE messages_fts MATCH ?
                 )
                 SELECT m.id, m.conversationId, m.text, m.timestamp, m.senderId
                 FROM messages m
                 JOIN fts_results f ON m.rowid = f.rowid
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
   * Loads a batch of recent messages for a conversation.
   *
   * This method is optimized for quickly loading the initial message view
   * when a user opens a conversation.
   *
   * @param conversationId The ID of the conversation.
   * @param limit The maximum number of recent messages to load.
   * @returns A promise that resolves to an array of `Message` objects.
   * @throws An error if the database query fails.
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
   * Deletes messages from the database that are older than a given timestamp.
   *
   * This is a maintenance function to manage the size of the local cache.
   *
   * @param olderThanTimestamp The timestamp before which messages should be deleted.
   * @returns A promise that resolves to the number of messages deleted.
   * @throws An error if the delete operation fails.
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
   * Saves a message to the local cache.
   *
   * This is an "upsert" (INSERT OR REPLACE) operation, typically used to update
   * the local cache with data from Firestore.
   *
   * @param message The `Message` object to save.
   * @returns A promise that resolves when the message is saved.
   * @throws An error if the database operation fails.
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
   * Marks all messages in a conversation as read by a specific user.
   *
   * This method uses SQLite's `json_set` function to efficiently update the
   * `readBy` JSON object for all relevant messages in a single query.
   *
   * @param conversationId The ID of the conversation.
   * @param userId The ID of the user who has read the messages.
   * @returns A promise that resolves when the update is complete.
   * @throws An error if the database operation fails.
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
