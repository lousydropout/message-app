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

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /**
   * Create a new user profile in Firestore
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
   * Update user profile in Firestore
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
   * Get user profile from Firestore
   */
  async getUserProfile(userId: string): Promise<User | null> {
    try {
      // Check local cache first
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
   * Update language preferences
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
   * Update AI settings
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
   * Add user to blocked list
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
   * Remove user from blocked list
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
   * Check if user is blocked
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
   * Search users by email or display name
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
   * Get multiple users by their IDs
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
   * Get heartbeat time difference in seconds
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
   * Check if a user is currently online based on heartbeat
   * Uses 40-second timeout as per presence system design
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
   * Get formatted online status text for a user
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
   * Get online status with styling information
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
   * Subscribe to real-time updates for multiple users
   * Handles batching for Firestore's 30-item limit on 'in' queries
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
