import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import { SQLiteUser } from "@/services/sqlite/core/types";
import { User } from "@/types/User";
import { Timestamp } from "firebase/firestore";

/**
 * @fileoverview User Repository - Manages the local cache of user profiles in SQLite.
 *
 * This repository is responsible for storing and retrieving user profile data
 * in the local SQLite database. By caching user profiles, the application can
 * reduce its reliance on Firestore for frequently accessed user information,
 * leading to faster UI rendering and lower costs. The repository handles the
 * serialization and deserialization of complex data types to and from the
 * format required by SQLite.
 *
 * @see usersStore for how user data is managed in the application's state.
 * @see userService for fetching user profiles from Firestore.
 */

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
   * Saves a user's profile to the local SQLite cache.
   *
   * This method performs an "upsert" (INSERT OR REPLACE) to ensure that the
   * local cache always has the most up-to-date user profile information.
   *
   * @param user The `User` object to be cached.
   * @returns A promise that resolves when the profile is successfully saved.
   * @throws An error if the database operation fails.
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
   * Retrieves a single user profile from the local cache by their ID.
   *
   * @param userId The ID of the user to retrieve.
   * @returns A promise that resolves to the `User` object, or `null` if the user is not in the cache.
   * @throws An error if the database query fails.
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
   * Retrieves multiple user profiles from the local cache in a single batch.
   *
   * This is more efficient than fetching profiles one by one, as it reduces
   * the number of database queries.
   *
   * @param userIds An array of user IDs to retrieve.
   * @returns A promise that resolves to an array of `User` objects.
   * @throws An error if the database query fails.
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
