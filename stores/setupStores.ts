import { useAuthStore } from "@/stores/authStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { logger } from "@/stores/loggerStore";
import {
  setConnectionStatusGetter,
  setupMessagesStoreCallbacks,
  useMessagesStore,
} from "@/stores/messagesStore";
import { useUsersStore } from "@/stores/usersStore";

// Setup function to initialize store connections
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
