import { db } from "@/config/firebase";
import { FriendRequest } from "@/types/FriendRequest";
import {
  collection,
  deleteDoc,
  doc,
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
      const requestRef = doc(db, "friendRequests", requestId);
      await updateDoc(requestRef, {
        status: "accepted",
        updatedAt: serverTimestamp(),
      });
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
        const aTime = a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
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
        const aTime = a.createdAt.toDate ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt.toDate ? b.createdAt.toDate().getTime() : 0;
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
      // Check both directions of friendship to avoid composite index requirement
      const query1 = query(
        collection(db, "friendRequests"),
        where("fromUserId", "==", userId1),
        where("toUserId", "==", userId2),
        where("status", "==", "accepted")
      );

      const query2 = query(
        collection(db, "friendRequests"),
        where("fromUserId", "==", userId2),
        where("toUserId", "==", userId1),
        where("status", "==", "accepted")
      );

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(query1),
        getDocs(query2),
      ]);

      return !snapshot1.empty || !snapshot2.empty;
    } catch (error) {
      console.error("Error checking friendship:", error);
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
      console.error("Error getting friend request:", error);
      return null;
    }
  }

  /**
   * Get all accepted friends for a user
   */
  async getFriends(userId: string): Promise<FriendRequest[]> {
    try {
      const friendsQuery = query(
        collection(db, "friendRequests"),
        where("status", "==", "accepted"),
        where("fromUserId", "==", userId)
      );

      const querySnapshot = await getDocs(friendsQuery);
      const sentFriends = querySnapshot.docs.map(
        (doc) => doc.data() as FriendRequest
      );

      const receivedQuery = query(
        collection(db, "friendRequests"),
        where("status", "==", "accepted"),
        where("toUserId", "==", userId)
      );

      const receivedSnapshot = await getDocs(receivedQuery);
      const receivedFriends = receivedSnapshot.docs.map(
        (doc) => doc.data() as FriendRequest
      );

      const allFriends = [...sentFriends, ...receivedFriends];

      // Sort by updatedAt on the client side to avoid composite index requirement
      return allFriends.sort((a, b) => {
        const aTime = a.updatedAt.toDate ? a.updatedAt.toDate().getTime() : 0;
        const bTime = b.updatedAt.toDate ? b.updatedAt.toDate().getTime() : 0;
        return bTime - aTime; // Descending order
      });
    } catch (error) {
      console.error("Error getting friends:", error);
      throw error;
    }
  }
}

export default FriendService.getInstance();
