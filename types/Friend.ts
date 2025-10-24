import { Timestamp } from "firebase/firestore";

export interface Friend {
  id: string; // Friend's user ID
  addedAt: Timestamp;
}
