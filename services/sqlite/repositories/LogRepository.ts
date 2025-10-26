import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import { Log, LogLevel } from "@/types/Log";

/**
 * @fileoverview Log Repository - Manages diagnostic logs in the SQLite database.
 *
 * This repository provides an interface for all database operations related to
 * logging. It allows the application to persist logs locally, which is essential
 * for debugging user issues, monitoring application health, and analyzing
 * performance. The repository includes methods for saving new log entries,
 * retrieving them with various filters, and cleaning up old logs to manage
 * storage space.
 *
 * @see loggerStore for how logs are generated and queued for saving.
 * @see DiagnosticsScreen for how logs are displayed in the UI for debugging.
 */

/**
 * Log Repository - handles logging operations
 *
 * This repository provides methods for:
 * - Saving log entries to the database
 * - Retrieving logs with filtering
 * - Log cleanup and management
 */
export class LogRepository {
  constructor(private db: SQLiteDatabase) {}

  /**
   * Saves a single log entry to the `logs` table.
   *
   * @param log The `Log` object to be saved.
   * @returns A promise that resolves when the log is successfully inserted.
   * @throws An error if the database operation fails.
   */
  async saveLog(log: Log): Promise<void> {
    const db = this.db.getDb();

    try {
      await this.db.runSingleWrite(async () => {
        await db.runAsync(
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
   * Retrieves a list of log entries, with optional filtering by minimum log level.
   *
   * @param limit The maximum number of logs to retrieve.
   * @param minLevel The minimum `LogLevel` to include in the results.
   * @returns A promise that resolves to an array of `Log` objects.
   * @throws An error if the database query fails.
   */
  async getLogs(limit: number = 100, minLevel?: LogLevel): Promise<Log[]> {
    const db = this.db.getDb();

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

      const rows = await db.getAllAsync(query, params);
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
   * Retrieves a list of log entries for a specific category.
   *
   * @param category The category to filter logs by.
   * @param limit The maximum number of logs to retrieve.
   * @returns A promise that resolves to an array of `Log` objects.
   * @throws An error if the database query fails.
   */
  async getLogsByCategory(
    category: string,
    limit: number = 100
  ): Promise<Log[]> {
    const db = this.db.getDb();

    try {
      const rows = await db.getAllAsync(
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
   * Deletes log entries that are older than a specified number of days.
   *
   * This is a maintenance function to prevent the logs table from growing indefinitely.
   *
   * @param olderThanDays The number of days to keep logs for.
   * @returns A promise that resolves when the old logs are deleted.
   * @throws An error if the database operation fails.
   */
  async clearOldLogs(olderThanDays: number = 7): Promise<void> {
    const db = this.db.getDb();

    try {
      const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      await this.db.runSingleWrite(async () => {
        await db.runAsync(`DELETE FROM logs WHERE timestamp < ?`, [cutoffTime]);
      });
    } catch (error) {
      console.debug("sqlite", "Error clearing old logs:", error);
      throw error;
    }
  }

  /**
   * Deletes all log entries from the database.
   *
   * @returns A promise that resolves when all logs are cleared.
   * @throws An error if the database operation fails.
   */
  async clearAllLogs(): Promise<void> {
    const db = this.db.getDb();

    try {
      await this.db.runSingleWrite(async () => {
        await db.execAsync(`DELETE FROM logs`);
      });
    } catch (error) {
      console.debug("sqlite", "Error clearing all logs:", error);
      throw error;
    }
  }
}
