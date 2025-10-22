// Removed logger import to break require cycle - using console.log instead
import { Conversation } from "@/types/Conversation";
import { Log, LogLevel } from "@/types/Log";
import { Message } from "@/types/Message";
import * as SQLite from "expo-sqlite";
import { Timestamp } from "firebase/firestore";

// Helper types for SQLite representations
interface SQLiteMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: number;
  readBy: string; // JSON
  status: string;
  aiFeatures: string | null; // JSON
  createdAt: number | null;
  updatedAt: number | null;
  syncedAt: number | null;
}

interface SQLiteConversation {
  id: string;
  type: string;
  participants: string; // JSON array
  name: string | null;
  createdAt: number;
  updatedAt: number;
  lastMessageId: string | null;
  lastMessageText: string | null;
  lastMessageSenderId: string | null;
  lastMessageTimestamp: number | null;
  unreadCounts: string | null; // JSON
  syncedAt: number | null;
}

interface QueuedMessage {
  id?: number;
  messageId: string; // Actual message ID (UUID)
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: number;
  retryCount: number;
  lastRetryAt: number | null;
  error: string | null;
  createdAt: number;
}

interface SyncMetadata {
  key: string;
  value: string; // JSON
  updatedAt: number;
}

interface SearchResult {
  id: string;
  conversationId: string;
  text: string;
  timestamp: number;
  senderId: string;
}

class SQLiteService {
  private db: SQLite.SQLiteDatabase | null = null;
  private initialized = false;

  /**
   * Initialize the SQLite database and create all tables
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("[INFO] [sqlite] SQLite already initialized");
      return;
    }

    try {
      console.log("sqlite", "Initializing SQLite database");
      this.db = await SQLite.openDatabaseAsync("messageai.db");
      await this.createTables();
      this.initialized = true;
      console.log("sqlite", "SQLite database initialized successfully");
    } catch (error) {
      console.error("sqlite", "Error initializing SQLite", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Create all database tables and indexes
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      // Create messages table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversationId TEXT NOT NULL,
          senderId TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          readBy TEXT,
          status TEXT DEFAULT 'sent',
          aiFeatures TEXT,
          createdAt INTEGER,
          updatedAt INTEGER,
          syncedAt INTEGER,
          FOREIGN KEY (conversationId) REFERENCES conversations(id)
        );
      `);

      // Create indexes for messages
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp 
          ON messages(conversationId, timestamp DESC);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(senderId);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
      `);

      // Additional composite indexes for better performance
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
          ON messages(conversationId, id);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_updated 
          ON messages(conversationId, updatedAt DESC);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_status 
          ON messages(conversationId, status);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender 
          ON messages(conversationId, senderId);
      `);

      // Triple composite index for optimal message queries
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_updated 
          ON messages(conversationId, id, updatedAt DESC);
      `);

      // Create FTS5 virtual table for full-text search
      await this.db.execAsync(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          text,
          senderId,
          conversationId,
          content='messages',
          content_rowid='rowid'
        );
      `);

      // Create triggers to keep FTS5 in sync
      await this.db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, text, senderId, conversationId)
          VALUES (new.rowid, new.text, new.senderId, new.conversationId);
        END;
      `);

      await this.db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, text, senderId, conversationId)
          VALUES('delete', old.rowid, old.text, old.senderId, old.conversationId);
        END;
      `);

      await this.db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, text, senderId, conversationId)
          VALUES('delete', old.rowid, old.text, old.senderId, old.conversationId);
          INSERT INTO messages_fts(rowid, text, senderId, conversationId)
          VALUES (new.rowid, new.text, new.senderId, new.conversationId);
        END;
      `);

      // Create conversations table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
          participants TEXT NOT NULL,
          name TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          lastMessageId TEXT,
          lastMessageText TEXT,
          lastMessageSenderId TEXT,
          lastMessageTimestamp INTEGER,
          unreadCounts TEXT,
          syncedAt INTEGER,
          FOREIGN KEY (lastMessageId) REFERENCES messages(id)
        );
      `);

      // Create indexes for conversations
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_conversations_updated 
          ON conversations(updatedAt DESC);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_conversations_participants 
          ON conversations(participants);
      `);

      // Additional conversation indexes for better performance
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_conversations_type 
          ON conversations(type);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_conversations_type_updated 
          ON conversations(type, updatedAt DESC);
      `);

      // Create queued_messages table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS queued_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          messageId TEXT UNIQUE NOT NULL,
          conversationId TEXT NOT NULL,
          senderId TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          retryCount INTEGER DEFAULT 0,
          lastRetryAt INTEGER,
          error TEXT,
          createdAt INTEGER NOT NULL,
          FOREIGN KEY (conversationId) REFERENCES conversations(id)
        );
      `);

      // Clear incompatible data and migrate schema
      try {
        // Check if tempId column exists
        const tableInfo = await this.db.getAllAsync(
          `PRAGMA table_info(queued_messages)`
        );
        const hasTempId = tableInfo.some((col: any) => col.name === "tempId");

        if (hasTempId) {
          console.log(
            "sqlite",
            "Found tempId column, clearing incompatible data and migrating schema"
          );

          // Clear all queued messages (they have old tempId format incompatible with UUIDs)
          await this.db.execAsync(`DELETE FROM queued_messages;`);
          console.log("sqlite", "Cleared incompatible queued messages");

          // Rename column
          await this.db.execAsync(`
            ALTER TABLE queued_messages RENAME COLUMN tempId TO messageId;
          `);
          console.log("sqlite", "Successfully renamed tempId to messageId");
        } else {
          console.log(
            "sqlite",
            "No tempId column found, checking for incompatible data"
          );

          // Check if there are any queued messages with old tempId format
          const queuedMessages = await this.db.getAllAsync(
            `SELECT messageId FROM queued_messages WHERE messageId LIKE 'temp_%'`
          );

          if (queuedMessages.length > 0) {
            console.log(
              "sqlite",
              `Found ${queuedMessages.length} incompatible queued messages, clearing them`
            );
            await this.db.execAsync(
              `DELETE FROM queued_messages WHERE messageId LIKE 'temp_%';`
            );
            console.log("sqlite", "Cleared incompatible queued messages");
          } else {
            console.log("sqlite", "No incompatible queued messages found");
          }
        }
      } catch (error) {
        // Fallback: create new table and copy compatible data only
        console.log("sqlite", "Migration failed, using fallback approach");
        try {
          const tableInfo = await this.db.getAllAsync(
            `PRAGMA table_info(queued_messages)`
          );
          const hasTempId = tableInfo.some((col: any) => col.name === "tempId");

          if (hasTempId) {
            console.log(
              "sqlite",
              "Creating new table with compatible data only"
            );
            await this.db.execAsync(`
              CREATE TABLE queued_messages_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                messageId TEXT UNIQUE NOT NULL,
                conversationId TEXT NOT NULL,
                senderId TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                retryCount INTEGER DEFAULT 0,
                lastRetryAt INTEGER,
                error TEXT,
                createdAt INTEGER NOT NULL,
                FOREIGN KEY (conversationId) REFERENCES conversations(id)
              );
            `);

            // Only copy messages that don't have tempId format (compatible with UUIDs)
            await this.db.execAsync(`
              INSERT INTO queued_messages_new 
              SELECT id, tempId, conversationId, senderId, text, timestamp, retryCount, lastRetryAt, error, createdAt
              FROM queued_messages
              WHERE tempId NOT LIKE 'temp_%';
            `);

            await this.db.execAsync(`DROP TABLE queued_messages;`);
            await this.db.execAsync(
              `ALTER TABLE queued_messages_new RENAME TO queued_messages;`
            );
            console.log(
              "sqlite",
              "Fallback migration completed (incompatible data cleared)"
            );
          } else {
            console.log(
              "sqlite",
              "No tempId column found, checking for incompatible data"
            );

            // Check if there are any queued messages with old tempId format
            const queuedMessages = await this.db.getAllAsync(
              `SELECT messageId FROM queued_messages WHERE messageId LIKE 'temp_%'`
            );

            if (queuedMessages.length > 0) {
              console.log(
                "sqlite",
                `Found ${queuedMessages.length} incompatible queued messages, clearing them`
              );
              await this.db.execAsync(
                `DELETE FROM queued_messages WHERE messageId LIKE 'temp_%';`
              );
              console.log("sqlite", "Cleared incompatible queued messages");
            }
          }
        } catch (fallbackError) {
          console.log(
            "sqlite",
            "Fallback migration also failed, clearing all queued messages:",
            fallbackError
          );
          // Last resort: clear all queued messages
          await this.db.execAsync(`DELETE FROM queued_messages;`);
          console.log("sqlite", "Cleared all queued messages as last resort");
        }
      }

      // Create indexes for queued_messages
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_queued_timestamp 
          ON queued_messages(timestamp ASC);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_queued_conversation 
          ON queued_messages(conversationId);
      `);

      // Additional queued messages indexes
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_queued_conversation_timestamp 
          ON queued_messages(conversationId, timestamp ASC);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_queued_retry_count 
          ON queued_messages(retryCount);
      `);

      // Create logs table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          level TEXT NOT NULL,
          category TEXT NOT NULL,
          message TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL
        );
      `);

      // Create indexes for logs
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
      `);
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category);
      `);

      // Create sync_metadata table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updatedAt INTEGER NOT NULL
        );
      `);

      console.log("sqlite", "All tables created successfully");
    } catch (error) {
      console.error("sqlite", "Error creating tables:", error);
      throw error;
    }
  }

  // ============================================================================
  // DATA CONVERSION HELPERS
  // ============================================================================

  /**
   * Convert Firestore Timestamp to SQLite INTEGER (epoch milliseconds)
   */
  private toSQLiteTimestamp(timestamp: Timestamp | Date | any): number {
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

  // ============================================================================
  // MESSAGE OPERATIONS
  // ============================================================================

  /**
   * Batch save multiple messages (efficient, atomic)
   */
  async saveMessagesBatch(messages: Message[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    if (messages.length === 0) return;

    const BATCH_SIZE = 90; // 90 messages × 11 params = 990 params (SQLite safe limit)

    try {
      // Use a single transaction for the entire operation
      await this.db.withTransactionAsync(async () => {
        // Process in chunks to stay within SQLite parameter limits
        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
          const batch = messages.slice(i, i + BATCH_SIZE);

          // Prepare batch insert statement
          const placeholders = batch
            .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .join(", ");

          const sql = `INSERT OR REPLACE INTO messages 
                       (id, conversationId, senderId, text, timestamp, readBy, status, aiFeatures, createdAt, updatedAt, syncedAt)
                       VALUES ${placeholders}`;

          // Flatten all parameters into single array
          const params: any[] = [];
          for (const message of batch) {
            const sqliteMessage = this.messageToSQLite(message);
            params.push(
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
              sqliteMessage.syncedAt
            );
          }

          await this.db!.runAsync(sql, params);
        }
      });

      console.log("sqlite", `Batch saved ${messages.length} messages`);
    } catch (error) {
      console.error("sqlite", "Error batch saving messages:", error);
      throw error;
    }
  }

  /**
   * Save a message to SQLite (from Firestore sync)
   */
  async saveMessage(message: Message): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const sqliteMessage = this.messageToSQLite(message);
      await this.db.runAsync(
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
    } catch (error) {
      console.error("sqlite", "Error saving message to SQLite:", error);
      throw error;
    }
  }

  /**
   * Get the latest message timestamp for a conversation
   */
  async getLatestMessageTimestamp(conversationId: string): Promise<number> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const rows = await this.db.getAllAsync<{ timestamp: number }>(
        `SELECT timestamp FROM messages 
         WHERE conversationId = ? 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [conversationId]
      );

      return rows.length > 0 ? rows[0].timestamp : 0;
    } catch (error) {
      console.error("sqlite", "Error getting latest message timestamp:", error);
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
    if (!this.db) throw new Error("Database not initialized");

    try {
      const rows = await this.db.getAllAsync<SQLiteMessage>(
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
    if (!this.db) throw new Error("Database not initialized");

    try {
      // Get messages before (including target)
      const beforeRows = await this.db.getAllAsync<SQLiteMessage>(
        `SELECT * FROM messages 
         WHERE conversationId = ? AND timestamp <= ?
         ORDER BY timestamp DESC 
         LIMIT ?`,
        [conversationId, targetTimestamp, beforeCount]
      );

      // Get messages after
      const afterRows = await this.db.getAllAsync<SQLiteMessage>(
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
   * Search messages using FTS5 full-text search
   */
  async searchMessages(
    searchQuery: string,
    conversationId?: string,
    limit: number = 50
  ): Promise<SearchResult[]> {
    if (!this.db) throw new Error("Database not initialized");

    try {
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

      const rows = await this.db.getAllAsync<SearchResult>(sql, params);
      return rows;
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
    limit: number = 200
  ): Promise<Message[]> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const startTime = Date.now();
      console.log(
        "sqlite",
        `[SQLite] 🔍 Starting query for conversation: ${conversationId}`
      );

      const queryStartTime = Date.now();
      const rows = await this.db.getAllAsync<SQLiteMessage>(
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
          console.error(
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
    if (!this.db) throw new Error("Database not initialized");

    try {
      const result = await this.db.runAsync(
        `DELETE FROM messages WHERE timestamp < ?`,
        [olderThanTimestamp]
      );
      return result.changes;
    } catch (error) {
      console.error("sqlite", "Error deleting old messages:", error);
      throw error;
    }
  }

  /**
   * Save a message to SQLite cache (distinct from queued messages)
   */
  async saveMessageToCache(message: Message): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const sqliteMessage = this.messageToSQLite(message);
      await this.db.runAsync(
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
    } catch (error) {
      console.error("sqlite", "Error saving message to cache:", error);
      throw error;
    }
  }

  // ============================================================================
  // CONVERSATION OPERATIONS
  // ============================================================================

  /**
   * Save a conversation to SQLite (from Firestore sync)
   */
  async saveConversation(conversation: Conversation): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const sqliteConversation = this.conversationToSQLite(conversation);
      await this.db.runAsync(
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
    } catch (error) {
      console.error("sqlite", "Error saving conversation to SQLite:", error);
      throw error;
    }
  }

  /**
   * Get all conversations for a user (optimized)
   */
  async getConversations(userId: string): Promise<Conversation[]> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      console.log(
        "sqlite",
        `[SQLite] Loading conversations for user: ${userId}`
      );
      const startTime = Date.now();

      // Use a more efficient query - get all conversations and filter in memory
      // This is faster than LIKE queries on JSON strings
      const rows = await this.db.getAllAsync<SQLiteConversation>(
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
          console.error(
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
          console.error(
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
    if (!this.db) throw new Error("Database not initialized");

    try {
      const row = await this.db.getFirstAsync<SQLiteConversation>(
        `SELECT * FROM conversations WHERE id = ?`,
        [conversationId]
      );

      return row ? this.sqliteToConversation(row) : null;
    } catch (error) {
      console.error("sqlite", "Error getting conversation from SQLite:", error);
      throw error;
    }
  }

  // ============================================================================
  // QUEUED MESSAGE OPERATIONS
  // ============================================================================

  /**
   * Add a message to the queue (when offline)
   */
  async queueMessage(
    messageId: string,
    conversationId: string,
    senderId: string,
    text: string
  ): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const now = Date.now();
      await this.db.runAsync(
        `INSERT INTO queued_messages 
         (messageId, conversationId, senderId, text, timestamp, retryCount, createdAt)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [messageId, conversationId, senderId, text, now, now]
      );
    } catch (error) {
      console.error("sqlite", "Error queuing message:", error);
      throw error;
    }
  }

  /**
   * Get all queued messages
   */
  async getQueuedMessages(): Promise<QueuedMessage[]> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const rows = await this.db.getAllAsync<QueuedMessage>(
        `SELECT * FROM queued_messages ORDER BY timestamp ASC`
      );
      return rows;
    } catch (error) {
      console.error("sqlite", "Error getting queued messages:", error);
      throw error;
    }
  }

  /**
   * Remove a message from the queue (after successful send)
   */
  async removeQueuedMessage(messageId: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      await this.db.runAsync(
        `DELETE FROM queued_messages WHERE messageId = ?`,
        [messageId]
      );
    } catch (error) {
      console.error("sqlite", "Error removing queued message:", error);
      throw error;
    }
  }

  /**
   * Update retry count for a queued message (after failed send)
   */
  async updateQueuedMessageRetry(
    messageId: string,
    error: string
  ): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      await this.db.runAsync(
        `UPDATE queued_messages 
         SET retryCount = retryCount + 1, lastRetryAt = ?, error = ?
         WHERE messageId = ?`,
        [Date.now(), error, messageId]
      );
    } catch (error) {
      console.error("sqlite", "Error updating queued message retry:", error);
      throw error;
    }
  }

  /**
   * Clear all queued messages (for testing/reset)
   */
  async clearQueuedMessages(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      await this.db.runAsync(`DELETE FROM queued_messages`);
    } catch (error) {
      console.error("sqlite", "Error clearing queued messages:", error);
      throw error;
    }
  }

  // ============================================================================
  // SYNC METADATA OPERATIONS
  // ============================================================================

  /**
   * Get sync metadata by key
   */
  async getSyncMetadata(key: string): Promise<any | null> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const row = await this.db.getFirstAsync<SyncMetadata>(
        `SELECT * FROM sync_metadata WHERE key = ?`,
        [key]
      );

      return row ? JSON.parse(row.value) : null;
    } catch (error) {
      console.error("sqlite", "Error getting sync metadata:", error);
      throw error;
    }
  }

  /**
   * Set sync metadata
   */
  async setSyncMetadata(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO sync_metadata (key, value, updatedAt)
         VALUES (?, ?, ?)`,
        [key, JSON.stringify(value), Date.now()]
      );
    } catch (error) {
      console.error("sqlite", "Error setting sync metadata:", error);
      throw error;
    }
  }

  /**
   * Get lastSyncedAt for a conversation
   */
  async getLastSyncedAt(conversationId: string): Promise<number> {
    const value = await this.getSyncMetadata(`lastSync_${conversationId}`);
    return value || 0; // Return 0 if never synced
  }

  /**
   * Set lastSyncedAt for a conversation
   */
  async setLastSyncedAt(
    conversationId: string,
    timestamp: number
  ): Promise<void> {
    await this.setSyncMetadata(`lastSync_${conversationId}`, timestamp);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clear all data (for logout/reset)
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      await this.db.execAsync(`DELETE FROM messages`);
      await this.db.execAsync(`DELETE FROM conversations`);
      await this.db.execAsync(`DELETE FROM queued_messages`);
      await this.db.execAsync(`DELETE FROM sync_metadata`);
      console.log("sqlite", "All SQLite data cleared");
    } catch (error) {
      console.error("sqlite", "Error clearing all data:", error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    messages: number;
    conversations: number;
    queuedMessages: number;
  }> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const messageCount = await this.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM messages`
      );
      const conversationCount = await this.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM conversations`
      );
      const queuedCount = await this.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM queued_messages`
      );

      return {
        messages: messageCount?.count || 0,
        conversations: conversationCount?.count || 0,
        queuedMessages: queuedCount?.count || 0,
      };
    } catch (error) {
      console.error("sqlite", "Error getting stats:", error);
      throw error;
    }
  }

  async getIndexes(): Promise<string[]> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const indexes = await this.db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      return indexes.map((row) => row.name);
    } catch (error) {
      console.error("sqlite", "Error getting indexes:", error);
      throw error;
    }
  }

  // ============================================================================
  // LOG METHODS
  // ============================================================================

  /**
   * Save a log entry to the database
   */
  async saveLog(log: Log): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      await this.db.runAsync(
        `INSERT INTO logs (id, timestamp, level, category, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          log.id,
          log.timestamp,
          log.level,
          log.category,
          log.message,
          log.metadata ? JSON.stringify(log.metadata) : null,
          Date.now(),
        ]
      );
    } catch (error) {
      console.error("sqlite", "Error saving log:", error);
      throw error;
    }
  }

  /**
   * Get logs with optional filtering
   */
  async getLogs(limit: number = 100, minLevel?: LogLevel): Promise<Log[]> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      let query = `SELECT * FROM logs`;
      const params: any[] = [];

      if (minLevel) {
        const levelOrder = ["debug", "info", "warning", "error"];
        const minLevelIndex = levelOrder.indexOf(minLevel);
        const levels = levelOrder.slice(minLevelIndex);
        query += ` WHERE level IN (${levels.map(() => "?").join(", ")})`;
        params.push(...levels);
      }

      query += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(limit);

      const rows = await this.db.getAllAsync(query, params);
      return rows.map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level as LogLevel,
        category: row.category,
        message: row.message,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }));
    } catch (error) {
      console.error("sqlite", "Error getting logs:", error);
      throw error;
    }
  }

  /**
   * Get logs by category
   */
  async getLogsByCategory(
    category: string,
    limit: number = 100
  ): Promise<Log[]> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const rows = await this.db.getAllAsync(
        `SELECT * FROM logs WHERE category = ? ORDER BY timestamp DESC LIMIT ?`,
        [category, limit]
      );
      return rows.map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level as LogLevel,
        category: row.category,
        message: row.message,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }));
    } catch (error) {
      console.error("sqlite", "Error getting logs by category:", error);
      throw error;
    }
  }

  /**
   * Clear old logs (older than specified days)
   */
  async clearOldLogs(olderThanDays: number = 7): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      await this.db.runAsync(`DELETE FROM logs WHERE timestamp < ?`, [
        cutoffTime,
      ]);
    } catch (error) {
      console.error("sqlite", "Error clearing old logs:", error);
      throw error;
    }
  }

  /**
   * Clear all logs
   */
  async clearAllLogs(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      await this.db.execAsync(`DELETE FROM logs`);
    } catch (error) {
      console.error("sqlite", "Error clearing all logs:", error);
      throw error;
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
export default new SQLiteService();
