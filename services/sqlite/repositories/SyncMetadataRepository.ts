import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import { SyncMetadata } from "@/services/sqlite/core/types";

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
   * Get sync metadata by key
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
   * Set sync metadata
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
}
