import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import { SQLiteUser } from "@/services/sqlite/core/types";
import { User } from "@/types/User";
import { Timestamp } from "firebase/firestore";

/**
 * User Repository - handles user profile caching operations
 *
 * This repository provides methods for:
 * - Caching user profiles locally
 * - Retrieving user profiles from cache
 * - Batch user profile operations
 */
export class UserRepository {
  constructor(private db: SQLiteDatabase) {}

  /**
   * Save user profile to local cache
   */
  async saveUserProfile(user: User): Promise<void> {
    const db = this.db.getDb();

    try {
      await this.db.runSingleWrite(async () => {
        await db.runAsync(
          `
          INSERT OR REPLACE INTO users (
            id, email, displayName, avatar, languagePreferences,
            aiSettings, blockedUsers, createdAt, lastSeen, online, heartbeat, syncedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            user.id,
            user.email,
            user.displayName,
            user.avatar || null,
            JSON.stringify(user.languagePreferences),
            JSON.stringify(user.aiSettings),
            JSON.stringify(user.blockedUsers),
            user.createdAt?.toMillis() || Date.now(),
            user.lastSeen?.toMillis() || Date.now(),
            user.online ? 1 : 0,
            user.heartbeat?.toMillis() || 0,
            Date.now(),
          ]
        );
      });
    } catch (error) {
      console.error("sqlite", "Error saving user profile:", error);
      throw error;
    }
  }

  /**
   * Get user profile from local cache
   */
  async getUserProfile(userId: string): Promise<User | null> {
    const db = this.db.getDb();

    try {
      const row = await db.getFirstAsync<SQLiteUser>(
        "SELECT * FROM users WHERE id = ?",
        [userId]
      );

      if (!row) return null;

      return {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        avatar: row.avatar || undefined,
        languagePreferences: JSON.parse(row.languagePreferences),
        aiSettings: JSON.parse(row.aiSettings),
        blockedUsers: JSON.parse(row.blockedUsers),
        createdAt: Timestamp.fromMillis(row.createdAt),
        lastSeen: Timestamp.fromMillis(row.lastSeen),
        online: row.online === 1,
        heartbeat: Timestamp.fromMillis(row.heartbeat),
      } as User;
    } catch (error) {
      console.error("sqlite", "Error getting user profile:", error);
      throw error;
    }
  }

  /**
   * Get multiple user profiles from local cache
   */
  async getUserProfiles(userIds: string[]): Promise<User[]> {
    const db = this.db.getDb();

    try {
      if (userIds.length === 0) {
        return [];
      }

      const placeholders = userIds.map(() => "?").join(",");
      const rows = await db.getAllAsync<SQLiteUser>(
        `SELECT * FROM users WHERE id IN (${placeholders})`,
        userIds
      );

      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        avatar: row.avatar || undefined,
        languagePreferences: JSON.parse(row.languagePreferences),
        aiSettings: JSON.parse(row.aiSettings),
        blockedUsers: JSON.parse(row.blockedUsers),
        createdAt: Timestamp.fromMillis(row.createdAt),
        lastSeen: Timestamp.fromMillis(row.lastSeen),
        online: row.online === 1,
        heartbeat: Timestamp.fromMillis(row.heartbeat),
      })) as User[];
    } catch (error) {
      console.error("sqlite", "Error getting user profiles:", error);
      throw error;
    }
  }
}
