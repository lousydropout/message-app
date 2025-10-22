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
  resetSyncStats: () => void;
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

  // Initialize network monitoring
  initialize: () => {
    console.log("🔌 Initializing connection store...");

    // Set up network state listener
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isOnline = state.isConnected ?? false;
      const connectionStatus: ConnectionStatus = isOnline
        ? "online"
        : "offline";
      const networkType = state.type || null;

      console.log(
        `🌐 Network status changed: ${connectionStatus} (${networkType})`
      );

      set({
        isOnline,
        connectionStatus,
        networkType,
      });

      // Handle network state changes
      const { isSyncing } = get();

      if (!isOnline && isSyncing) {
        // Network went offline while syncing
        console.log("❌ Network lost during sync");
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
        console.log("🔄 Network restored - triggering sync via subscription");

        // Set local mutex immediately to prevent race conditions
        syncInProgress = true;

        // Update sync status to indicate we're about to sync
        set({ syncStatus: "syncing", isSyncing: true });

        // Small delay to ensure connection is stable
        setTimeout(async () => {
          try {
            const module = await import("@/stores/messagesStore");
            const messagesStore = module.useMessagesStore.getState();

            // First: Send queued messages
            await messagesStore.processQueue();

            // Second: Fetch missed messages from Firestore
            await messagesStore.syncMissedMessages();

            set({ isSyncing: false, syncStatus: "synced" });
          } catch (error) {
            console.error("Failed to trigger sync:", error);
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

      console.log(
        `🌐 Initial network state: ${connectionStatus} (${networkType})`
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
    console.log(`🌐 Manual network status: ${connectionStatus}`);

    set({
      isOnline,
      connectionStatus,
    });
  },

  // Set sync status
  setSyncStatus: (syncStatus: SyncStatus) => {
    console.log(`🔄 Sync status: ${syncStatus}`);

    set({ syncStatus });

    // Update lastSyncAt when sync completes
    if (syncStatus === "synced") {
      set({ lastSyncAt: Date.now() });
    }
  },

  // Set syncing state
  setSyncing: (isSyncing: boolean) => {
    console.log(`🔄 Syncing: ${isSyncing}`);

    set({
      isSyncing,
      syncStatus: isSyncing ? "syncing" : "idle",
    });
  },

  // Update sync statistics
  updateSyncStats: (stats: Partial<SyncStats>) => {
    const currentStats = get().syncStats;
    const updatedStats = { ...currentStats, ...stats };

    console.log("📊 Sync stats updated:", updatedStats);

    set({ syncStats: updatedStats });
  },

  // Increment retry count
  incrementRetryCount: () => {
    const { syncStats } = get();
    const updatedStats = {
      ...syncStats,
      retryCount: syncStats.retryCount + 1,
    };

    console.log(`🔄 Retry count: ${updatedStats.retryCount}`);

    set({ syncStats: updatedStats });
  },

  // Set error
  setError: (error: string) => {
    console.error(`❌ Connection error: ${error}`);

    set({
      lastError: error,
      errorCount: get().errorCount + 1,
      syncStatus: "error",
      isSyncing: false,
    });
  },

  // Clear error
  clearError: () => {
    console.log("✅ Error cleared");

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
    console.log(
      `📦 Queue counts - Queued: ${queuedMessagesCount}, Failed: ${failedMessagesCount}`
    );

    set({
      queuedMessagesCount,
      failedMessagesCount,
    });
  },

  // Reset sync statistics
  resetSyncStats: () => {
    console.log("🔄 Sync stats reset");

    set({
      syncStats: initialSyncStats,
      lastError: null,
      errorCount: 0,
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
