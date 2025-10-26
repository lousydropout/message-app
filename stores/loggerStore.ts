/**
 * @fileoverview Logger Store (Zustand) - A centralized logging system for the application.
 *
 * This store provides a robust, structured logging solution that replaces the
 * need for scattered `console.log` statements. It supports different log levels
 * (debug, info, warning, error) and categories, allowing for organized and
 * filterable logs.
 *
 * Logs are persisted in two ways:
 * 1. **In-memory**: A limited number of recent logs are kept in the Zustand state
 *    for immediate access and display in debugging UIs.
 * 2. **SQLite**: All logs are saved to a local SQLite database, providing a
 *    persistent and comprehensive log history that can be reviewed later.
 *
 * A global `logger` object is also exported, providing a convenient, non-hook-based
 * way to access the logging functions from anywhere in the application, including
 * services and other non-React modules.
 *
 * @see DiagnosticsScreen for the UI that displays logs from this store.
 * @see sqliteService for the underlying database operations.
 */

import sqliteService from "@/services/sqliteService";
import { Log, LogLevel } from "@/types/Log";
import { create } from "zustand";

/**
 * Logger store interface
 */
interface LoggerStore {
  /** Array of logs in memory */
  logs: Log[];
  /** Maximum number of logs to keep in memory */
  maxLogsInMemory: number;

  // Actions
  log: (
    level: LogLevel,
    category: string,
    message: string,
    metadata?: any
  ) => void;
  debug: (category: string, message: string, metadata?: any) => void;
  info: (category: string, message: string, metadata?: any) => void;
  warning: (category: string, message: string, metadata?: any) => void;
  error: (category: string, message: string, metadata?: any) => void;

  // Load logs from SQLite
  loadLogs: (limit?: number, minLevel?: LogLevel) => Promise<void>;
  clearLogs: () => Promise<void>;
}

export const useLoggerStore = create<LoggerStore>((set, get) => ({
  logs: [],
  maxLogsInMemory: 100,

  log: async (
    level: LogLevel,
    category: string,
    message: string,
    metadata?: any
  ) => {
    const logEntry: Log = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      category,
      message,
      metadata,
    };

    // Always log to console based on level (wrapped in try-catch)
    try {
      const consoleMessage = `[${level.toUpperCase()}] [${category}] ${message}`;
      switch (level) {
        case "debug":
          console.debug(consoleMessage, metadata || "");
          break;
        case "info":
          console.log(consoleMessage, metadata || "");
          break;
        case "warning":
          console.warn(consoleMessage, metadata || "");
          break;
        case "error":
          console.error(consoleMessage, metadata || "");
          break;
      }
    } catch (consoleError) {
      // Silently fail if console is unavailable
    }

    // Add to in-memory store (defer to avoid render cycle conflicts)
    setTimeout(() => {
      set((state) => {
        const newLogs = [logEntry, ...state.logs].slice(
          0,
          state.maxLogsInMemory
        );
        return { logs: newLogs };
      });
    }, 0);

    // Try to save to SQLite if it's initialized
    if (sqliteService.isInitialized()) {
      try {
        await sqliteService.saveLog(logEntry);
      } catch (error) {
        // Don't use logger here to avoid recursion
        try {
          console.debug("Failed to save log to SQLite:", error);
        } catch {}
      }
    }
  },

  debug: (category: string, message: string, metadata?: any) => {
    get().log("debug", category, message, metadata);
  },

  info: (category: string, message: string, metadata?: any) => {
    get().log("info", category, message, metadata);
  },

  warning: (category: string, message: string, metadata?: any) => {
    get().log("warning", category, message, metadata);
  },

  error: (category: string, message: string, metadata?: any) => {
    get().log("error", category, message, metadata);
  },

  /**
   * Loads logs from the SQLite database into the in-memory store.
   *
   * @param limit The maximum number of logs to load.
   * @param minLevel The minimum log level to include.
   * @returns A promise that resolves when the logs are loaded.
   */
  loadLogs: async (limit: number = 100, minLevel?: LogLevel) => {
    if (!sqliteService.isInitialized()) {
      console.log("SQLite not initialized, skipping log load");
      return;
    }

    try {
      const logs = await sqliteService.getLogs(limit, minLevel);
      set({ logs });
    } catch (error) {
      console.debug("Failed to load logs:", error);
    }
  },

  /**
   * Clears all logs from both the in-memory store and the SQLite database.
   *
   * @returns A promise that resolves when all logs are cleared.
   */
  clearLogs: async () => {
    if (!sqliteService.isInitialized()) {
      console.log("SQLite not initialized, skipping log clear");
      return;
    }

    try {
      await sqliteService.clearAllLogs();
      set({ logs: [] });
    } catch (error) {
      console.debug("Failed to clear logs:", error);
    }
  },
}));

/**
 * A convenience logger object that provides direct access to the logging methods
 * of the `useLoggerStore` without needing to be in a React component context.
 * This should be the primary way that logging is performed throughout the application.
 */
export const logger = {
  debug: (category: string, message: string, metadata?: any) => {
    useLoggerStore.getState().debug(category, message, metadata);
  },
  info: (category: string, message: string, metadata?: any) => {
    useLoggerStore.getState().info(category, message, metadata);
  },
  warning: (category: string, message: string, metadata?: any) => {
    useLoggerStore.getState().warning(category, message, metadata);
  },
  error: (category: string, message: string, metadata?: any) => {
    useLoggerStore.getState().error(category, message, metadata);
  },
};
