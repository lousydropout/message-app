/**
 * @fileoverview Type definitions for the Friend Request data model.
 *
 * This file contains the TypeScript interface for a `FriendRequest` object,
 * which represents a pending, accepted, or declined invitation to connect
 * from one user to another. These objects are stored in a top-level
 * `friendRequests` collection in Firestore.
 *
 * The `status` field is crucial for tracking the lifecycle of the request,
 * and the `fromUserId` and `toUserId` fields establish the direction of the
 * invitation. This data model is central to the application's social features,
 * allowing users to manage their connections.
 *
 * @see friendService for the service that manages friend requests.
 * @see /friendRequests/{requestId} for the Firestore path.
 */
import { Timestamp } from "firebase/firestore";

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type FriendRequestStatus = FriendRequest["status"];
