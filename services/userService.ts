/**
 * @fileoverview User Service - Manages user profile data in Firestore and the local cache.
 *
 * This service provides a comprehensive interface for all operations related to
 * user profiles. It handles the creation, updating, and retrieval of user data,
 * as well as more specialized features like user search, blocking, and real-time
 * presence tracking. It employs a "SQLite-first" caching strategy to ensure a
 * fast and responsive user experience, falling back to Firestore only when
 * necessary.
 *
 * Key Features:
 * - **CRUD Operations**: Manages the lifecycle of user profile documents in Firestore.
 * - **SQLite Caching**: Caches user profiles locally for offline access and performance.
 * - **Batched Subscriptions**: Efficiently subscribes to real-time updates for multiple
 *   users by batching queries to respect Firestore's limitations.
 * - **Presence Management**: Includes logic to determine and format a user's online
 *   status based on their heartbeat.
 *
 * @see usersStore for how this service is used to manage user data in the app's state.
 * @see presenceService for the underlying heartbeat mechanism.
 */

/**
 * @fileoverview User Service - Manages user profiles in Firestore
 *
 * This service handles:
 * - User profile CRUD operations
 * - Language preferences and AI settings
 * - User blocking/unblocking
 * - User search functionality
 * - Online status detection and formatting
 * - Real-time user subscriptions (batched for efficiency)
 * - SQLite caching for offline access
 *
 * Key features:
 * - Singleton pattern for consistency
 * - SQLite-first loading for instant display
 * - Batch subscriptions (Firestore 30-item limit handling)
 * - Online status based on heartbeat (40-second timeout)
 */

import { db } from "@/config/firebase";
import sqliteService from "@/services/sqliteService";
import { SupportedLanguageCode, User } from "@/types/User";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from "firebase/firestore";

export class UserService {
  private static instance: UserService;

  /**
   * Get singleton instance of UserService
   */
  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /**
   * Creates a new user profile document in Firestore.
   *
   * This is typically called after a new user signs up. It initializes the
   * user's profile with default settings and timestamps.
   *
   * @param userId The ID of the user (should match their Firebase Auth UID).
   * @param profileData Partial data for the new profile, usually including email and displayName.
   * @returns A promise that resolves when the profile is successfully created.
   * @throws An error if the Firestore operation fails.
   */
  async createUserProfile(
    userId: string,
    profileData: Partial<User>
  ): Promise<void> {
    try {
      const userRef = doc(db, "users", userId);
      const now = serverTimestamp();

      const userProfile: any = {
        id: userId,
        email: profileData.email || "",
        displayName: profileData.displayName || "",
        languagePreferences: profileData.languagePreferences || ["en"],
        aiSettings: {
          autoTranslate: profileData.aiSettings?.autoTranslate ?? true,
          culturalHints: profileData.aiSettings?.culturalHints ?? true,
          formalityAdjustment:
            profileData.aiSettings?.formalityAdjustment ?? true,
        },
        blockedUsers: profileData.blockedUsers || [],
        createdAt: now as Timestamp,
        lastSeen: now as Timestamp,
        online: false,
        heartbeat: now as Timestamp,
      };

      // Only add avatar if it's provided
      if (profileData.avatar) {
        userProfile.avatar = profileData.avatar;
      }

      await setDoc(userRef, userProfile);
    } catch (error) {
      console.error("Error creating user profile:", error);
      throw error;
    }
  }

  /**
   * Updates an existing user profile in Firestore.
   *
   * @param userId The ID of the user whose profile is to be updated.
   * @param updates An object containing the fields to update.
   * @returns A promise that resolves when the profile is successfully updated.
   * @throws An error if the Firestore operation fails.
   */
  async updateUserProfile(
    userId: string,
    updates: Partial<User>
  ): Promise<void> {
    try {
      const userRef = doc(db, "users", userId);
      const updateData = {
        ...updates,
        lastSeen: serverTimestamp(),
      };

      await updateDoc(userRef, updateData);
    } catch (error) {
      console.error("Error updating user profile:", error);
      throw error;
    }
  }

  /**
   * Retrieves a user profile, prioritizing the local cache for performance.
   *
   * This method implements a "SQLite-first" approach. It first attempts to
   * load the user profile from the local SQLite cache for an instant response.
   * If the profile is not found in the cache, it falls back to fetching it
   * from Firestore and then saves the fetched profile to the local cache for
   * future requests.
   *
   * @param userId The ID of the user to retrieve.
   * @returns A promise that resolves to the `User` object, or `null` if not found.
   * @throws An error if the retrieval operation fails.
   */
  async getUserProfile(userId: string): Promise<User | null> {
    try {
      // Check local cache first for instant loading
      const localProfile = await sqliteService.getUserProfile(userId);
      if (localProfile) {
        return localProfile;
      }

      // Fallback to Firestore if online
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const profile = userSnap.data() as User;
        // Cache locally for future use
        await sqliteService.saveUserProfile(profile);
        return profile;
      }
      return null;
    } catch (error) {
      console.error("Error getting user profile:", error);
      throw error;
    }
  }

  /**
   * Updates a user's language preferences.
   *
   * @param userId The ID of the user.
   * @param languages An array of `SupportedLanguageCode`s.
   * @returns A promise that resolves when the preferences are updated.
   * @throws An error if the update fails.
   */
  async updateLanguagePreferences(
    userId: string,
    languages: SupportedLanguageCode[]
  ): Promise<void> {
    try {
      await this.updateUserProfile(userId, { languagePreferences: languages });
    } catch (error) {
      console.debug("Error updating language preferences:", error);
      throw error;
    }
  }

  /**
   * Updates a user's AI-related settings.
   *
   * This method fetches the current settings first to ensure that only the
   * specified settings are changed, preserving the existing ones.
   *
   * @param userId The ID of the user.
   * @param settings A partial object of AI settings to update.
   * @returns A promise that resolves when the settings are updated.
   * @throws An error if the user profile is not found or the update fails.
   */
  async updateAISettings(
    userId: string,
    settings: Partial<User["aiSettings"]>
  ): Promise<void> {
    try {
      const userProfile = await this.getUserProfile(userId);
      if (!userProfile) {
        throw new Error("User profile not found");
      }

      const updatedSettings = {
        ...userProfile.aiSettings,
        ...settings,
      };

      await this.updateUserProfile(userId, { aiSettings: updatedSettings });
    } catch (error) {
      console.debug("Error updating AI settings:", error);
      throw error;
    }
  }

  /**
   * Adds a user to the current user's blocked list.
   *
   * @param userId The ID of the user performing the block.
   * @param blockedUserId The ID of the user to block.
   * @returns A promise that resolves when the user is successfully blocked.
   * @throws An error if the user profile is not found or the update fails.
   */
  async blockUser(userId: string, blockedUserId: string): Promise<void> {
    try {
      const userProfile = await this.getUserProfile(userId);
      if (!userProfile) {
        throw new Error("User profile not found");
      }

      const blockedUsers = [...userProfile.blockedUsers];
      if (!blockedUsers.includes(blockedUserId)) {
        blockedUsers.push(blockedUserId);
        await this.updateUserProfile(userId, { blockedUsers });
      }
    } catch (error) {
      console.error("Error blocking user:", error);
      throw error;
    }
  }

  /**
   * Removes a user from the current user's blocked list.
   *
   * @param userId The ID of the user performing the unblock.
   * @param blockedUserId The ID of the user to unblock.
   * @returns A promise that resolves when the user is successfully unblocked.
   * @throws An error if the user profile is not found or the update fails.
   */
  async unblockUser(userId: string, blockedUserId: string): Promise<void> {
    try {
      const userProfile = await this.getUserProfile(userId);
      if (!userProfile) {
        throw new Error("User profile not found");
      }

      const blockedUsers = userProfile.blockedUsers.filter(
        (id) => id !== blockedUserId
      );
      await this.updateUserProfile(userId, { blockedUsers });
    } catch (error) {
      console.error("Error unblocking user:", error);
      throw error;
    }
  }

  /**
   * Checks if a target user is in the current user's blocked list.
   *
   * @param userId The ID of the user whose block list is being checked.
   * @param targetUserId The ID of the user to check for.
   * @returns A promise that resolves to `true` if the target user is blocked, `false` otherwise.
   */
  async isUserBlocked(userId: string, targetUserId: string): Promise<boolean> {
    try {
      const userProfile = await this.getUserProfile(userId);
      if (!userProfile) {
        return false;
      }
      return userProfile.blockedUsers.includes(targetUserId);
    } catch (error) {
      console.debug("Error checking if user is blocked:", error);
      return false;
    }
  }

  /**
   * Searches for users by their email or display name.
   *
   * This method performs two parallel prefix-based queries against Firestore
   * and merges the results, removing duplicates and the current user.
   *
   * @param searchQuery The search term.
   * @param currentUserId The ID of the user performing the search, to exclude them from the results.
   * @returns A promise that resolves to an array of matching `User` objects.
   * @throws An error if the search operation fails.
   */
  async searchUsers(
    searchQuery: string,
    currentUserId: string
  ): Promise<User[]> {
    try {
      if (!searchQuery.trim()) {
        return [];
      }

      const searchTerm = searchQuery.toLowerCase().trim();

      // Search by email
      const emailQuery = query(
        collection(db, "users"),
        where("email", ">=", searchTerm),
        where("email", "<=", searchTerm + "\uf8ff")
      );

      // Search by display name
      const nameQuery = query(
        collection(db, "users"),
        where("displayName", ">=", searchTerm),
        where("displayName", "<=", searchTerm + "\uf8ff")
      );

      const [emailSnapshot, nameSnapshot] = await Promise.all([
        getDocs(emailQuery),
        getDocs(nameQuery),
      ]);

      const emailResults = emailSnapshot.docs.map((doc) => doc.data() as User);
      const nameResults = nameSnapshot.docs.map((doc) => doc.data() as User);

      // Combine and deduplicate results
      const allResults = [...emailResults, ...nameResults];
      const uniqueResults = allResults.filter(
        (user, index, self) =>
          index === self.findIndex((u) => u.id === user.id) &&
          user.id !== currentUserId
      );

      return uniqueResults.slice(0, 10);
    } catch (error) {
      console.error("Error searching users:", error);
      throw error;
    }
  }

  /**
   * Retrieves multiple user profiles by their IDs, using the local cache where possible.
   *
   * This method first attempts to fetch the requested profiles from the SQLite
   * cache. For any profiles not found in the cache, it fetches them from
   * Firestore in a single batch query and then caches them for future use.
   *
   * @param userIds An array of user IDs to retrieve.
   * @returns A promise that resolves to an array of `User` objects.
   * @throws An error if the retrieval operation fails.
   */
  async getUsersByIds(userIds: string[]): Promise<User[]> {
    try {
      if (userIds.length === 0) {
        return [];
      }

      // Check local cache first
      const localProfiles = await sqliteService.getUserProfiles(userIds);
      const cachedIds = new Set(localProfiles.map((p) => p.id));
      const missingIds = userIds.filter((id) => !cachedIds.has(id));

      let allProfiles = [...localProfiles];

      // Fetch missing profiles from Firestore
      if (missingIds.length > 0) {
        const usersQuery = query(
          collection(db, "users"),
          where("id", "in", missingIds)
        );

        const querySnapshot = await getDocs(usersQuery);
        const firestoreProfiles = querySnapshot.docs.map(
          (doc) => doc.data() as User
        );

        // Cache the new profiles
        for (const profile of firestoreProfiles) {
          await sqliteService.saveUserProfile(profile);
        }

        allProfiles = [...allProfiles, ...firestoreProfiles];
      }

      return allProfiles;
    } catch (error) {
      console.error("Error getting users by IDs:", error);
      throw error;
    }
  }

  /**
   * Calculates the time difference in seconds since the user's last heartbeat.
   *
   * @param user The `User` object.
   * @returns The time difference in seconds, or `null` if the heartbeat is not set.
   * @private
   */
  private getHeartbeatTimeDiff(user: User): number | null {
    if (!user.heartbeat) {
      return null;
    }

    const now = new Date();
    const heartbeatTime = user.heartbeat.toDate
      ? user.heartbeat.toDate()
      : new Date(user.heartbeat.seconds * 1000);
    const timeDiffMs = now.getTime() - heartbeatTime.getTime();
    return timeDiffMs / 1000;
  }

  /**
   * Determines if a user is currently online based on their `online` flag and `heartbeat`.
   *
   * A user is considered online if their `online` flag is true and their last
   * heartbeat was within the last 40 seconds.
   *
   * @param user The `User` object.
   * @returns `true` if the user is online, `false` otherwise.
   */
  isUserOnline(user: User): boolean {
    if (!user.online) {
      return false;
    }

    const timeDiffSeconds = this.getHeartbeatTimeDiff(user);
    if (timeDiffSeconds === null) {
      return false;
    }

    // User is online if heartbeat is within last 40 seconds
    return timeDiffSeconds <= 40;
  }

  /**
   * Generates a user-friendly string describing the user's online status.
   *
   * Examples: "online", "Last seen 5m ago", "Last seen 2h ago".
   *
   * @param user The `User` object.
   * @returns A formatted string of the user's online status.
   */
  getOnlineStatusText(user: User): string {
    if (this.isUserOnline(user)) {
      return "online";
    }

    // Show "Last seen X ago" for offline users
    const timeDiffSeconds = this.getHeartbeatTimeDiff(user);
    if (timeDiffSeconds === null) {
      return "offline";
    }

    const timeDiffMinutes = Math.floor(timeDiffSeconds / 60);
    const timeDiffHours = Math.floor(timeDiffMinutes / 60);
    const timeDiffDays = Math.floor(timeDiffHours / 24);

    if (timeDiffMinutes < 40) {
      return "online";
    } else if (timeDiffMinutes < 60) {
      return `Last seen ${timeDiffMinutes}m ago`;
    } else if (timeDiffHours < 24) {
      return `Last seen ${timeDiffHours}h ago`;
    } else {
      return `Last seen ${timeDiffDays}d ago`;
    }
  }

  /**
   * Provides a full set of information for displaying a user's online status,
   * including the text, color, and font weight.
   *
   * @param user The `User` object.
   * @returns An object with styling information for the user's online status.
   */
  getOnlineStatusInfo(user: User): {
    isOnline: boolean;
    text: string;
    color: string;
    fontWeight: string;
  } {
    const isOnline = this.isUserOnline(user);
    const text = this.getOnlineStatusText(user);

    return {
      isOnline,
      text,
      color: isOnline ? "#2E7D32" : "#9E9E9E",
      fontWeight: isOnline ? "600" : "400",
    };
  }

  /**
   * Subscribes to real-time updates for multiple user profiles.
   *
   * This method is designed to handle Firestore's limitation of 30 items in an
   * 'in' query by automatically splitting the list of user IDs into smaller
   * batches and creating a separate subscription for each. It also updates the
   * local SQLite cache with any changes received from the subscriptions.
   *
   * @param userIds An array of user IDs to subscribe to.
   * @param callback A function to be called with the updated array of `User` objects.
   * @returns An `Unsubscribe` function that can be called to stop all batch subscriptions.
   */
  subscribeToUsers(
    userIds: string[],
    callback: (users: User[]) => void
  ): Unsubscribe {
    if (userIds.length === 0) {
      // Return a no-op unsubscribe function
      return () => {};
    }

    const BATCH_SIZE = 30; // Firestore limit for 'in' queries
    const batches: string[][] = [];

    // Split userIds into batches of 30
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      batches.push(userIds.slice(i, i + BATCH_SIZE));
    }

    const unsubscribes: Unsubscribe[] = [];

    // Create a subscription for each batch
    batches.forEach((batch) => {
      const usersQuery = query(
        collection(db, "users"),
        where("id", "in", batch)
      );

      const unsubscribe = onSnapshot(
        usersQuery,
        async (snapshot) => {
          const users: User[] = [];

          snapshot.forEach((doc) => {
            const userData = doc.data() as User;
            users.push(userData);
          });

          // Update SQLite cache for all users in this batch
          for (const user of users) {
            try {
              await sqliteService.saveUserProfile(user);
            } catch (error) {
              console.error("Error updating user profile in SQLite:", error);
            }
          }

          // Call the callback with all users from all batches
          // We need to collect users from all batches, so we'll trigger a full refresh
          if (users.length > 0) {
            // Get all currently subscribed users from SQLite
            try {
              const allSubscribedUsers = await sqliteService.getUserProfiles(
                userIds
              );
              callback(allSubscribedUsers);
            } catch (error) {
              console.error(
                "Error getting subscribed users from SQLite:",
                error
              );
              callback(users); // Fallback to just the current batch
            }
          }
        },
        (error) => {
          console.error("Error subscribing to users:", error);
        }
      );

      unsubscribes.push(unsubscribe);
    });

    // Return a function that unsubscribes from all batches
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }
}

export default UserService.getInstance();
