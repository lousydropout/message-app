import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import { SyncMetadata } from "@/services/sqlite/core/types";

/**
 * @fileoverview Sync Metadata Repository - Manages synchronization state in SQLite.
 *
 * This repository is responsible for persisting metadata related to the data
 * synchronization process between the local SQLite database and Firestore. It
 * provides a simple key-value store to track important information, such as
 * the last time a particular conversation was synced. This is crucial for
 * implementing an efficient incremental sync strategy, where the application
 * only fetches data that has changed since the last sync.
 *
 * @see messagesStore for how this repository is used to manage incremental sync.
 * @see SchemaManager for the `sync_metadata` table schema.
 */

/**
 * Sync Metadata Repository - handles sync metadata operations
 *
 * This repository provides methods for:
 * - Storing and retrieving sync metadata
 * - Managing last sync timestamps
 * - Sync state persistence
 */
export class SyncMetadataRepository {
  constructor(private db: SQLiteDatabase) {}

  /**
   * Retrieves a metadata value from the database for a given key.
   *
   * @param key The unique key for the metadata entry.
   * @returns A promise that resolves to the parsed metadata value, or `null` if the key is not found.
   * @throws An error if the database query fails.
   */
  async getSyncMetadata(key: string): Promise<any | null> {
    const db = this.db.getDb();

    try {
      const row = await db.getFirstAsync<SyncMetadata>(
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
   * Creates or updates a metadata entry in the database.
   *
   * The value is serialized to a JSON string before being stored.
   *
   * @param key The unique key for the metadata entry.
   * @param value The value to be stored. This can be any JSON-serializable type.
   * @returns A promise that resolves when the metadata is successfully saved.
   * @throws An error if the database operation fails.
   */
  async setSyncMetadata(key: string, value: any): Promise<void> {
    const db = this.db.getDb();

    try {
      await this.db.runSingleWrite(async () => {
        await db.runAsync(
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
   * A convenience method to get the last sync timestamp for a specific conversation.
   *
   * @param conversationId The ID of the conversation.
   * @returns A promise that resolves to the last sync timestamp (in epoch milliseconds), or 0 if never synced.
   */
  async getLastSyncedAt(conversationId: string): Promise<number> {
    const value = await this.getSyncMetadata(`lastSync_${conversationId}`);
    return value || 0; // Return 0 if never synced
  }

  /**
   * A convenience method to set the last sync timestamp for a specific conversation.
   *
   * @param conversationId The ID of the conversation.
   * @param timestamp The sync timestamp (in epoch milliseconds) to store.
   * @returns A promise that resolves when the timestamp is successfully saved.
   */
  async setLastSyncedAt(
    conversationId: string,
    timestamp: number
  ): Promise<void> {
    await this.setSyncMetadata(`lastSync_${conversationId}`, timestamp);
  }
}
