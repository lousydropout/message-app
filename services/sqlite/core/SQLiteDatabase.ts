import { SchemaManager } from "@/services/sqlite/core/SchemaManager";
import * as SQLite from "expo-sqlite";
import { AppState } from "react-native";

/**
 * @fileoverview Core SQLite Database class - handles connection, write queue, and retry logic
 *
 * This class provides the foundation for all SQLite operations with:
 * - Promise-based write queue to prevent "database is locked" errors
 * - Exponential backoff retry strategy for SQLITE_BUSY errors
 * - AppState handling for graceful shutdown
 * - WAL journal mode for better concurrent performance
 *
 * The write queue ensures that all database write operations are serialized,
 * preventing the common "database is locked" error that occurs when multiple
 * operations try to write simultaneously. The retry logic handles transient
 * failures with exponential backoff.
 */
export class SQLiteDatabase {
  /** The SQLite database instance */
  private db: SQLite.SQLiteDatabase | null = null;
  /** Whether the database has been initialized */
  private initialized = false;
  /** Promise-based write queue to serialize write operations */
  private writeMutex: Promise<void> = Promise.resolve();
  /** AppState subscription for handling app lifecycle events */
  private appStateSubscription: any = null;
  /** Schema manager for handling table creation and migrations */
  private schemaManager: SchemaManager;

  constructor() {
    this.schemaManager = new SchemaManager();
  }

  /**
   * Initializes the SQLite database connection and creates all necessary tables
   *
   * This method:
   * - Opens the database connection
   * - Creates all tables and indexes via SchemaManager
   * - Sets up AppState handling for graceful shutdown
   * - Enables WAL mode for better concurrency
   *
   * @throws Error if database initialization fails
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
      await this.schemaManager.createTables(this.db);
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
   * Get the database instance (for repositories to use)
   */
  getDb(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

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
  async enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
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
  async runWithRetries<T>(
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
  async runSingleWrite<T>(operation: () => Promise<T>): Promise<T> {
    return this.runWithRetries(async () => {
      return await this.enqueueWrite(async () => {
        return await operation();
      });
    });
  }

  /**
   * Gets database statistics including record counts for all tables
   *
   * @returns Object containing counts for messages, conversations, and queued messages
   * @throws Error if database is not initialized
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

  /**
   * Gets all custom database indexes (excluding SQLite system indexes)
   *
   * @returns Array of index names
   * @throws Error if database is not initialized
   */
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

  /**
   * Clears all data from all tables (used for logout/reset)
   *
   * This method deletes all records from:
   * - messages
   * - conversations
   * - queued_messages
   * - sync_metadata
   * - logs
   * - users
   *
   * @throws Error if database is not initialized
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
   * Cleans up resources and closes the database connection
   *
   * This method:
   * - Waits for any pending write operations to complete
   * - Removes AppState subscription
   * - Closes the database connection
   * - Resets initialization state
   *
   * @throws Error if cleanup fails
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
