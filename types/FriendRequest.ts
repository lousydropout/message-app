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
