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

  static getInstance(): FriendService {
    if (!FriendService.instance) {
      FriendService.instance = new FriendService();
    }
    return FriendService.instance;
  }

  /**
   * Send a friend request
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
   * Accept a friend request
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
   * Decline a friend request
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
   * Delete a friend request (for cleaning up declined requests)
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
   * Get all friend requests for a user
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
   * Get sent friend requests by a user
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
   * Check if two users are friends
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
   * Get friend request between two users (searches both directions)
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
   * Get all friends for a user (returns friend IDs)
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
   * Add a friend to the current user's subcollection
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
   * Remove friend from the current user's subcollection only
   * The other user will be notified via real-time subscription and remove from their own
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
   * Get all accepted friend requests where the user was the sender
   * Used to sync friends subcollection on app startup
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
