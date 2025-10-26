/**
 * @fileoverview Contacts Store (Zustand) - Manages the user's social graph.
 *
 * This store is the central hub for all contact-related information and actions,
 * including the user's friends list, incoming and outgoing friend requests, and
 * blocked users. It leverages real-time subscriptions to Firestore to ensure that
 * the user's social graph is always up-to-date.
 *
 * The store's logic is built around the concept of a `friends` subcollection
 * in Firestore, which provides a scalable way to manage friendships. It also
 * includes a sophisticated system of real-time listeners for friend requests,
 * which not only keeps the data fresh but also provides timely notifications to
 * the user for events like new requests or accepted invitations.
 *
 * @see friendService for the underlying Firestore operations for friends and requests.
 * @see userService for user search and blocking functionality.
 * @see ContactsScreen for the primary UI that uses this store.
 */

/**
 * @fileoverview Contacts Store - Manages friends, friend requests, and user blocking
 *
 * This store handles:
 * - Friend list management with real-time updates
 * - Friend request sending, accepting, and declining
 * - User blocking and unblocking
 * - User search functionality
 * - Real-time subscriptions for friend requests and friends subcollection
 * - Status checking (stranger, pending, friend, blocked)
 *
 * Key features:
 * - Firestore subcollection for friends (one-way relationships)
 * - Friend request system with status tracking
 * - Toast notifications for friend request events
 * - Background sync of accepted friend requests
 */

import { db } from "@/config/firebase";
import friendService from "@/services/friendService";
import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { useUsersStore } from "@/stores/usersStore";
import { FriendRequest } from "@/types/FriendRequest";
import { User } from "@/types/User";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { create } from "zustand";

/**
 * Contacts store state interface
 */
export interface ContactsState {
  friends: User[];
  friendRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  blockedUsers: string[];
  loading: boolean;
  searchResults: User[];
  searchLoading: boolean;

  // Actions
  loadFriends: (userId: string) => Promise<void>;
  loadFriendRequests: (userId: string) => Promise<void>;
  loadSentRequests: (userId: string) => Promise<void>;
  sendRequest: (fromUserId: string, toUserId: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  cancelSentRequest: (requestId: string) => Promise<void>;
  blockUser: (userId: string, blockedUserId: string) => Promise<void>;
  unblockUser: (userId: string, blockedUserId: string) => Promise<void>;
  searchUsers: (searchQuery: string, currentUserId: string) => Promise<void>;
  clearSearchResults: () => void;
  getFriendStatus: (
    userId: string,
    targetUserId: string
  ) => "stranger" | "pending" | "friend" | "blocked";
  checkFriendRequestStatus: (
    userId: string,
    targetUserId: string
  ) => Promise<"stranger" | "pending" | "friend" | "blocked">;
  syncFriendsFromAcceptedRequests: (userId: string) => Promise<void>;

  // Real-time subscriptions
  subscribeToFriendRequests: (userId: string) => () => void;
  subscribeToSentRequests: (userId: string) => () => void;
  subscribeToAcceptedRequests: (userId: string) => () => void;
  subscribeToFriendsSubcollection: (userId: string) => () => void;
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  friends: [],
  friendRequests: [],
  sentRequests: [],
  blockedUsers: [],
  loading: false,
  searchResults: [],
  searchLoading: false,

  /**
   * Loads the user's friend requests from Firestore.
   *
   * @param userId The ID of the current user.
   * @returns A promise that resolves when the friend requests are loaded.
   * @throws An error if the operation fails.
   */
  async loadFriendRequests(userId: string) {
    set({ loading: true });
    try {
      const requests = await friendService.getFriendRequests(userId);
      set({ friendRequests: requests, loading: false });
    } catch (error) {
      console.error("Error loading friend requests:", error);
      set({ loading: false });
      throw error;
    }
  },

  /**
   * Loads the user's sent friend requests from Firestore.
   *
   * @param userId The ID of the current user.
   * @returns A promise that resolves when the sent requests are loaded.
   * @throws An error if the operation fails.
   */
  async loadSentRequests(userId: string) {
    set({ loading: true });
    try {
      const requests = await friendService.getSentFriendRequests(userId);
      set({ sentRequests: requests, loading: false });
    } catch (error) {
      console.error("Error loading sent requests:", error);
      set({ loading: false });
      throw error;
    }
  },

  /**
   * Sends a friend request to another user.
   *
   * @param fromUserId The ID of the user sending the request.
   * @param toUserId The ID of the user receiving the request.
   * @returns A promise that resolves when the request is sent.
   * @throws An error if the operation fails.
   */
  async sendRequest(fromUserId: string, toUserId: string) {
    try {
      await friendService.sendFriendRequest(fromUserId, toUserId);

      // Reload sent requests to update UI
      await get().loadSentRequests(fromUserId);
    } catch (error) {
      console.error("Error sending friend request:", error);
      throw error;
    }
  },

  /**
   * Accepts an incoming friend request.
   *
   * This action updates the request status in Firestore and reloads the
   * local friends list to include the new friend.
   *
   * @param requestId The ID of the friend request to accept.
   * @returns A promise that resolves when the request is accepted.
   * @throws An error if the operation fails.
   */
  async acceptRequest(requestId: string) {
    try {
      await friendService.acceptFriendRequest(requestId);

      // Remove from pending requests
      const { friendRequests } = get();
      const updatedRequests = friendRequests.filter(
        (req) => req.id !== requestId
      );
      set({ friendRequests: updatedRequests });

      // Reload friends list to show the new friend
      const { user } = useAuthStore.getState();
      if (user) {
        await get().loadFriends(user.uid);
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
      throw error;
    }
  },

  /**
   * Declines an incoming friend request.
   *
   * @param requestId The ID of the friend request to decline.
   * @returns A promise that resolves when the request is declined.
   * @throws An error if the operation fails.
   */
  async declineRequest(requestId: string) {
    try {
      await friendService.declineFriendRequest(requestId);

      // Remove from pending requests
      const { friendRequests } = get();
      const updatedRequests = friendRequests.filter(
        (req) => req.id !== requestId
      );
      set({ friendRequests: updatedRequests });
    } catch (error) {
      console.error("Error declining friend request:", error);
      throw error;
    }
  },

  /**
   * Cancels a friend request that the current user has sent.
   *
   * @param requestId The ID of the friend request to cancel.
   * @returns A promise that resolves when the request is canceled.
   * @throws An error if the operation fails.
   */
  async cancelSentRequest(requestId: string) {
    try {
      await friendService.deleteFriendRequest(requestId);

      // Remove from sent requests
      const { sentRequests } = get();
      const updatedSentRequests = sentRequests.filter(
        (req) => req.id !== requestId
      );
      set({ sentRequests: updatedSentRequests });
    } catch (error) {
      console.error("Error cancelling sent request:", error);
      throw error;
    }
  },

  /**
   * Blocks another user, which also removes them as a friend if they are one.
   *
   * @param userId The ID of the user performing the block.
   * @param blockedUserId The ID of the user to block.
   * @returns A promise that resolves when the user is blocked.
   * @throws An error if the operation fails.
   */
  async blockUser(userId: string, blockedUserId: string) {
    try {
      await userService.blockUser(userId, blockedUserId);
      await friendService.removeFriend(userId, blockedUserId);

      // Update local state
      const { blockedUsers } = get();
      if (!blockedUsers.includes(blockedUserId)) {
        set({ blockedUsers: [...blockedUsers, blockedUserId] });
      }

      // Remove from friends if they were friends
      const { friends } = get();
      const updatedFriends = friends.filter(
        (friend) => friend.id !== blockedUserId
      );
      set({ friends: updatedFriends });
    } catch (error) {
      console.error("Error blocking user:", error);
      throw error;
    }
  },

  /**
   * Unblocks a user.
   *
   * @param userId The ID of the user performing the unblock.
   * @param blockedUserId The ID of the user to unblock.
   * @returns A promise that resolves when the user is unblocked.
   * @throws An error if the operation fails.
   */
  async unblockUser(userId: string, blockedUserId: string) {
    try {
      await userService.unblockUser(userId, blockedUserId);

      // Update local state
      const { blockedUsers } = get();
      const updatedBlocked = blockedUsers.filter((id) => id !== blockedUserId);
      set({ blockedUsers: updatedBlocked });
    } catch (error) {
      console.error("Error unblocking user:", error);
      throw error;
    }
  },

  /**
   * Searches for users by their display name or email.
   *
   * @param searchQuery The search term.
   * @param currentUserId The ID of the current user, to exclude them from results.
   * @returns A promise that resolves when the search is complete.
   * @throws An error if the search fails.
   */
  async searchUsers(searchQuery: string, currentUserId: string) {
    set({ searchLoading: true });
    try {
      const results = await userService.searchUsers(searchQuery, currentUserId);
      set({ searchResults: results, searchLoading: false });
    } catch (error) {
      console.error("Error searching users:", error);
      set({ searchLoading: false });
      throw error;
    }
  },

  /**
   * Clears the current user search results.
   */
  clearSearchResults() {
    set({ searchResults: [] });
  },

  /**
   * Load user's friends list
   *
   * Fetches friend IDs from Firestore subcollection, loads user profiles,
   * and subscribes to real-time updates for all friends.
   *
   * @param userId - User ID to load friends for
   * @throws Error if loading fails
   */
  async loadFriends(userId: string) {
    set({ loading: true });
    try {
      const friendIds = await friendService.getFriends(userId);
      const friends = await userService.getUsersByIds(friendIds);

      // Subscribe to real-time updates for all friends
      if (friendIds.length > 0) {
        const { subscribeToUsers } = useUsersStore.getState();
        subscribeToUsers(friendIds);
      }

      set({ friends, loading: false });
    } catch (error) {
      console.error("Error loading friends:", error);
      set({ loading: false });
      throw error;
    }
  },

  /**
   * Get friendship status between two users
   *
   * Checks local state to determine the relationship status.
   * Returns one of: "stranger", "pending", "friend", or "blocked"
   *
   * @param userId - Current user's ID
   * @param targetUserId - Other user's ID
   * @returns Friendship status
   */
  getFriendStatus(
    userId: string,
    targetUserId: string
  ): "stranger" | "pending" | "friend" | "blocked" {
    const { friends, friendRequests, sentRequests, blockedUsers } = get();

    // Check if blocked
    if (blockedUsers.includes(targetUserId)) {
      return "blocked";
    }

    // Check if friends
    const isFriend = friends.some((friend) => friend.id === targetUserId);
    if (isFriend) {
      return "friend";
    }

    // Check if there's a pending request (sent or received)
    const hasPendingRequest =
      friendRequests.some((req) => req.fromUserId === targetUserId) ||
      sentRequests.some((req) => req.toUserId === targetUserId);
    if (hasPendingRequest) {
      return "pending";
    }

    return "stranger";
  },

  /**
   * Checks the friendship status between two users by querying Firestore.
   *
   * This provides a real-time check of the relationship status, which is useful
   * when the local state might be stale.
   *
   * @param userId The ID of the current user.
   * @param targetUserId The ID of the other user.
   * @returns A promise that resolves to the friendship status.
   */
  checkFriendRequestStatus: async (
    userId: string,
    targetUserId: string
  ): Promise<"stranger" | "pending" | "friend" | "blocked"> => {
    try {
      // First check if they are already friends using the subcollection
      const areFriends = await friendService.areFriends(userId, targetUserId);
      if (areFriends) {
        return "friend";
      }

      // Check if there's a pending friend request between these users
      const existingRequest = await friendService.getFriendRequest(
        userId,
        targetUserId
      );

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          return "pending";
        } else if (existingRequest.status === "declined") {
          return "stranger"; // Treat declined requests as strangers
        }
      }

      return "stranger";
    } catch (error) {
      console.debug("Error checking friend request status:", error);
      return "stranger";
    }
  },

  /**
   * Subscribes to real-time updates for incoming friend requests.
   *
   * This listener keeps the `friendRequests` array in the store up-to-date
   * and also triggers a toast notification when a new request is received.
   *
   * @param userId The ID of the current user.
   * @returns An `unsubscribe` function to clean up the listener.
   */
  subscribeToFriendRequests: (userId: string) => {
    const friendRequestsQuery = query(
      collection(db, "friendRequests"),
      where("toUserId", "==", userId),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      friendRequestsQuery,
      async (snapshot) => {
        const requests: FriendRequest[] = [];
        const { addToast } = useToastStore.getState();

        // Process all documents first
        snapshot.forEach((doc) => {
          requests.push({ id: doc.id, ...doc.data() } as FriendRequest);
        });

        // Check for new friend requests using docChanges
        for (const docChange of snapshot.docChanges()) {
          if (docChange.type === "added") {
            const requestData = docChange.doc.data() as FriendRequest;

            try {
              // Get sender profile
              const senderProfile = await userService.getUserProfile(
                requestData.fromUserId
              );
              const senderName = senderProfile?.displayName || "Unknown User";

              addToast({
                type: "friend_request",
                title: "Friend Request",
                message: `${senderName} sent you a friend request`,
                senderId: requestData.fromUserId,
                senderName,
              });
            } catch (error) {
              console.error(
                "Error getting sender profile for friend request toast:",
                error
              );
            }
          }
        }

        set({ friendRequests: requests });
      },
      (error) => {
        console.error("Error subscribing to friend requests:", error);
      }
    );

    return unsubscribe;
  },

  /**
   * Subscribes to real-time updates for sent friend requests.
   *
   * This keeps the `sentRequests` array in the store synchronized with any
   * changes in the status of outgoing requests (e.g., if they are accepted or
   * declined by the other user).
   *
   * @param userId The ID of the current user.
   * @returns An `unsubscribe` function to clean up the listener.
   */
  subscribeToSentRequests: (userId: string) => {
    const sentRequestsQuery = query(
      collection(db, "friendRequests"),
      where("fromUserId", "==", userId),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      sentRequestsQuery,
      (snapshot) => {
        const requests: FriendRequest[] = [];
        snapshot.forEach((doc) => {
          requests.push({ id: doc.id, ...doc.data() } as FriendRequest);
        });
        set({ sentRequests: requests });
      },
      (error) => {
        console.error("Error subscribing to sent requests:", error);
      }
    );

    return unsubscribe;
  },

  /**
   * Subscribes to friend requests sent by the current user that have been accepted.
   *
   * This is a key part of the bidirectional friendship model. When another user
   * accepts a request, this listener detects the change and triggers the logic
   * to add the new friend to the current user's own `friends` subcollection,
   * completing the friendship link. It also shows a toast notification.
   *
   * @param userId The ID of the current user.
   * @returns An `unsubscribe` function to clean up the listener.
   */
  subscribeToAcceptedRequests: (userId: string) => {
    const acceptedRequestsQuery = query(
      collection(db, "friendRequests"),
      where("fromUserId", "==", userId),
      where("status", "==", "accepted")
    );

    const unsubscribe = onSnapshot(
      acceptedRequestsQuery,
      async (snapshot) => {
        const { addToast } = useToastStore.getState();

        for (const docSnapshot of snapshot.docChanges()) {
          if (docSnapshot.type === "added" || docSnapshot.type === "modified") {
            const requestData = docSnapshot.doc.data();

            // Show toast for accepted friend requests (when status changes to accepted)
            if (docSnapshot.type === "modified") {
              try {
                // Get recipient profile
                const recipientProfile = await userService.getUserProfile(
                  requestData.toUserId
                );
                const recipientName =
                  recipientProfile?.displayName || "Unknown User";

                addToast({
                  type: "friend_accepted",
                  title: "Friend Request Accepted",
                  message: `${recipientName} accepted your friend request`,
                  senderId: requestData.toUserId,
                  senderName: recipientName,
                });
              } catch (error) {
                console.error(
                  "Error getting recipient profile for friend accepted toast:",
                  error
                );
              }
            }

            // Add the friend to the current user's friends subcollection
            try {
              await friendService.addFriendToSubcollection(
                userId,
                requestData.toUserId
              );
            } catch (error) {
              console.error("Error adding friend to subcollection:", error);
            }
          }
        }
      },
      (error) => {
        console.error("Error subscribing to accepted requests:", error);
      }
    );

    return unsubscribe;
  },

  /**
   * Subscribes to changes in the user's `friends` subcollection.
   *
   * This ensures that the local friends list is always in sync with Firestore,
   * automatically reflecting any additions or removals of friends.
   *
   * @param userId The ID of the current user.
   * @returns An `unsubscribe` function to clean up the listener.
   */
  subscribeToFriendsSubcollection: (userId: string) => {
    const friendsRef = collection(db, "users", userId, "friends");

    const unsubscribe = onSnapshot(
      friendsRef,
      async (snapshot) => {
        // Update the friends list when the subcollection changes
        const { loadFriends } = get();
        try {
          await loadFriends(userId);
        } catch (error) {
          console.error(
            "Error reloading friends after subcollection change:",
            error
          );
        }
      },
      (error) => {
        console.error("Error subscribing to friends subcollection:", error);
      }
    );

    return unsubscribe;
  },

  /**
   * Syncs the local friends list based on accepted friend requests.
   *
   * This is a cleanup and synchronization mechanism that runs on startup. It
   * fetches all friend requests sent by the user that have been accepted, ensures
   * that the corresponding friends are present in the user's `friends`
   * subcollection, and then deletes the processed request documents.
   *
   * @param userId The ID of the current user.
   * @returns A promise that resolves when the sync is complete.
   * @throws An error if the operation fails.
   */
  async syncFriendsFromAcceptedRequests(userId: string) {
    console.log("Starting syncFriendsFromAcceptedRequests");
    try {
      const acceptedRequests = await friendService.getAcceptedSentRequests(
        userId
      );
      console.log(
        "syncFriendsFromAcceptedRequests acceptedRequests:",
        acceptedRequests
      );

      // Process each request one at a time for reliability
      for (const request of acceptedRequests) {
        try {
          // Check if friend relationship already exists
          const friendExists = await friendService.areFriends(
            userId,
            request.toUserId
          );
          console.log("syncFriendsFromAcceptedRequests", friendExists);

          if (!friendExists) {
            // Add friend to subcollection
            await friendService.addFriendToSubcollection(
              userId,
              request.toUserId
            );
          }

          // Delete the processed request (only fromUser deletes)
          await friendService.deleteFriendRequest(request.id);
          console.log("syncFriendsFromAcceptedRequests", "deleted", request.id);
        } catch (error) {
          console.error(
            `Error processing accepted request ${request.id}:`,
            error
          );
          // Continue processing other requests even if one fails
        }
      }

      // Reload friends list to reflect any new additions
      await get().loadFriends(userId);
    } catch (error) {
      console.error("Error syncing friends from accepted requests:", error);
      throw error;
    }
  },
}));
