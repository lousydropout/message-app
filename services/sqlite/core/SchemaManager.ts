import * as SQLite from "expo-sqlite";

/**
 * @fileoverview Schema Manager - Handles the creation and migration of the SQLite database schema.
 *
 * This class is the single source of truth for the application's local database
 * schema. It is responsible for creating all tables, defining their columns and
 * constraints, and setting up indexes to ensure optimal query performance. It
 * also includes logic for handling schema migrations, allowing the database to
 * be updated gracefully as the application evolves.
 *
 * Key responsibilities include:
 * - Enabling performance and integrity features like WAL mode and foreign keys.
 * - Defining the schema for all application tables (e.g., messages, conversations, users).
 * - Creating a rich set of indexes to speed up common queries.
 * - Setting up the FTS5 virtual table for efficient full-text search.
 * - Implementing migration logic to add new columns to existing tables without data loss.
 *
 * @see SQLiteDatabase for how this class is used during database initialization.
 */
export class SchemaManager {
  /**
   * Creates all database tables and indexes
   *
   * This method:
   * - Enables foreign key constraints and WAL mode
   * - Creates all tables (messages, conversations, users, etc.)
   * - Sets up indexes for optimal query performance
   * - Configures FTS5 full-text search if available
   *
   * @param db - The SQLite database instance
   * @throws Error if table creation fails
   */
  async createTables(db: SQLite.SQLiteDatabase): Promise<void> {
    try {
      // Enable foreign key constraints (wrap in try/catch for compatibility)
      try {
        await db.execAsync("PRAGMA foreign_keys = ON;");
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
        await db.execAsync("PRAGMA journal_mode=WAL;");
        // Set WAL checkpoint interval to keep WAL file size manageable
        await db.execAsync("PRAGMA wal_autocheckpoint = 100;");
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

      // Create all tables
      await this.createMessagesTable(db);
      await this.createConversationsTable(db);
      await this.createUsersTable(db);
      await this.createQueuedMessagesTable(db);
      await this.createLogsTable(db);
      await this.createSyncMetadataTable(db);

      console.log("sqlite", "All tables created successfully");
    } catch (error) {
      console.error("sqlite", "Error creating tables:", error);
      throw error;
    }
  }

  /**
   * Creates the `messages` table, along with its indexes and FTS5 virtual table.
   *
   * The table includes a foreign key constraint on `conversationId` to ensure
   * data integrity. A comprehensive set of indexes is created to optimize
   * various query patterns, such as fetching messages by conversation, sender,
   * or status.
   *
   * @param db The SQLite database instance.
   * @private
   */
  private async createMessagesTable(db: SQLite.SQLiteDatabase): Promise<void> {
    // Create messages table
    await db.execAsync(`
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
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp 
        ON messages(conversationId, timestamp DESC);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(senderId);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
    `);

    // Additional composite indexes for better performance
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
        ON messages(conversationId, id);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_updated 
        ON messages(conversationId, updatedAt DESC);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_status 
        ON messages(conversationId, status);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender 
        ON messages(conversationId, senderId);
    `);

    // Triple composite index for optimal message queries
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_updated 
        ON messages(conversationId, id, updatedAt DESC);
    `);

    // Check for FTS5 support before creating full-text search tables
    let hasFTS5 = false;
    try {
      const fts5Check = await db.getFirstAsync<{ value: number }>(
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
        await db.execAsync(`
          CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            text,
            senderId,
            conversationId,
            content='messages',
            content_rowid='rowid'
          );
        `);

        // Create triggers to keep FTS5 in sync
        await db.execAsync(`
          CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(rowid, text, senderId, conversationId)
            VALUES (new.rowid, new.text, new.senderId, new.conversationId);
          END;
        `);

        await db.execAsync(`
          CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, text, senderId, conversationId)
            VALUES('delete', old.rowid, old.text, old.senderId, old.conversationId);
          END;
        `);

        await db.execAsync(`
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
  }

  /**
   * Creates the `conversations` table and its indexes.
   *
   * @param db The SQLite database instance.
   * @private
   */
  private async createConversationsTable(
    db: SQLite.SQLiteDatabase
  ): Promise<void> {
    await db.execAsync(`
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
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_conversations_updated 
        ON conversations(updatedAt DESC);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_conversations_participants 
        ON conversations(participants);
    `);

    // Additional conversation indexes for better performance
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_conversations_type 
        ON conversations(type);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_conversations_type_updated 
        ON conversations(type, updatedAt DESC);
    `);
  }

  /**
   * Creates the `users` table and handles migrations for adding new columns.
   *
   * The migration logic checks for the existence of the `online` and `heartbeat`
   * columns and adds them if they are missing, ensuring that existing users
   * can update to newer versions of the app without losing their data.
   *
   * @param db The SQLite database instance.
   * @private
   */
  private async createUsersTable(db: SQLite.SQLiteDatabase): Promise<void> {
    await db.execAsync(`
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
      const tableInfo = await db.getAllAsync(`PRAGMA table_info(users)`);
      const hasOnlineColumn = tableInfo.some(
        (col: any) => col.name === "online"
      );
      const hasHeartbeatColumn = tableInfo.some(
        (col: any) => col.name === "heartbeat"
      );

      if (!hasOnlineColumn) {
        console.log("sqlite", "Adding 'online' column to users table");
        await db.execAsync(
          `ALTER TABLE users ADD COLUMN online INTEGER NOT NULL DEFAULT 0;`
        );
      }

      if (!hasHeartbeatColumn) {
        console.log("sqlite", "Adding 'heartbeat' column to users table");
        await db.execAsync(
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
  }

  /**
   * Creates the `queued_messages` table and handles complex schema migrations.
   *
   * The migration logic for this table is particularly important, as it handles
   * the transition from an old `tempId` format to the new UUID-based `messageId`.
   * It includes fallback mechanisms to ensure that the migration succeeds even
   * in unexpected scenarios, prioritizing data integrity and application stability.
   *
   * @param db The SQLite database instance.
   * @private
   */
  private async createQueuedMessagesTable(
    db: SQLite.SQLiteDatabase
  ): Promise<void> {
    await db.execAsync(`
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
      const tableInfo = await db.getAllAsync(
        `PRAGMA table_info(queued_messages)`
      );
      const hasTempId = tableInfo.some((col: any) => col.name === "tempId");

      if (hasTempId) {
        console.log(
          "sqlite",
          "Found tempId column, clearing incompatible data and migrating schema"
        );

        // Clear all queued messages (they have old tempId format incompatible with UUIDs)
        await db.execAsync(`DELETE FROM queued_messages;`);
        console.log("sqlite", "Cleared incompatible queued messages");

        // Rename column
        await db.execAsync(`
          ALTER TABLE queued_messages RENAME COLUMN tempId TO messageId;
        `);
        console.log("sqlite", "Successfully renamed tempId to messageId");
      } else {
        console.log(
          "sqlite",
          "No tempId column found, checking for incompatible data"
        );

        // Check if there are any queued messages with old tempId format
        const queuedMessages = await db.getAllAsync(
          `SELECT messageId FROM queued_messages WHERE messageId LIKE 'temp_%'`
        );

        if (queuedMessages.length > 0) {
          console.log(
            "sqlite",
            `Found ${queuedMessages.length} incompatible queued messages, clearing them`
          );
          await db.execAsync(
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
        const tableInfo = await db.getAllAsync(
          `PRAGMA table_info(queued_messages)`
        );
        const hasTempId = tableInfo.some((col: any) => col.name === "tempId");

        if (hasTempId) {
          console.log("sqlite", "Creating new table with compatible data only");
          await db.execAsync(`
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
          await db.execAsync(`
            INSERT INTO queued_messages_new 
            SELECT id, tempId, conversationId, senderId, text, timestamp, retryCount, lastRetryAt, error, createdAt
            FROM queued_messages
            WHERE tempId NOT LIKE 'temp_%';
          `);

          await db.execAsync(`DROP TABLE queued_messages;`);
          await db.execAsync(
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
          const queuedMessages = await db.getAllAsync(
            `SELECT messageId FROM queued_messages WHERE messageId LIKE 'temp_%'`
          );

          if (queuedMessages.length > 0) {
            console.log(
              "sqlite",
              `Found ${queuedMessages.length} incompatible queued messages, clearing them`
            );
            await db.execAsync(
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
        await db.execAsync(`DELETE FROM queued_messages;`);
        console.log("sqlite", "Cleared all queued messages as last resort");
      }
    }

    // Create indexes for queued_messages
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_queued_timestamp 
        ON queued_messages(timestamp ASC);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_queued_conversation 
        ON queued_messages(conversationId);
    `);

    // Additional queued messages indexes
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_queued_conversation_timestamp 
        ON queued_messages(conversationId, timestamp ASC);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_queued_retry_count 
        ON queued_messages(retryCount);
    `);
  }

  /**
   * Creates the `logs` table and its indexes.
   *
   * @param db The SQLite database instance.
   * @private
   */
  private async createLogsTable(db: SQLite.SQLiteDatabase): Promise<void> {
    await db.execAsync(`
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
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category);
    `);
  }

  /**
   * Creates the `sync_metadata` table for tracking synchronization state.
   *
   * @param db The SQLite database instance.
   * @private
   */
  private async createSyncMetadataTable(
    db: SQLite.SQLiteDatabase
  ): Promise<void> {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);
  }
}
