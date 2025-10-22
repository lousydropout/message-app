import { useConnectionStore } from "./connectionStore";
import { logger } from "./loggerStore";
import {
  setConnectionStatusGetter,
  setupMessagesStoreCallbacks,
} from "./messagesStore";

// Setup function to initialize store connections
export const setupStoreConnections = () => {
  logger.info("stores", "🔗 Setting up store connections...");

  // Set up connection status getter for messages store
  setConnectionStatusGetter(() => useConnectionStore.getState());

  // Register messages store callbacks with connection store
  const unsubscribeMessages = setupMessagesStoreCallbacks(
    useConnectionStore.getState().registerNetworkCallback
  );

  logger.info("stores", "✅ Store connections established");

  // Return cleanup function
  return () => {
    logger.info("stores", "🔗 Cleaning up store connections...");
    unsubscribeMessages();
    logger.info("stores", "✅ Store connections cleaned up");
  };
};
