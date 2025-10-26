import userService from "@/services/userService";
import { User } from "@/types/User";
import { Unsubscribe } from "firebase/firestore";
import { create } from "zustand";

export interface UsersState {
  subscribedUserIds: Set<string>;
  subscriptions: Unsubscribe[];

  // Actions
  subscribeToUsers: (userIds: string[]) => void;
  unsubscribeFromUsers: (userIds: string[]) => void;
  clearAllSubscriptions: () => void;
}

export const useUsersStore = create<UsersState>((set, get) => ({
  subscribedUserIds: new Set<string>(),
  subscriptions: [],

  subscribeToUsers(userIds: string[]) {
    const { subscribedUserIds, subscriptions } = get();

    // Filter out users we're already subscribed to
    const newUserIds = userIds.filter((id) => !subscribedUserIds.has(id));

    if (newUserIds.length === 0) {
      return; // No new users to subscribe to
    }

    // Add new user IDs to our tracking set
    const updatedSubscribedIds = new Set([...subscribedUserIds, ...newUserIds]);

    // Create subscription for the new users
    const unsubscribe = userService.subscribeToUsers(
      newUserIds,
      (users: User[]) => {
        // The userService.subscribeToUsers already handles SQLite cache updates
        // We could add additional logic here if needed (e.g., updating UI state)
        console.log(`Updated ${users.length} user profiles in real-time`);
      }
    );

    // Add the new subscription to our list
    const updatedSubscriptions = [...subscriptions, unsubscribe];

    set({
      subscribedUserIds: updatedSubscribedIds,
      subscriptions: updatedSubscriptions,
    });
  },

  unsubscribeFromUsers(userIds: string[]) {
    const { subscribedUserIds, subscriptions } = get();

    // Remove user IDs from our tracking set
    const updatedSubscribedIds = new Set(subscribedUserIds);
    userIds.forEach((id) => updatedSubscribedIds.delete(id));

    // Note: We don't actually unsubscribe from individual users in Firestore
    // because the subscription is batched. We just remove them from tracking.
    // The subscription will continue to run but won't call callbacks for
    // users not in our tracking set.

    set({
      subscribedUserIds: updatedSubscribedIds,
    });
  },

  clearAllSubscriptions() {
    const { subscriptions } = get();

    // Unsubscribe from all Firestore listeners
    subscriptions.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        console.error("Error unsubscribing from user subscription:", error);
      }
    });

    // Clear all state
    set({
      subscribedUserIds: new Set<string>(),
      subscriptions: [],
    });
  },
}));
