import { useConnectionStore } from "./connectionStore";
import {
  setConnectionStatusGetter,
  setupMessagesStoreCallbacks,
} from "./messagesStore";

// Setup function to initialize store connections
export const setupStoreConnections = () => {
  console.log("🔗 Setting up store connections...");

  // Set up connection status getter for messages store
  setConnectionStatusGetter(() => useConnectionStore.getState());

  // Register messages store callbacks with connection store
  const unsubscribeMessages = setupMessagesStoreCallbacks(
    useConnectionStore.getState().registerNetworkCallback
  );

  console.log("✅ Store connections established");

  // Return cleanup function
  return () => {
    console.log("🔗 Cleaning up store connections...");
    unsubscribeMessages();
    console.log("✅ Store connections cleaned up");
  };
};
