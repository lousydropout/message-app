// Removed logger import to break require cycle - using console.log instead
import { Conversation } from "@/types/Conversation";
import { Log, LogLevel } from "@/types/Log";
import { Message } from "@/types/Message";
import { User } from "@/types/User";
import * as SQLite from "expo-sqlite";
import { Timestamp } from "firebase/firestore";
import { AppState } from "react-native";

/**
 * SQLite Service - Expo-SQLite Constraint Compliance & Performance Optimized
 *
 * This service has been designed to handle the specific constraints of the expo-sqlite wrapper
 * with performance optimizations and robust error handling:
 *
 * 1. **WAL Journal Mode**: Enabled with checkpoint optimization for better concurrent read/write performance
 *
 * 2. **Optimized Write Patterns**:
 *    - Single-row writes use `runSingleWrite()` (skips exclusive transaction overhead)
 *    - Batch operations use `withExclusiveTransactionAsync` for atomicity
 *
 * 3. **Promise-Based Write Queue**: Implements a Promise-based write queue (enqueueWrite) to ensure
 *    sequential write operations and prevent "database is locked" errors from concurrent writes.
 *
 * 4. **Enhanced Retry Strategy**: Implements exponential backoff with ceiling (100ms, 200ms, 400ms, 500ms, 500ms)
 *    for "database is locked" and "SQLITE_BUSY" errors with up to 5 attempts.
 *
 * 5. **Parameter Limits**: All batch operations respect the 999 parameter limit (11 params per
 *    message × 90 messages = 990 parameters, safely under the limit).
 *
 * 6. **AppState Handling**: Graceful shutdown handling to ensure write queue completion before
 *    app suspension, preventing data corruption.
 *
 * 7. **Resource Management**: Proper cleanup of AppState subscriptions and database connections
 *    to prevent memory leaks and handle app lifecycle events.
 *
 * 8. **Statement Hygiene**: All async operations automatically finalize statements, preventing
 *    statement leaks that could cause "database is locked" errors.
 */

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

interface SQLiteUser {
  id: string;
  email: string;
  displayName: string;
  avatar: string | null;
  languagePreferences: string; // JSON array
  aiSettings: string; // JSON object
  blockedUsers: string; // JSON array
  createdAt: number;
  lastSeen: number;
  online: number; // 0 or 1
  heartbeat: number; // timestamp in milliseconds
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
  private writeMutex: Promise<void> = Promise.resolve(); // Promise-based write queue
  private appStateSubscription: any = null;

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

      // Clean up any existing database handle to prevent hot reload issues
      if (this.db) {
        try {
          await this.db.closeAsync();
        } catch (closeError) {
          console.warn(
            "sqlite",
            "Error closing existing database handle:",
            closeError
          );
        }
        this.db = null;
      }

      this.db = await SQLite.openDatabaseAsync("messageai.db");
      await this.createTables();
      this.setupAppStateHandling();
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
      // Enable foreign key constraints (wrap in try/catch for compatibility)
      try {
        await this.db.execAsync("PRAGMA foreign_keys = ON;");
        console.log("sqlite", "Enabled foreign key constraints");
      } catch (pragmaError) {
        console.warn(
          "sqlite",
          "Foreign keys not supported on this build:",
          pragmaError
        );
      }

      // Enable WAL mode for better concurrent read/write performance (wrap in try/catch)
      try {
        await this.db.execAsync("PRAGMA journal_mode=WAL;");
        // Set WAL checkpoint interval to keep WAL file size manageable
        await this.db.execAsync("PRAGMA wal_autocheckpoint = 100;");
        console.log(
          "sqlite",
          "Enabled WAL journal mode with checkpoint optimization"
        );
      } catch (pragmaError) {
        console.warn(
          "sqlite",
          "WAL mode not supported on this build:",
          pragmaError
        );
      }
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

      // Check for FTS5 support before creating full-text search tables
      let hasFTS5 = false;
      try {
        const fts5Check = await this.db.getFirstAsync<{ value: number }>(
          "SELECT 1 as value FROM pragma_compile_options WHERE compile_options LIKE '%FTS5%'"
        );
        hasFTS5 = !!fts5Check;
        console.log("sqlite", `FTS5 support detected: ${hasFTS5}`);
      } catch (fts5Error) {
        console.warn("sqlite", "Could not check FTS5 support:", fts5Error);
        hasFTS5 = false;
      }

      // Create FTS5 virtual table for full-text search (only if supported)
      if (hasFTS5) {
        try {
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

          console.log(
            "sqlite",
            "FTS5 virtual table and triggers created successfully"
          );
        } catch (fts5Error) {
          console.warn(
            "sqlite",
            "FTS5 table creation failed, continuing without full-text search:",
            fts5Error
          );
        }
      } else {
        console.warn(
          "sqlite",
          "FTS5 not supported on this Expo build, skipping full-text search setup"
        );
      }

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

      // Create users table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          displayName TEXT NOT NULL,
          avatar TEXT,
          languagePreferences TEXT NOT NULL,
          aiSettings TEXT NOT NULL,
          blockedUsers TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          lastSeen INTEGER NOT NULL,
          syncedAt INTEGER
        );
      `);

      // Check if we need to add the new columns (migration for existing databases)
      try {
        const tableInfo = await this.db.getAllAsync(`PRAGMA table_info(users)`);
        const hasOnlineColumn = tableInfo.some(
          (col: any) => col.name === "online"
        );
        const hasHeartbeatColumn = tableInfo.some(
          (col: any) => col.name === "heartbeat"
        );

        if (!hasOnlineColumn) {
          console.log("sqlite", "Adding 'online' column to users table");
          await this.db.execAsync(
            `ALTER TABLE users ADD COLUMN online INTEGER NOT NULL DEFAULT 0;`
          );
        }

        if (!hasHeartbeatColumn) {
          console.log("sqlite", "Adding 'heartbeat' column to users table");
          await this.db.execAsync(
            `ALTER TABLE users ADD COLUMN heartbeat INTEGER NOT NULL DEFAULT 0;`
          );
        }

        if (!hasOnlineColumn || !hasHeartbeatColumn) {
          console.log("sqlite", "Successfully migrated users table schema");
        }
      } catch (migrationError) {
        console.warn(
          "sqlite",
          "Error during users table migration:",
          migrationError
        );
        // Continue anyway - the app should still work
      }

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
  // UTILITY METHODS FOR EXPO-SQLITE CONSTRAINTS
  // ============================================================================

  /**
   * Setup AppState handling for graceful shutdown
   */
  private setupAppStateHandling(): void {
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "background" || nextAppState === "inactive") {
          console.log(
            "sqlite",
            "App going to background, awaiting write queue completion"
          );
          // Wait for current write operations to complete before app suspends
          this.writeMutex
            .then(() => {
              console.log(
                "sqlite",
                "Write queue completed, app can safely suspend"
              );
            })
            .catch((error) => {
              console.error(
                "sqlite",
                "Error in write queue during app suspend:",
                error
              );
            });
        }
      }
    );
  }

  /**
   * Cleanup AppState subscription
   */
  private cleanupAppStateHandling(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  /**
   * Promise-based write queue to ensure sequential write operations
   * This prevents "database is locked" errors by serializing all writes
   */
  private async enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    // Chain tasks to ensure sequential execution
    const previous = this.writeMutex;
    let resolveNext: () => void;
    this.writeMutex = new Promise<void>((resolve) => (resolveNext = resolve));

    try {
      await previous; // Wait for any previous write
      return await task();
    } finally {
      resolveNext!(); // Allow the next write to proceed
    }
  }

  /**
   * Retry logic for database operations that might encounter "database is locked" errors
   * Handles both "database is locked" and "SQLITE_BUSY" errors with exponential backoff
   */
  private async runWithRetries<T>(
    operation: () => Promise<T>,
    retries: number = 5,
    baseDelayMs: number = 100
  ): Promise<T> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await operation();
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        const isLockError =
          msg.includes("database is locked") ||
          msg.includes("SQLITE_BUSY") ||
          err?.code === 5;

        if (isLockError && attempt < retries - 1) {
          // Exponential backoff with ceiling: 100ms, 200ms, 400ms, 500ms, 500ms
          const delay = Math.min(baseDelayMs * Math.pow(2, attempt), 500);
          console.log(
            `sqlite`,
            `Database locked, retrying in ${delay}ms (attempt ${
              attempt + 1
            }/${retries})`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      `Database operation failed after ${retries} retries (locked)`
    );
  }

  /**
   * Optimized single-row write operation (skips exclusive transaction overhead)
   * Use this for simple INSERT/UPDATE/DELETE operations that don't need transaction guarantees
   */
  private async runSingleWrite<T>(operation: () => Promise<T>): Promise<T> {
    return this.runWithRetries(async () => {
      return await this.enqueueWrite(async () => {
        return await operation();
      });
    });
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
  async saveMessagesBatch(messages: Message[]): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");
    if (messages.length === 0) return;

    // For small batches, use simple writes to avoid exclusive transaction overhead
    if (messages.length <= 10) {
      try {
        await this.enqueueWrite(async () => {
          for (const message of messages) {
            const m = this.messageToSQLite(message);
            await this.db!.runAsync(
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
      await this.runWithRetries(async () => {
        await this.enqueueWrite(async () => {
          // Use manual transaction instead of withExclusiveTransactionAsync
          await this.db!.execAsync("BEGIN IMMEDIATE");
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

              await this.db!.runAsync(sql, params);
            }
            await this.db!.execAsync("COMMIT");
          } catch (error) {
            await this.db!.execAsync("ROLLBACK");
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
    if (!this.db) throw new Error("Database not initialized");

    try {
      const sqliteMessage = this.messageToSQLite(message);
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
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
   * Search messages using FTS5 full-text search (fallback to LIKE if FTS5 unavailable)
   */
  async searchMessages(
    searchQuery: string,
    conversationId?: string,
    limit: number = 50
  ): Promise<SearchResult[]> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      // Check if FTS5 table exists
      const fts5Exists = await this.db.getFirstAsync<{ count: number }>(
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

        const rows = await this.db.getAllAsync<SearchResult>(sql, params);
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

        const rows = await this.db.getAllAsync<SearchResult>(sql, params);
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
    if (!this.db) throw new Error("Database not initialized");

    try {
      const result = await this.db.runAsync(
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
    if (!this.db) throw new Error("Database not initialized");

    try {
      const sqliteMessage = this.messageToSQLite(message);
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
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

      // Pre-insert guard: Check if referenced lastMessage exists
      if (sqliteConversation.lastMessageId) {
        const messageExists = await this.db.getFirstAsync<{ count: number }>(
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

      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
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
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
          `INSERT INTO queued_messages 
           (messageId, conversationId, senderId, text, timestamp, retryCount, createdAt)
           VALUES (?, ?, ?, ?, ?, 0, ?)`,
          [messageId, conversationId, senderId, text, now, now]
        );
      });
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
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
          `DELETE FROM queued_messages WHERE messageId = ?`,
          [messageId]
        );
      });
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
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
          `UPDATE queued_messages 
           SET retryCount = retryCount + 1, lastRetryAt = ?, error = ?
           WHERE messageId = ?`,
          [Date.now(), error, messageId]
        );
      });
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
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(`DELETE FROM queued_messages`);
      });
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
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
          `INSERT OR REPLACE INTO sync_metadata (key, value, updatedAt)
           VALUES (?, ?, ?)`,
          [key, JSON.stringify(value), Date.now()]
        );
      });
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
      await this.runWithRetries(async () => {
        await this.enqueueWrite(async () => {
          // Use manual transaction for data clearing
          await this.db!.execAsync("BEGIN IMMEDIATE");
          try {
            await this.db!.execAsync(`DELETE FROM messages`);
            await this.db!.execAsync(`DELETE FROM conversations`);
            await this.db!.execAsync(`DELETE FROM queued_messages`);
            await this.db!.execAsync(`DELETE FROM sync_metadata`);
            await this.db!.execAsync(`DELETE FROM logs`);
            await this.db!.execAsync(`DELETE FROM users`);
            await this.db!.execAsync("COMMIT");
          } catch (error) {
            await this.db!.execAsync("ROLLBACK");
            throw error;
          }
        });
      });
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
      console.debug("sqlite", "Error getting stats:", error);
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
      console.debug("sqlite", "Error getting indexes:", error);
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
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
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
      });
    } catch (error) {
      console.debug("sqlite", "Error saving log:", error);
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
      console.debug("sqlite", "Error getting logs:", error);
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
      console.debug("sqlite", "Error getting logs by category:", error);
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
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(`DELETE FROM logs WHERE timestamp < ?`, [
          cutoffTime,
        ]);
      });
    } catch (error) {
      console.debug("sqlite", "Error clearing old logs:", error);
      throw error;
    }
  }

  /**
   * Clear all logs
   */
  async clearAllLogs(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      await this.runSingleWrite(async () => {
        await this.db!.execAsync(`DELETE FROM logs`);
      });
    } catch (error) {
      console.debug("sqlite", "Error clearing all logs:", error);
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
    if (!this.db) throw new Error("Database not initialized");

    try {
      const currentTime = Date.now();

      // Only update messages where this user hasn't read them yet
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
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

  /**
   * Save user profile to local cache
   */
  async saveUserProfile(user: User): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      await this.runSingleWrite(async () => {
        await this.db!.runAsync(
          `
          INSERT OR REPLACE INTO users (
            id, email, displayName, avatar, languagePreferences,
            aiSettings, blockedUsers, createdAt, lastSeen, online, heartbeat, syncedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            user.id,
            user.email,
            user.displayName,
            user.avatar || null,
            JSON.stringify(user.languagePreferences),
            JSON.stringify(user.aiSettings),
            JSON.stringify(user.blockedUsers),
            user.createdAt?.toMillis() || Date.now(),
            user.lastSeen?.toMillis() || Date.now(),
            user.online ? 1 : 0,
            user.heartbeat?.toMillis() || 0,
            Date.now(),
          ]
        );
      });
    } catch (error) {
      console.error("sqlite", "Error saving user profile:", error);
      throw error;
    }
  }

  /**
   * Get user profile from local cache
   */
  async getUserProfile(userId: string): Promise<User | null> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const row = await this.db.getFirstAsync<SQLiteUser>(
        "SELECT * FROM users WHERE id = ?",
        [userId]
      );

      if (!row) return null;

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
      } as User;
    } catch (error) {
      console.error("sqlite", "Error getting user profile:", error);
      throw error;
    }
  }

  /**
   * Get multiple user profiles from local cache
   */
  async getUserProfiles(userIds: string[]): Promise<User[]> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      if (userIds.length === 0) {
        return [];
      }

      const placeholders = userIds.map(() => "?").join(",");
      const rows = await this.db.getAllAsync<SQLiteUser>(
        `SELECT * FROM users WHERE id IN (${placeholders})`,
        userIds
      );

      return rows.map((row) => ({
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
      })) as User[];
    } catch (error) {
      console.error("sqlite", "Error getting user profiles:", error);
      throw error;
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources and close database connection
   */
  async cleanup(): Promise<void> {
    try {
      console.log("sqlite", "Cleaning up SQLite service");

      // Wait for any pending write operations to complete
      await this.writeMutex;

      // Cleanup AppState subscription
      this.cleanupAppStateHandling();

      // Close database connection
      if (this.db) {
        await this.db.closeAsync();
        this.db = null;
      }

      this.initialized = false;
      console.log("sqlite", "SQLite service cleanup completed");
    } catch (error) {
      console.error("sqlite", "Error during cleanup:", error);
      throw error;
    }
  }
}

// Export singleton instance
export default new SQLiteService();
