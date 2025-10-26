import { SchemaManager } from "@/services/sqlite/core/SchemaManager";
import * as SQLite from "expo-sqlite";
import { AppState } from "react-native";

/**
 * @fileoverview Core SQLite Database Class - The foundation of the local database layer.
 *
 * This class is the central hub for all SQLite operations. It encapsulates the
 * low-level details of managing the database connection, ensuring data integrity,
 * and handling the concurrency challenges inherent in a mobile environment. Its
 * key features are a promise-based write queue to serialize all write operations
 * and a robust retry mechanism with exponential backoff to handle transient
 * "database is locked" errors.
 *
 * This class is not intended to be used directly by the application's feature
 * logic. Instead, it serves as the underlying engine for the `SQLiteService`
 * facade and the various repository classes, providing them with a stable and
 * reliable interface to the database.
 *
 * @see SQLiteService for the public-facing API that uses this class.
 * @see SchemaManager for how the database schema is created and managed.
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
   * Returns the raw `expo-sqlite` database instance.
   *
   * This method is intended for use by the repository classes, which need
   * direct access to the database to execute queries.
   *
   * @returns The active `SQLite.SQLiteDatabase` instance.
   * @throws An error if the database has not been initialized.
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
   * Sets up a listener for application state changes to ensure data integrity.
   *
   * When the app moves to the background, this listener waits for any pending
   * write operations in the queue to complete before allowing the app to be
   * suspended. This prevents data corruption that could occur if a write
   * operation is interrupted mid-transaction.
   *
   * @private
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
   * Removes the AppState change listener.
   *
   * This is called during the cleanup process to prevent memory leaks.
   *
   * @private
   */
  private cleanupAppStateHandling(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  /**
   * Enqueues a write operation to be executed sequentially.
   *
   * This method implements a promise-based mutex (mutual exclusion) to ensure
   * that only one write operation can be executed at a time. This is the primary
   * mechanism for preventing "database is locked" errors.
   *
   * @param task An async function that performs the write operation.
   * @returns A promise that resolves with the result of the task.
   * @template T The return type of the task.
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
   * Executes a database operation with a retry mechanism for lock errors.
   *
   * This method wraps a given operation in a retry loop that will re-attempt
   * the operation if it fails with a "database is locked" or "SQLITE_BUSY"
   * error. It uses an exponential backoff strategy, increasing the delay
   * between retries to give the database time to become available.
   *
   * @param operation The async database operation to execute.
   * @param retries The maximum number of times to retry the operation.
   * @param baseDelayMs The initial delay between retries, in milliseconds.
   * @returns A promise that resolves with the result of the operation.
   * @template T The return type of the operation.
   * @throws An error if the operation fails after all retries.
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
   * An optimized method for executing a single, non-transactional write operation.
   *
   * This method combines the write queue and retry logic for simple write
   * operations (e.g., a single `INSERT` or `UPDATE`). It is more efficient than
   * wrapping a single operation in a full transaction.
   *
   * @param operation The async write operation to execute.
   * @returns A promise that resolves with the result of the operation.
   * @template T The return type of the operation.
   */
  async runSingleWrite<T>(operation: () => Promise<T>): Promise<T> {
    return this.runWithRetries(async () => {
      return await this.enqueueWrite(async () => {
        return await operation();
      });
    });
  }

  /**
   * Retrieves statistics about the database, such as the number of records in each table.
   *
   * @returns A promise that resolves to an object containing the table counts.
   * @throws An error if the database is not initialized.
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
   * Retrieves a list of all custom indexes in the database.
   *
   * This is useful for debugging and verifying that the schema is set up correctly.
   *
   * @returns A promise that resolves to an array of index names.
   * @throws An error if the database is not initialized.
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
   * Deletes all data from all application tables.
   *
   * This is a destructive operation that should only be used for features like
   * user logout or a full application reset. It is executed within a transaction
   * to ensure that all data is cleared atomically.
   *
   * @throws An error if the database is not initialized or if the operation fails.
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
   * Gracefully closes the database connection and cleans up resources.
   *
   * This method ensures that all pending write operations are completed before
   * closing the connection, and it removes the AppState listener to prevent
   * memory leaks.
   *
   * @throws An error if the cleanup process fails.
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
