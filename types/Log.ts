export type LogLevel = "debug" | "info" | "warning" | "error";

export interface Log {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: string; // e.g., 'auth', 'messages', 'network', 'sqlite'
  message: string;
  metadata?: Record<string, any>; // Optional additional data
}
