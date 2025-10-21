import { db } from "@/config/firebase";
import { User } from "@/types/User";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
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
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        return userSnap.data() as User;
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
    languages: string[]
  ): Promise<void> {
    try {
      await this.updateUserProfile(userId, { languagePreferences: languages });
    } catch (error) {
      console.error("Error updating language preferences:", error);
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
      console.error("Error updating AI settings:", error);
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
      console.error("Error checking if user is blocked:", error);
      return false;
    }
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(userId: string): Promise<void> {
    try {
      await this.updateUserProfile(userId, {});
    } catch (error) {
      console.error("Error updating last seen:", error);
      // Don't throw error for last seen updates as they're not critical
    }
  }
}

export default UserService.getInstance();
