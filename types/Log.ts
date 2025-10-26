/**
 * @fileoverview Type definitions for the structured logging system.
 *
 * This file defines the TypeScript interface for a `Log` object, which is used
 * to create structured, consistent log entries throughout the application.
 * Sticking to a defined schema for logs is essential for effective debugging,
 * monitoring, and analysis.
 *
 * Each log entry includes a `level` for severity, a `category` for grouping
 * related logs (e.g., 'auth', 'network'), a descriptive `message`, and an
 * optional `metadata` object for including rich contextual information.
 *
 * @see loggerStore for the implementation of the logging system.
 * @see LogRepository for how logs are persisted in the local SQLite database.
 */
export type LogLevel = "debug" | "info" | "warning" | "error";

export interface Log {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: string; // e.g., 'auth', 'messages', 'network', 'sqlite'
  message: string;
  metadata?: Record<string, any>; // Optional additional data
}
