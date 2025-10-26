/**
 * @fileoverview Type definition for the Friend data model.
 *
 * This file defines the TypeScript interface for a `Friend` object. This
 * represents a confirmed friendship link between two users and is stored in a
 * `friends` subcollection within each user's document in Firestore.
 *
 * The `id` field stores the user ID of the friend, and the `addedAt` timestamp
 * provides a record of when the friendship was established. This simple data
 * structure is a key part of the application's social graph.
 *
 * @see friendService for the service that manages friendship data.
 * @see /users/{uId}/friends/{friendId} for the Firestore path.
 */
import { Timestamp } from "firebase/firestore";

export interface Friend {
  id: string; // Friend's user ID
  addedAt: Timestamp;
}
