import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import { Log, LogLevel } from "@/types/Log";

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
   * Save a log entry to the database
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
   * Get logs with optional filtering
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
   * Get logs by category
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
   * Clear old logs (older than specified days)
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
   * Clear all logs
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
