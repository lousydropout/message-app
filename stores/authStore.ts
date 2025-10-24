import { auth } from "@/config/firebase";
import authService from "@/services/authService";
import presenceService from "@/services/presenceService";
import userService from "@/services/userService";
import { logger } from "@/stores/loggerStore";
import { User as UserProfile } from "@/types/User";
import { User, onAuthStateChanged } from "firebase/auth";
import { create } from "zustand";

export interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logoutCallback: (() => void) | null;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  initialize: () => () => void;
  setLogoutCallback: (callback: () => void) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userProfile: null,
  loading: true,
  logoutCallback: null,

  async signUp(email: string, password: string, displayName: string) {
    set({ loading: true });
    try {
      logger.info("auth", "Starting user sign up", { email, displayName });
      const authResult = await authService.signUp(email, password, displayName);

      // Create user profile
      await userService.createUserProfile(authResult.user.uid, {
        email: authResult.email,
        displayName: authResult.displayName,
      });

      // Fetch the created profile
      const userProfile = await userService.getUserProfile(authResult.user.uid);

      logger.info("auth", "User sign up successful", {
        userId: authResult.user.uid,
        email: authResult.email,
        displayName: authResult.displayName,
      });
      set({ user: authResult.user, userProfile, loading: false });
      return authResult.user;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorCode = (error as any)?.code || "unknown";
      logger.error("auth", "User sign up failed", {
        email,
        error: errorMessage,
        errorCode,
      });
      set({ loading: false });
      throw error;
    }
  },

  async signIn(email: string, password: string) {
    set({ loading: true });
    try {
      logger.info("auth", "Starting user sign in", { email });
      const authResult = await authService.signIn(email, password);
      logger.info(
        "auth",
        "AuthStore: authService.signIn completed successfully"
      );

      // Check if user profile exists, create if not
      let userProfile = await userService.getUserProfile(authResult.user.uid);

      if (!userProfile) {
        await userService.createUserProfile(authResult.user.uid, {
          email: authResult.email,
          displayName: authResult.displayName,
        });
        userProfile = await userService.getUserProfile(authResult.user.uid);
      }

      logger.info("auth", "User sign in successful", {
        userId: authResult.user.uid,
        email: authResult.email,
      });

      // Set online status and start heartbeat
      await presenceService.setOnlineStatus(authResult.user.uid, true);
      presenceService.startHeartbeat(authResult.user.uid);

      // Friend requests are now loaded via real-time subscriptions in root layout

      set({ user: authResult.user, userProfile, loading: false });
      return authResult.user;
    } catch (error) {
      logger.info("auth", "AuthStore: ERROR CAUGHT in signIn!");
      set({ loading: false });
      logger.info("auth", "AuthStore: Re-throwing error...");
      throw error;
    }
  },

  async logout() {
    set({ loading: true });
    try {
      const currentUser = get().user;
      logger.info("auth", "Starting user logout", { userId: currentUser?.uid });

      // Set offline status and stop heartbeat
      if (currentUser) {
        await presenceService.setOnlineStatus(currentUser.uid, false);
        presenceService.stopHeartbeat();
      }

      // Friend requests are cleared via root layout subscription cleanup

      // Clear messages store data before logout
      const { logoutCallback } = get();
      if (logoutCallback) {
        logoutCallback();
      }

      await authService.signOut();
      logger.info("auth", "User logout successful", {
        userId: currentUser?.uid,
      });
      set({ user: null, userProfile: null, loading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("auth", "User logout failed", { error: errorMessage });
      set({ loading: false });
      throw error;
    }
  },

  async updateProfile(updates: Partial<UserProfile>) {
    const { user, userProfile } = get();
    if (!user || !userProfile) throw new Error("User not authenticated");
    await userService.updateUserProfile(user.uid, updates);
    set({ userProfile: { ...userProfile, ...updates } });
  },

  setLogoutCallback(callback: () => void) {
    set({ logoutCallback: callback });
  },

  initialize() {
    set({ loading: true });
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const profile = await userService.getUserProfile(user.uid);
          set({ user, userProfile: profile, loading: false });
        } catch {
          set({ user, userProfile: null, loading: false });
        }
      } else {
        set({ user: null, userProfile: null, loading: false });
      }
    });
    return unsubscribe;
  },
}));
