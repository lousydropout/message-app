import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import { QueuedMessage } from "@/services/sqlite/core/types";

/**
 * Message Queue Repository - handles offline message queuing operations
 *
 * This repository provides methods for:
 * - Queuing messages when offline
 * - Retrieving queued messages for processing
 * - Managing retry logic and error tracking
 * - Clearing queued messages after successful send
 */
export class MessageQueueRepository {
  constructor(private db: SQLiteDatabase) {}

  /**
   * Add a message to the queue (when offline)
   */
  async queueMessage(
    messageId: string,
    conversationId: string,
    senderId: string,
    text: string
  ): Promise<void> {
    const db = this.db.getDb();

    try {
      const now = Date.now();
      await this.db.runSingleWrite(async () => {
        await db.runAsync(
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
    const db = this.db.getDb();

    try {
      const rows = await db.getAllAsync<QueuedMessage>(
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
    const db = this.db.getDb();

    try {
      await this.db.runSingleWrite(async () => {
        await db.runAsync(`DELETE FROM queued_messages WHERE messageId = ?`, [
          messageId,
        ]);
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
    const db = this.db.getDb();

    try {
      await this.db.runSingleWrite(async () => {
        await db.runAsync(
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
    const db = this.db.getDb();

    try {
      await this.db.runSingleWrite(async () => {
        await db.execAsync(`DELETE FROM queued_messages`);
      });
    } catch (error) {
      console.error("sqlite", "Error clearing queued messages:", error);
      throw error;
    }
  }
}
