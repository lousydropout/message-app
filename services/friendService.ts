/**
 * @fileoverview Friend Service - Manages friendships and friend requests.
 *
 * This service implements the application's social features, including sending,
 * accepting, and declining friend requests, as well as managing the list of
 * friends for each user. It uses a combination of a top-level `friendRequests`
 * collection and a `friends` subcollection within each user document.
 *
 * @see /docs/friends-and-presence.md for a detailed explanation of the data model.
 * @see contactsStore for how this service is used in the application's state.
 */

/**
 * @fileoverview Friend Service - Manages friendships and friend requests
 *
 * This service handles:
 * - Sending, accepting, and declining friend requests
 * - Managing friends subcollection (one-way relationships)
 * - Friend status checking
 * - Cleaning up declined friend requests
 *
 * Key features:
 * - Friend requests stored in top-level collection
 * - Friends stored in subcollection: users/{userId}/friends/{friendId}
 * - Bidirectional relationships created by each user separately
 * - Status-based request workflow (pending, accepted, declined)
 *
 * @notes
 * The friendship model is based on a `friends` subcollection within each user's
 * document. A friendship is considered established only when *both* users have
 * a document for the other in their respective `friends` subcollections. This
 * design allows for scalable friend lookups (O(1) complexity) and simplifies
 * security rules. The `friendRequests` collection serves as an audit trail and
 * a transactional record for managing the lifecycle of a friend request.
 */

import { db } from "@/config/firebase";
import { Friend } from "@/types/Friend";
import { FriendRequest } from "@/types/FriendRequest";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

export class FriendService {
  private static instance: FriendService;

  /**
   * Get singleton instance of FriendService
   */
  static getInstance(): FriendService {
    if (!FriendService.instance) {
      FriendService.instance = new FriendService();
    }
    return FriendService.instance;
  }

  /**
   * Send a friend request
   *
   * Creates a friend request document in Firestore. It includes checks to prevent
   * duplicate requests or sending a request to an existing friend. If a previous
   * request was declined, it is deleted to allow a new one to be sent.
   *
   * @param fromUserId - The ID of the user sending the request.
   * @param toUserId - The ID of the user receiving the request.
   * @returns A promise that resolves when the request is successfully sent.
   * @throws An error if a pending request already exists or if the users are already friends.
   */
  async sendFriendRequest(fromUserId: string, toUserId: string): Promise<void> {
    try {
      // Check if request already exists
      const existingRequest = await this.getFriendRequest(fromUserId, toUserId);
      if (existingRequest) {
        // Allow new request if previous one was declined
        if (existingRequest.status === "declined") {
          // Delete the declined request to allow a new one
          await this.deleteFriendRequest(existingRequest.id);
        } else if (existingRequest.status === "pending") {
          throw new Error("Friend request already exists");
        } else if (existingRequest.status === "accepted") {
          throw new Error("Users are already friends");
        }
      }

      // Check if users are already friends (double-check)
      const areFriends = await this.areFriends(fromUserId, toUserId);
      if (areFriends) {
        throw new Error("Users are already friends");
      }

      const friendRequestRef = doc(collection(db, "friendRequests"));
      const now = serverTimestamp();

      const friendRequest: FriendRequest = {
        id: friendRequestRef.id,
        fromUserId,
        toUserId,
        status: "pending",
        createdAt: now as Timestamp,
        updatedAt: now as Timestamp,
      };

      await setDoc(friendRequestRef, friendRequest);
    } catch (error) {
      console.error("Error sending friend request:", error);
      throw error;
    }
  }

  /**
   * Accepts a friend request, creating a one-way friendship link.
   *
   * This method performs two key actions:
   * 1. Updates the friend request's status to "accepted" for auditing purposes.
   * 2. Adds a document to the recipient's `friends` subcollection, representing
   *    the sender as a friend.
   *
   * @param requestId - The ID of the friend request to accept.
   * @returns A promise that resolves when the operation is complete.
   * @throws An error if the friend request is not found.
   *
   * @note This only creates the friendship in one direction (recipient -> sender).
   * The sender's client is expected to listen for this change via a real-time
   * subscription and then call `addFriendToSubcollection` to complete the
   * bidirectional relationship.
   */
  async acceptFriendRequest(requestId: string): Promise<void> {
    try {
      // Get request data
      const requestRef = doc(db, "friendRequests", requestId);
      const requestDoc = await getDoc(requestRef);

      if (!requestDoc.exists()) {
        throw new Error("Friend request not found");
      }

      const data = requestDoc.data();

      // Update request status (keep for audit)
      await updateDoc(requestRef, {
        status: "accepted",
        updatedAt: serverTimestamp(),
      });

      // Only create friend document in the current user's subcollection
      // The other user will be notified via real-time subscription and update their own
      await setDoc(
        doc(db, "users", data.toUserId, "friends", data.fromUserId),
        {
          id: data.fromUserId,
          addedAt: serverTimestamp(),
        } as Friend
      );
    } catch (error) {
      console.error("Error accepting friend request:", error);
      throw error;
    }
  }

  /**
   * Declines a friend request by updating its status.
   *
   * The declined request document is kept in Firestore for auditing and to
   * prevent new requests from being sent immediately, though `sendFriendRequest`
   * will delete it if a new request is attempted.
   *
   * @param requestId - The ID of the friend request to decline.
   * @returns A promise that resolves when the request is successfully declined.
   * @throws An error if the update operation fails.
   */
  async declineFriendRequest(requestId: string): Promise<void> {
    try {
      const requestRef = doc(db, "friendRequests", requestId);
      await updateDoc(requestRef, {
        status: "declined",
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error declining friend request:", error);
      throw error;
    }
  }

  /**
   * Deletes a friend request document from Firestore.
   *
   * This is primarily used to clean up declined requests to allow a user
   * to send a new request to the same person.
   *
   * @param requestId - The ID of the friend request to delete.
   * @returns A promise that resolves when the document is deleted.
   * @throws An error if the deletion fails.
   */
  async deleteFriendRequest(requestId: string): Promise<void> {
    try {
      const requestRef = doc(db, "friendRequests", requestId);
      await deleteDoc(requestRef);
    } catch (error) {
      console.error("Error deleting friend request:", error);
      throw error;
    }
  }

  /**
   * Retrieves all pending friend requests for a given user.
   *
   * @param userId - The ID of the user whose incoming requests are to be fetched.
   * @returns A promise that resolves to an array of `FriendRequest` objects.
   * @throws An error if the query fails.
   * @note Sorts requests by creation date on the client-side to avoid needing a composite index.
   */
  async getFriendRequests(userId: string): Promise<FriendRequest[]> {
    try {
      const requestsQuery = query(
        collection(db, "friendRequests"),
        where("toUserId", "==", userId),
        where("status", "==", "pending")
      );

      const querySnapshot = await getDocs(requestsQuery);
      const requests = querySnapshot.docs.map(
        (doc) => doc.data() as FriendRequest
      );

      // Sort by createdAt on the client side to avoid composite index requirement
      return requests.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime; // Descending order
      });
    } catch (error) {
      console.error("Error getting friend requests:", error);
      throw error;
    }
  }

  /**
   * Retrieves all pending friend requests sent by a given user.
   *
   * @param userId - The ID of the user whose sent requests are to be fetched.
   * @returns A promise that resolves to an array of `FriendRequest` objects.
   * @throws An error if the query fails.
   * @note Sorts requests by creation date on the client-side.
   */
  async getSentFriendRequests(userId: string): Promise<FriendRequest[]> {
    try {
      const requestsQuery = query(
        collection(db, "friendRequests"),
        where("fromUserId", "==", userId),
        where("status", "==", "pending")
      );

      const querySnapshot = await getDocs(requestsQuery);
      const requests = querySnapshot.docs.map(
        (doc) => doc.data() as FriendRequest
      );

      // Sort by createdAt on the client side to avoid composite index requirement
      return requests.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bTime - aTime; // Descending order
      });
    } catch (error) {
      console.error("Error getting sent friend requests:", error);
      throw error;
    }
  }

  /**
   * Checks if a friendship exists from `userId1` to `userId2`.
   *
   * This check is one-directional. For a full bidirectional friendship check,
   * this method would need to be called twice, swapping the user IDs.
   *
   * @param userId1 - The ID of the user whose friend list is being checked.
   * @param userId2 - The ID of the potential friend.
   * @returns A promise that resolves to `true` if `userId2` is in `userId1`'s friends, `false` otherwise.
   */
  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    try {
      const friendDoc = await getDoc(
        doc(db, "users", userId1, "friends", userId2)
      );
      return friendDoc.exists();
    } catch (error) {
      console.debug("Error checking friendship:", error);
      return false;
    }
  }

  /**
   * Retrieves a friend request between two users, regardless of direction.
   *
   * This is useful for checking if a request already exists before sending a new one.
   * It performs two parallel queries to check both `fromUser -> toUser` and
   * `toUser -> fromUser`.
   *
   * @param fromUserId - The ID of the first user.
   * @param toUserId - The ID of the second user.
   * @returns A promise that resolves to the `FriendRequest` object or `null` if none exists.
   */
  async getFriendRequest(
    fromUserId: string,
    toUserId: string
  ): Promise<FriendRequest | null> {
    try {
      // Search in both directions to find any existing request
      const requestQuery1 = query(
        collection(db, "friendRequests"),
        where("fromUserId", "==", fromUserId),
        where("toUserId", "==", toUserId),
        limit(1)
      );

      const requestQuery2 = query(
        collection(db, "friendRequests"),
        where("fromUserId", "==", toUserId),
        where("toUserId", "==", fromUserId),
        limit(1)
      );

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(requestQuery1),
        getDocs(requestQuery2),
      ]);

      if (!snapshot1.empty) {
        return snapshot1.docs[0].data() as FriendRequest;
      }
      if (!snapshot2.empty) {
        return snapshot2.docs[0].data() as FriendRequest;
      }

      return null;
    } catch (error) {
      console.debug("Error getting friend request:", error);
      return null;
    }
  }

  /**
   * Retrieves the IDs of all friends for a given user.
   *
   * This method reads the `friends` subcollection for the specified user and
   * returns an array of friend user IDs.
   *
   * @param userId - The ID of the user whose friends are to be fetched.
   * @returns A promise that resolves to an array of friend user IDs.
   * @throws An error if the query fails.
   */
  async getFriends(userId: string): Promise<string[]> {
    try {
      const friendsRef = collection(db, "users", userId, "friends");
      const snapshot = await getDocs(friendsRef);
      return snapshot.docs.map((doc) => doc.id);
    } catch (error) {
      console.error("Error getting friends:", error);
      throw error;
    }
  }

  /**
   * Adds a friend document to a user's `friends` subcollection.
   *
   * This is a key step in establishing the bidirectional friendship. It should be
   * called by a user's client when they detect that another user has accepted
   * their friend request.
   *
   * @param userId - The ID of the user whose friend list is being updated.
   * @param friendId - The ID of the friend to add.
   * @returns A promise that resolves when the friend is successfully added.
   * @throws An error if the write operation fails.
   */
  async addFriendToSubcollection(
    userId: string,
    friendId: string
  ): Promise<void> {
    try {
      await setDoc(doc(db, "users", userId, "friends", friendId), {
        id: friendId,
        addedAt: serverTimestamp(),
      } as Friend);
    } catch (error) {
      console.error("Error adding friend to subcollection:", error);
      throw error;
    }
  }

  /**
   * Removes a friend from a user's `friends` subcollection.
   *
   * This action is one-directional. The other user in the friendship is expected
   * to perform the same action on their end to fully dissolve the connection.
   * This is typically handled via real-time listeners that detect the change.
   *
   * @param userId - The ID of the user whose friend list is being updated.
   * @param friendId - The ID of the friend to remove.
   * @returns A promise that resolves when the friend is successfully removed.
   * @throws An error if the deletion fails.
   */
  async removeFriend(userId: string, friendId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, "users", userId, "friends", friendId));
    } catch (error) {
      console.error("Error removing friend:", error);
      throw error;
    }
  }

  /**
   * Retrieves all accepted friend requests sent by a user.
   *
   * This method is crucial for synchronizing the local state. For example, if a
   * user sends a request and the other user accepts it while the sender is offline,
   * this function allows the sender's client to discover the new friendship
   * upon coming back online and update their own `friends` subcollection accordingly.
   *
   * @param userId - The ID of the user who sent the requests.
   * @returns A promise that resolves to an array of accepted `FriendRequest` objects.
   * @throws An error if the query fails.
   */
  async getAcceptedSentRequests(userId: string): Promise<FriendRequest[]> {
    try {
      const requestsQuery = query(
        collection(db, "friendRequests"),
        where("fromUserId", "==", userId),
        where("status", "==", "accepted")
      );

      const querySnapshot = await getDocs(requestsQuery);
      return querySnapshot.docs.map((doc) => doc.data() as FriendRequest);
    } catch (error) {
      console.error("Error getting accepted sent requests:", error);
      throw error;
    }
  }
}

export default FriendService.getInstance();
