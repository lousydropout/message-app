/**
 * @fileoverview Connection Store (Zustand) - Manages network and synchronization state.
 *
 * This store is the central authority for all connectivity-related state in the
 * application. It monitors the device's network status using `@react-native-community/netinfo`
 * and also tracks the connection state to Firestore. A key feature of this store
 * is its ability to automatically trigger a data synchronization process when the
 * device comes back online, ensuring that the local data is kept up-to-date.
 *
 * The store also provides a callback system (`registerNetworkCallback`) that allows
 * other modules, particularly other stores, to register functions that will be
 * executed when the network connection is restored. This is crucial for orchestrating
 * the multi-step process of re-syncing data.
 *
 * @see messagesStore for an example of a store that uses the network callback system.
 * @see NetworkStatusBar for a UI component that displays the state from this store.
 */

/**
 * @fileoverview Connection Store - Manages network connectivity and sync state
 *
 * This store handles:
 * - Network connectivity monitoring via NetInfo
 * - Online/offline status tracking
 * - Sync status and progress
 * - Message queue management
 * - Firestore connection state
 * - Network event callbacks
 * - Automatic sync when connection restored
 *
 * Key features:
 * - Real-time network state monitoring
 * - Automatic queue processing on reconnection
 * - Sync statistics tracking
 * - Callback system for components/stores to react to network changes
 */

import sqliteService from "@/services/sqliteService";
import { logger } from "@/stores/loggerStore";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { create } from "zustand";

/**
 * Connection status type
 */
export type ConnectionStatus = "online" | "offline" | "unknown";

/**
 * Sync status type
 */
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

  // Firestore connection state
  firestoreConnected: boolean;

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
  updateFirestoreConnectionState: (connected: boolean) => void;
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
  firestoreConnected: true, // Assume connected initially

  /**
   * Initializes the connection store by setting up listeners for network state changes and automatically triggering a
   * sync process when the application comes back online.
   *
   * @returns An `unsubscribe` function to clean up the listeners.
   */
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

  /**
   * Manually sets the online status of the application.
   *
   * @param isOnline A boolean indicating whether the application is online.
   */
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

  /**
   * Sets the current synchronization status of the application.
   *
   * @param syncStatus The new `SyncStatus`.
   */
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

  /**
   * Sets the syncing state of the application.
   *
   * @param isSyncing A boolean indicating whether a sync is in progress.
   */
  setSyncing: (isSyncing: boolean) => {
    logger.info("sync", `Syncing: ${isSyncing}`);

    set({
      isSyncing,
      syncStatus: isSyncing ? "syncing" : "idle",
    });
  },

  /**
   * Updates the synchronization statistics.
   *
   * @param stats A partial `SyncStats` object with the new statistics.
   */
  updateSyncStats: (stats: Partial<SyncStats>) => {
    const currentStats = get().syncStats;
    const updatedStats = { ...currentStats, ...stats };

    logger.debug("sync", "Sync stats updated", updatedStats);

    set({ syncStats: updatedStats });
  },

  /**
   * Increments the retry count in the sync statistics.
   */
  incrementRetryCount: () => {
    const { syncStats } = get();
    const updatedStats = {
      ...syncStats,
      retryCount: syncStats.retryCount + 1,
    };

    logger.debug("sync", `Retry count: ${updatedStats.retryCount}`);

    set({ syncStats: updatedStats });
  },

  /**
   * Records an error in the store's state.
   *
   * @param error A string describing the error.
   */
  setError: (error: string) => {
    logger.error("connection", `Connection error: ${error}`);

    set({
      lastError: error,
      errorCount: get().errorCount + 1,
      syncStatus: "error",
      isSyncing: false,
    });
  },

  /**
   * Clears the last recorded error from the state.
   */
  clearError: () => {
    logger.info("connection", "Error cleared");

    set({
      lastError: null,
      syncStatus: "idle",
    });
  },

  /**
   * Updates the counts of queued and failed messages.
   *
   * @param queuedMessagesCount The number of messages currently in the queue.
   * @param failedMessagesCount The number of messages that have failed to send.
   */
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

  /**
   * Refreshes the queued and failed message counts from the SQLite database.
   *
   * @returns A promise that resolves when the counts are refreshed.
   */
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
      logger.debug("connection", "Failed to refresh queue counts", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  /**
   * Resets all synchronization statistics to their initial values.
   */
  resetSyncStats: () => {
    logger.info("sync", "Sync stats reset");

    set({
      syncStats: initialSyncStats,
      lastError: null,
      errorCount: 0,
    });
  },

  /**
   * Updates the store's state with the current connection status of Firestore.
   *
   * If the connection is restored and there are messages in the queue, this
   * method will also trigger the network callbacks to start the sync process.
   *
   * @param connected A boolean indicating whether Firestore is connected.
   */
  updateFirestoreConnectionState: (connected: boolean) => {
    const previousState = get().firestoreConnected;
    set({ firestoreConnected: connected });

    logger.info(
      "connection",
      `Firestore connection state changed: ${connected}`,
      {
        previousState,
        newState: connected,
        timestamp: Date.now(),
      }
    );

    // If Firestore just came back online and we have queued messages, trigger sync
    if (connected && !previousState) {
      const { queuedMessagesCount } = get();
      if (queuedMessagesCount > 0) {
        logger.info(
          "connection",
          "Firestore reconnected, scheduling queue processing",
          {
            queuedMessages: queuedMessagesCount,
          }
        );
        setTimeout(() => {
          get().triggerNetworkCallbacks();
        }, 1000); // Small delay to ensure connection is stable
      }
    }
  },

  /**
   * Registers a callback function to be executed when the network connection is restored.
   *
   * This is a key mechanism for orchestrating data synchronization. Other stores
   * can register their sync logic here to have it automatically run upon reconnection.
   *
   * @param callback The function to be executed.
   * @returns An `unsubscribe` function to remove the callback.
   */
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

  /**
   * Executes all registered network event callbacks.
   *
   * This is typically called automatically when the network is restored, but it
   * can also be triggered manually.
   *
   * @returns A promise that resolves when all callbacks have completed.
   */
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
