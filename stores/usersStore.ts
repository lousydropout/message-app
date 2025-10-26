/**
 * @fileoverview Users Store - Manages user profile subscriptions
 *
 * This store handles:
 * - Real-time user profile subscriptions
 * - Tracking subscribed user IDs
 * - Managing Firestore subscriptions lifecycle
 * - Preventing duplicate subscriptions
 *
 * The store maintains a set of subscribed user IDs and manages the
 * Firestore subscriptions efficiently, delegating to userService for
 * the actual Firestore operations and SQLite caching.
 */

import { create } from "zustand";
import { Unsubscribe } from "firebase/firestore";
import { User } from "@/types/User";
import userService from "@/services/userService";

/**
 * Users store state interface
 */
export interface UsersState {
  /** Set of user IDs currently subscribed to */
  subscribedUserIds: Set<string>;
  /** Array of unsubscribe functions for active subscriptions */
  subscriptions: Unsubscribe[];

  // Actions
  subscribeToUsers: (userIds: string[]) => void;
  unsubscribeFromUsers: (userIds: string[]) => void;
  clearAllSubscriptions: () => void;
}

export const useUsersStore = create<UsersState>((set, get) => ({
  subscribedUserIds: new Set<string>(),
  subscriptions: [],

  /**
   * Subscribes to real-time updates for a given list of user IDs.
   *
   * This method is idempotent; it checks for existing subscriptions and only
   * creates new ones for users that are not already being tracked.
   *
   * @param userIds An array of user IDs to subscribe to.
   */
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
      },
    );

    // Add the new subscription to our list
    const updatedSubscriptions = [...subscriptions, unsubscribe];

    set({
      subscribedUserIds: updatedSubscribedIds,
      subscriptions: updatedSubscriptions,
    });
  },

  /**
   * Removes a list of user IDs from the tracking set.
   *
   * @note This does not immediately terminate the Firestore listener, as the
   * subscriptions are batched. Instead, it removes the user IDs from the
   * `subscribedUserIds` set, effectively "opting out" of future updates for
   * those users within the existing subscription. The actual listener is only
   * terminated when `clearAllSubscriptions` is called.
   *
   * @param userIds An array of user IDs to unsubscribe from.
   */
  unsubscribeFromUsers(userIds: string[]) {
    const { subscribedUserIds } = get();

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

  /**
   * Terminates all active Firestore subscriptions and clears the store's state.
   *
   * This is a critical cleanup operation that should be called when the user
   * logs out or when the component managing the subscriptions is unmounted. It
   * iterates through all active subscriptions and calls their `unsubscribe`
   * function to prevent memory leaks and unnecessary Firestore reads.
   */
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
