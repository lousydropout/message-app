import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import { QueuedMessage } from "@/services/sqlite/core/types";

/**
 * @fileoverview Message Queue Repository - Manages the offline message queue in SQLite.
 *
 * This repository is central to the application's offline-first architecture.
 * It provides the functionality to store messages that are created while the
 * user is offline. These messages are held in a dedicated `queued_messages`
 * table until a network connection is re-established, at which point they are
 * processed and sent to Firestore. The repository also includes logic for
 * tracking send attempts and handling retries.
 *
 * @see messagesStore for the logic that processes the message queue.
 * @see connectionStore for how network status changes trigger queue processing.
 */

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
   * Adds a new message to the offline queue.
   *
   * This method is called when a user attempts to send a message while the
   * application is offline. The message data is stored locally for later processing.
   *
   * @param messageId The client-generated UUID of the message.
   * @param conversationId The ID of the conversation the message belongs to.
   * @param senderId The ID of the user sending the message.
   * @param text The text content of the message.
   * @returns A promise that resolves when the message is successfully queued.
   * @throws An error if the database operation fails.
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
   * Retrieves all messages currently in the queue, ordered by when they were created.
   *
   * @returns A promise that resolves to an array of `QueuedMessage` objects.
   * @throws An error if the database query fails.
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
   * Removes a message from the queue after it has been successfully sent to Firestore.
   *
   * @param messageId The ID of the message to remove.
   * @returns A promise that resolves when the message is successfully removed.
   * @throws An error if the database operation fails.
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
   * Increments the retry count and records the last error for a queued message.
   *
   * This is called when an attempt to send a queued message fails. It helps in
   * tracking transient failures and can be used to implement backoff strategies.
   *
   * @param messageId The ID of the message that failed to send.
   * @param error A string describing the reason for the failure.
   * @returns A promise that resolves when the retry information is updated.
   * @throws An error if the database operation fails.
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
   * Deletes all messages from the queue.
   *
   * This is primarily used for testing and debugging purposes, or for a full
   * application reset.
   *
   * @returns A promise that resolves when the queue is cleared.
   * @throws An error if the database operation fails.
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
