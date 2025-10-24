import sqliteService from "@/services/sqliteService";
import { Log, LogLevel } from "@/types/Log";
import { create } from "zustand";

interface LoggerStore {
  logs: Log[];
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

// Helper function to get logger instance
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
