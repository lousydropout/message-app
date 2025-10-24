import sqliteService from "@/services/sqliteService";
import { logger } from "@/stores/loggerStore";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { create } from "zustand";

// Connection status types
export type ConnectionStatus = "online" | "offline" | "unknown";
export type SyncStatus = "idle" | "syncing" | "synced" | "error";

// Sync statistics
export interface SyncStats {
  lastSyncAt: number | null;
  messagesSynced: number;
  messagesQueued: number;
  messagesFailed: number;
  syncDuration: number; // milliseconds
  retryCount: number;
}

// Callback types for network events
export type NetworkEventCallback = () => Promise<void> | void;

// Connection state interface
export interface ConnectionState {
  // Network status
  isOnline: boolean;
  connectionStatus: ConnectionStatus;
  networkType: string | null;

  // Sync status
  syncStatus: SyncStatus;
  isSyncing: boolean;
  lastSyncAt: number | null;

  // Queue management
  queuedMessagesCount: number;
  failedMessagesCount: number;

  // Sync statistics
  syncStats: SyncStats;

  // Error handling
  lastError: string | null;
  errorCount: number;

  // Callback management
  networkEventCallbacks: Set<NetworkEventCallback>;

  // Actions
  initialize: () => () => void; // Returns unsubscribe function
  setOnline: (isOnline: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setSyncing: (isSyncing: boolean) => void;
  updateSyncStats: (stats: Partial<SyncStats>) => void;
  incrementRetryCount: () => void;
  setError: (error: string) => void;
  clearError: () => void;
  updateQueueCounts: (queued: number, failed: number) => void;
  refreshQueueCounts: () => Promise<void>;
  resetSyncStats: () => void;
  registerNetworkCallback: (callback: NetworkEventCallback) => () => void;
  triggerNetworkCallbacks: () => Promise<void>;
}

// Initial sync statistics
const initialSyncStats: SyncStats = {
  lastSyncAt: null,
  messagesSynced: 0,
  messagesQueued: 0,
  messagesFailed: 0,
  syncDuration: 0,
  retryCount: 0,
};

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  // Initial state
  isOnline: true, // Assume online initially
  connectionStatus: "unknown",
  networkType: null,
  syncStatus: "idle",
  isSyncing: false,
  lastSyncAt: null,
  queuedMessagesCount: 0,
  failedMessagesCount: 0,
  syncStats: initialSyncStats,
  lastError: null,
  errorCount: 0,
  networkEventCallbacks: new Set(),

  // Initialize network monitoring
  initialize: () => {
    logger.info("connection", "Initializing connection store");

    // Set up network state listener
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isOnline = state.isConnected ?? false;
      const connectionStatus: ConnectionStatus = isOnline
        ? "online"
        : "offline";
      const networkType = state.type || null;

      logger.info(
        "network",
        `Network status changed: ${connectionStatus} (${networkType})`
      );

      logger.info("network", "Network state changed", {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        details: state.details,
        timestamp: Date.now(),
      });

      set({
        isOnline,
        connectionStatus,
        networkType,
      });

      // Handle network state changes
      const { isSyncing } = get();

      if (!isOnline && isSyncing) {
        // Network went offline while syncing
        logger.warning("network", "Network lost during sync");
        set({
          syncStatus: "error",
          isSyncing: false,
          lastError: "Network connection lost during sync",
        });
      }
    });

    // Subscribe to isOnline changes for automatic sync
    let previousIsOnline = get().isOnline;
    let syncInProgress = false; // Local mutex to prevent race conditions

    const unsubscribeSync = useConnectionStore.subscribe((state) => {
      const isOnline = state.isOnline;
      const isSyncing = state.isSyncing;

      // Only trigger sync when going from offline to online AND not already syncing
      if (
        isOnline &&
        previousIsOnline === false &&
        !isSyncing &&
        !syncInProgress
      ) {
        logger.info(
          "network",
          "Network restored - triggering sync via subscription"
        );

        // Set local mutex immediately to prevent race conditions
        syncInProgress = true;

        // Update sync status to indicate we're about to sync
        set({ syncStatus: "syncing", isSyncing: true });

        // Small delay to ensure connection is stable
        setTimeout(async () => {
          try {
            logger.info("sync", "Starting automatic sync after reconnection");

            // Trigger all registered network callbacks
            await get().triggerNetworkCallbacks();

            logger.info("sync", "Automatic sync completed successfully");
            set({ isSyncing: false, syncStatus: "synced" });
          } catch (error) {
            logger.error("sync", "Failed to trigger sync", {
              error: error instanceof Error ? error.message : "Unknown error",
            });
            // Reset sync status on error
            set({
              syncStatus: "error",
              isSyncing: false,
              lastError: error instanceof Error ? error.message : String(error),
            });
          } finally {
            // Always clear the mutex
            syncInProgress = false;
          }
        }, 1000); // Increased delay to 1 second for stability
      }
      previousIsOnline = isOnline;
    });

    // Get initial network state
    NetInfo.fetch().then((state: NetInfoState) => {
      const isOnline = state.isConnected ?? false;
      const connectionStatus: ConnectionStatus = isOnline
        ? "online"
        : "offline";
      const networkType = state.type || null;

      logger.info(
        "network",
        `Initial network state: ${connectionStatus} (${networkType})`
      );

      set({
        isOnline,
        connectionStatus,
        networkType,
        // Set initial sync status based on connection
        syncStatus: isOnline ? "synced" : "idle",
      });
    });

    // Return cleanup function
    return () => {
      unsubscribe();
      unsubscribeSync();
    };
  },

  // Set online status manually
  setOnline: (isOnline: boolean) => {
    const connectionStatus: ConnectionStatus = isOnline ? "online" : "offline";
    const previousStatus = get().connectionStatus;
    logger.info("network", `Manual network status: ${connectionStatus}`);

    logger.info(
      "network",
      `Manual network status change to ${connectionStatus}`,
      {
        isOnline,
        connectionStatus,
        previousStatus,
        timestamp: Date.now(),
      }
    );

    set({
      isOnline,
      connectionStatus,
    });

    // Trigger network callbacks when status changes
    get().triggerNetworkCallbacks();
  },

  // Set sync status
  setSyncStatus: (syncStatus: SyncStatus) => {
    logger.info("sync", `Sync status: ${syncStatus}`);

    logger.info("sync", `Sync status changed to ${syncStatus}`, {
      syncStatus,
      timestamp: Date.now(),
    });

    set({ syncStatus });

    // Update lastSyncAt when sync completes
    if (syncStatus === "synced") {
      set({ lastSyncAt: Date.now() });
    }
  },

  // Set syncing state
  setSyncing: (isSyncing: boolean) => {
    logger.info("sync", `Syncing: ${isSyncing}`);

    set({
      isSyncing,
      syncStatus: isSyncing ? "syncing" : "idle",
    });
  },

  // Update sync statistics
  updateSyncStats: (stats: Partial<SyncStats>) => {
    const currentStats = get().syncStats;
    const updatedStats = { ...currentStats, ...stats };

    logger.debug("sync", "Sync stats updated", updatedStats);

    set({ syncStats: updatedStats });
  },

  // Increment retry count
  incrementRetryCount: () => {
    const { syncStats } = get();
    const updatedStats = {
      ...syncStats,
      retryCount: syncStats.retryCount + 1,
    };

    logger.debug("sync", `Retry count: ${updatedStats.retryCount}`);

    set({ syncStats: updatedStats });
  },

  // Set error
  setError: (error: string) => {
    logger.error("connection", `Connection error: ${error}`);

    set({
      lastError: error,
      errorCount: get().errorCount + 1,
      syncStatus: "error",
      isSyncing: false,
    });
  },

  // Clear error
  clearError: () => {
    logger.info("connection", "Error cleared");

    set({
      lastError: null,
      syncStatus: "idle",
    });
  },

  // Update queue counts
  updateQueueCounts: (
    queuedMessagesCount: number,
    failedMessagesCount: number
  ) => {
    logger.debug(
      "queue",
      `Queue counts - Queued: ${queuedMessagesCount}, Failed: ${failedMessagesCount}`
    );

    logger.debug("connection", "Updating queue counts", {
      queued: queuedMessagesCount,
      failed: failedMessagesCount,
      previousQueued: get().queuedMessagesCount,
      previousFailed: get().failedMessagesCount,
    });

    set({
      queuedMessagesCount,
      failedMessagesCount,
    });
  },

  // Refresh queue counts from SQLite
  refreshQueueCounts: async () => {
    try {
      const queuedMessages = await sqliteService.getQueuedMessages();
      const failedCount = queuedMessages.filter(
        (m) => m.retryCount >= 3
      ).length;

      get().updateQueueCounts(queuedMessages.length, failedCount);

      logger.info("connection", "Queue counts refreshed", {
        queued: queuedMessages.length,
        failed: failedCount,
      });
    } catch (error) {
      logger.error("connection", "Failed to refresh queue counts", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  // Reset sync statistics
  resetSyncStats: () => {
    logger.info("sync", "Sync stats reset");

    set({
      syncStats: initialSyncStats,
      lastError: null,
      errorCount: 0,
    });
  },

  // Register a callback for network events (returns unsubscribe function)
  registerNetworkCallback: (callback: NetworkEventCallback) => {
    const { networkEventCallbacks } = get();
    networkEventCallbacks.add(callback);

    logger.debug(
      "network",
      `Registered network callback. Total callbacks: ${networkEventCallbacks.size}`
    );

    logger.info("network", "Network callback registered", {
      totalCallbacks: networkEventCallbacks.size,
      timestamp: Date.now(),
    });

    // Return unsubscribe function
    return () => {
      const { networkEventCallbacks: currentCallbacks } = get();
      currentCallbacks.delete(callback);
      logger.debug(
        "network",
        `Unregistered network callback. Total callbacks: ${currentCallbacks.size}`
      );

      logger.info("network", "Network callback unregistered", {
        totalCallbacks: currentCallbacks.size,
        timestamp: Date.now(),
      });
    };
  },

  // Trigger all registered network callbacks
  triggerNetworkCallbacks: async () => {
    const { networkEventCallbacks, isOnline, connectionStatus } = get();

    logger.debug("network", "Triggering network callbacks", {
      callbackCount: networkEventCallbacks.size,
      isOnline,
      connectionStatus,
      timestamp: Date.now(),
    });

    if (networkEventCallbacks.size === 0) {
      logger.debug("network", "No network callbacks registered");
      logger.debug("network", "No network callbacks registered");
      return;
    }

    logger.debug(
      "network",
      `Triggering ${networkEventCallbacks.size} network callbacks`
    );

    const promises = Array.from(networkEventCallbacks).map(
      async (callback, index) => {
        try {
          logger.debug("network", `Executing network callback ${index + 1}`, {
            callbackIndex: index,
            timestamp: Date.now(),
          });
          await callback();
          logger.debug(
            "network",
            `Network callback ${index + 1} completed successfully`,
            {
              callbackIndex: index,
              timestamp: Date.now(),
            }
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          logger.error("network", `Network callback ${index + 1} failed`, {
            callbackIndex: index,
            error: errorMessage,
          });
          logger.error("network", `Network callback ${index + 1} failed`, {
            callbackIndex: index,
            error: errorMessage,
            timestamp: Date.now(),
          });
        }
      }
    );

    await Promise.all(promises);

    logger.info("network", "All network callbacks completed", {
      callbackCount: networkEventCallbacks.size,
      timestamp: Date.now(),
    });
    logger.info("network", "All network callbacks completed");
  },
}));

// Helper functions for common operations
export const connectionHelpers = {
  // Check if we should attempt sync
  shouldSync: (): boolean => {
    const { isOnline, syncStatus, isSyncing } = useConnectionStore.getState();
    return isOnline && syncStatus !== "syncing" && !isSyncing;
  },

  // Check if we're in a good state for operations
  isHealthy: (): boolean => {
    const { isOnline, syncStatus, errorCount } = useConnectionStore.getState();
    return isOnline && syncStatus !== "error" && errorCount < 5;
  },

  // Get connection summary for debugging
  getConnectionSummary: (): string => {
    const state = useConnectionStore.getState();
    return `Online: ${state.isOnline}, Sync: ${state.syncStatus}, Queue: ${state.queuedMessagesCount}, Errors: ${state.errorCount}`;
  },

  // Check if we should queue messages (offline or unhealthy)
  shouldQueueMessages: (): boolean => {
    const { isOnline, syncStatus } = useConnectionStore.getState();
    return !isOnline || syncStatus === "error";
  },

  // Get retry delay with exponential backoff
  getRetryDelay: (retryCount: number): number => {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    return delay;
  },

  // Format sync duration for display
  formatSyncDuration: (duration: number): string => {
    if (duration < 1000) {
      return `${duration}ms`;
    } else if (duration < 60000) {
      return `${(duration / 1000).toFixed(1)}s`;
    } else {
      return `${(duration / 60000).toFixed(1)}m`;
    }
  },

  // Get network status emoji for UI
  getNetworkEmoji: (): string => {
    const { connectionStatus, networkType } = useConnectionStore.getState();

    if (connectionStatus === "online") {
      switch (networkType) {
        case "wifi":
          return "📶";
        case "cellular":
          return "📱";
        case "ethernet":
          return "🔌";
        default:
          return "🌐";
      }
    } else if (connectionStatus === "offline") {
      return "❌";
    } else {
      return "❓";
    }
  },

  // Get sync status emoji for UI
  getSyncEmoji: (): string => {
    const { syncStatus, isSyncing } = useConnectionStore.getState();

    if (isSyncing) return "🔄";

    switch (syncStatus) {
      case "synced":
        return "✅";
      case "error":
        return "❌";
      case "idle":
        return "⏸️";
      default:
        return "❓";
    }
  },
};

export default useConnectionStore;
