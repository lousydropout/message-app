import { db } from "@/config/firebase";
import { logger } from "@/stores/loggerStore";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

class PresenceService {
  private static instance: PresenceService;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  static getInstance(): PresenceService {
    if (!PresenceService.instance) {
      PresenceService.instance = new PresenceService();
    }
    return PresenceService.instance;
  }

  /**
   * Set user's online status
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
   * Update user's heartbeat timestamp
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
   * Start heartbeat interval (30 seconds)
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
   * Stop heartbeat interval
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
