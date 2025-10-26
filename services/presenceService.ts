/**
 * @fileoverview Presence Service - Manages user online status and real-time activity.
 *
 * This service implements the application's presence system, allowing users to
 * see when others are online and active. It uses a heartbeat mechanism to
 * periodically update a user's status in Firestore, which other clients can
 * observe in real-time. The service is implemented as a singleton to ensure
 * that there is only one heartbeat interval running for the current user.
 *
 * @see /docs/friends-and-presence.md for a detailed explanation of the presence model.
 * @see authStore for how this service is started and stopped during the user's session.
 */

/**
 * @fileoverview Presence Service - Manages user online presence and heartbeats
 *
 * This service handles:
 * - Setting and updating user online/offline status
 * - Heartbeat mechanism (30-second intervals) to track active users
 * - Single instance pattern to ensure consistent state
 *
 * The heartbeat system updates a timestamp every 30 seconds, allowing other users
 * to determine if someone is currently active (within last 40 seconds).
 *
 * @notes
 * The presence system relies on two fields in the user document: `online` (a boolean)
 * and `heartbeat` (a timestamp). The `online` flag is set to true on sign-in
 * and false on sign-out. The `heartbeat` is updated every 30 seconds while the
 * user is active. Other clients can then check if the `heartbeat` is within the
 * last 40 seconds to determine if a user is currently active, which helps to
 * account for network delays and provides a more robust presence indicator than
 * the `online` flag alone.
 */

import { db } from "@/config/firebase";
import { logger } from "@/stores/loggerStore";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

class PresenceService {
  private static instance: PresenceService;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Get singleton instance of PresenceService
   * Ensures only one instance exists throughout the app lifecycle
   */
  static getInstance(): PresenceService {
    if (!PresenceService.instance) {
      PresenceService.instance = new PresenceService();
    }
    return PresenceService.instance;
  }

  /**
   * Set user's online status
   *
   * Updates both the online flag and heartbeat timestamp in Firestore.
   * Used when user signs in/out or changes presence state.
   *
   * @param userId - User ID to update
   * @param online - Whether user is online
   * @throws Error if update fails
   */
  async setOnlineStatus(userId: string, online: boolean): Promise<void> {
    try {
      logger.debug(
        "presence",
        `Setting online status for user ${userId}: ${online}`
      );

      await updateDoc(doc(db, "users", userId), {
        online,
        heartbeat: serverTimestamp(),
      });

      logger.debug(
        "presence",
        `Online status updated successfully for user ${userId}`
      );
    } catch (error) {
      logger.debug(
        "presence",
        `Failed to set online status for user ${userId}`,
        {
          error: error instanceof Error ? error.message : "Unknown error",
          online,
        }
      );
      throw error;
    }
  }

  /**
   * Updates the user's heartbeat timestamp in Firestore.
   *
   * This method is called periodically by the `startHeartbeat` interval to
   * signal that the user is still active.
   *
   * @param userId - The ID of the user to update.
   * @returns A promise that resolves when the heartbeat is successfully updated.
   * @throws An error if the Firestore update fails.
   */
  async updateHeartbeat(userId: string): Promise<void> {
    try {
      await updateDoc(doc(db, "users", userId), {
        heartbeat: serverTimestamp(),
      });

      logger.debug("presence", `Heartbeat updated for user ${userId}`);
    } catch (error) {
      logger.debug(
        "presence",
        `Failed to update heartbeat for user ${userId}`,
        {
          error: error instanceof Error ? error.message : "Unknown error",
        }
      );
      throw error;
    }
  }

  /**
   * Starts a periodic heartbeat to keep the user's presence status fresh.
   *
   * This method sets up an interval that calls `updateHeartbeat` every 30 seconds.
   * It should be called when the user signs in or brings the app to the foreground.
   * It ensures any previously running heartbeat is stopped before starting a new one.
   *
   * @param userId - The ID of the user for whom to start the heartbeat.
   */
  startHeartbeat(userId: string): void {
    this.stopHeartbeat();

    logger.info("presence", `Starting heartbeat for user ${userId}`);

    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat(userId).catch((error) => {
        logger.debug("presence", `Heartbeat failed for user ${userId}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
    }, 30000); // 30 seconds
  }

  /**
   * Stops the periodic heartbeat.
   *
   * This should be called when the user signs out or sends the app to the
   * background to prevent unnecessary Firestore writes.
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      logger.info("presence", "Stopping heartbeat");
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export default PresenceService.getInstance();
