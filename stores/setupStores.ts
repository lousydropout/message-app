/**
 * @fileoverview Store Setup - Connects and coordinates all Zustand stores.
 *
 * This module is responsible for initializing the connections and dependencies
 * between the different stores in the application. It ensures that stores can
 * communicate with each other and react to changes in one another's state.
 * For example, it sets up the mechanism for the `messagesStore` to be notified
 * of network status changes from the `connectionStore`, and it registers a
 * cleanup function with the `authStore` to clear data from other stores upon
 * logout.
 *
 * This setup is crucial for maintaining a clean, decoupled architecture where
 * each store has a single responsibility, but they can work together to create
 * complex, coordinated behaviors.
 *
 * @see _layout.tsx where this setup function is called during app initialization.
 */

/**
 * @fileoverview Store Setup - Connects and coordinates all stores
 *
 * This module handles:
 * - Registering store callbacks and connections
 * - Setting up network event callbacks
 * - Configuring logout cleanup routines
 * - Managing inter-store dependencies
 *
 * Store connections:
 * - Messages store → Connection store (for network status)
 * - Connection store → Messages store (for queue processing callbacks)
 * - Auth store → Messages/Users stores (for logout cleanup)
 *
 * This is called once during app initialization in root layout.
 */

import { useAuthStore } from "@/stores/authStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { logger } from "@/stores/loggerStore";
import {
  setConnectionStatusGetter,
  setupMessagesStoreCallbacks,
  useMessagesStore,
} from "@/stores/messagesStore";
import { useUsersStore } from "@/stores/usersStore";

/**
 * Setup store connections and inter-store dependencies
 *
 * Establishes connections between stores:
 * 1. Messages store can check connection status
 * 2. Connection store triggers message queue processing on network restore
 * 3. Auth store clears data on logout
 *
 * Returns a cleanup function to disconnect all stores.
 *
 * @returns Function to cleanup all store connections
 */
export const setupStoreConnections = () => {
  logger.info("stores", "🔗 Setting up store connections...");

  // Set up connection status getter for messages store
  setConnectionStatusGetter(() => useConnectionStore.getState());

  // Register messages store callbacks with connection store
  const unsubscribeMessages = setupMessagesStoreCallbacks(
    useConnectionStore.getState().registerNetworkCallback
  );

  // Set up logout callback for auth store
  useAuthStore.getState().setLogoutCallback(() => {
    logger.info("stores", "Clearing messages store data on logout");
    const { clearAllData } = useMessagesStore.getState();
    clearAllData();

    logger.info("stores", "Clearing user subscriptions on logout");
    const { clearAllSubscriptions } = useUsersStore.getState();
    clearAllSubscriptions();
  });

  logger.info("stores", "✅ Store connections established");

  // Return cleanup function
  return () => {
    logger.info("stores", "🔗 Cleaning up store connections...");
    unsubscribeMessages();

    // Clear user subscriptions
    const { clearAllSubscriptions } = useUsersStore.getState();
    clearAllSubscriptions();

    logger.info("stores", "✅ Store connections cleaned up");
  };
};
