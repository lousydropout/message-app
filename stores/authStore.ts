/**
 * @fileoverview Authentication Store (Zustand) - Manages the global authentication state.
 *
 * This Zustand store is the single source of truth for the user's authentication
 * status, Firebase user object, and detailed user profile. It provides actions
 * for signing up, signing in, and logging out, and it orchestrates the necessary
 * operations across different services (auth, user, presence).
 *
 * The store's `initialize` method sets up a listener to Firebase's `onAuthStateChanged`
 * event, ensuring that the application's state is always in sync with the user's
 * authentication status at Firebase. It also manages a logout callback mechanism
 * to allow other parts of the application to perform cleanup tasks before the
 * user is fully logged out.
 *
 * @see authService for the underlying Firebase authentication operations.
 * @see userService for fetching and creating user profiles.
 * @see presenceService for managing the user's online status.
 */

/**
 * @fileoverview Authentication Store - Manages user authentication state
 *
 * This store handles:
 * - User sign up, sign in, and logout
 * - Firebase auth state synchronization
 * - User profile management
 * - Presence/online status initialization
 * - Logout cleanup callbacks
 *
 * Uses Firebase Authentication for auth and integrates with userService
 * for profile management and presenceService for online status.
 */

import { auth } from "@/config/firebase";
import authService from "@/services/authService";
import presenceService from "@/services/presenceService";
import userService from "@/services/userService";
import { logger } from "@/stores/loggerStore";
import { User as UserProfile } from "@/types/User";
import { User, onAuthStateChanged } from "firebase/auth";
import { create } from "zustand";

/**
 * Authentication store state interface
 */
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
  createProfile: (profileData: Partial<UserProfile>) => Promise<void>;
  initialize: () => () => void;
  setLogoutCallback: (callback: () => void) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userProfile: null,
  loading: true,
  logoutCallback: null,

  /**
   * Signs up a new user, creates their profile, and initializes their session.
   *
   * This action coordinates several steps:
   * 1. Calls `authService.signUp` to create the Firebase user.
   * 2. Calls `userService.createUserProfile` to create the user's profile document in Firestore.
   * 3. Fetches the newly created profile and updates the store's state.
   *
   * @param email The user's email address.
   * @param password The user's password.
   * @param displayName The user's chosen display name.
   * @returns A promise that resolves to the Firebase `User` object.
   * @throws An error if the sign-up or profile creation fails.
   */
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

  /**
   * Signs in an existing user and sets up their session.
   *
   * This action handles the following:
   * 1. Calls `authService.signIn` to authenticate the user.
   * 2. Fetches the user's profile, creating one if it doesn't exist (for legacy users).
   * 3. Sets the user's online status and starts the presence heartbeat.
   * 4. Updates the store's state with the authenticated user and profile.
   *
   * @param email The user's email address.
   * @param password The user's password.
   * @returns A promise that resolves to the Firebase `User` object.
   * @throws An error if the sign-in fails.
   */
  async signIn(email: string, password: string) {
    set({ loading: true });
    try {
      logger.info("auth", "Starting user sign in", { email });
      const authResult = await authService.signIn(email, password);
      logger.info(
        "auth",
        "AuthStore: authService.signIn completed successfully"
      );

      // Check if user profile exists, create if not (handles legacy users)
      let userProfile = await userService.getUserProfile(authResult.user.uid);

      if (!userProfile) {
        // Profile doesn't exist, create it
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

      // Set online status and start presence heartbeat (30-second intervals)
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

  /**
   * Logs out the current user and cleans up their session.
   *
   * This is a critical cleanup operation that:
   * 1. Sets the user's online status to offline and stops the presence heartbeat.
   * 2. Executes a registered logout callback (used by other stores to clear their state).
   * 3. Calls `authService.signOut` to end the Firebase session.
   * 4. Clears the user and profile from the store's state.
   *
   * @returns A promise that resolves when the logout is complete.
   * @throws An error if any step of the logout process fails.
   */
  async logout() {
    set({ loading: true });
    try {
      const currentUser = get().user;
      logger.info("auth", "Starting user logout", { userId: currentUser?.uid });

      // Set offline status and stop presence heartbeat
      if (currentUser) {
        await presenceService.setOnlineStatus(currentUser.uid, false);
        presenceService.stopHeartbeat();
      }

      // Friend requests are cleared via root layout subscription cleanup

      // Clear messages store data before logout (via registered callback)
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

  /**
   * Updates the current user's profile in Firestore and in the local state.
   *
   * @param updates A partial `UserProfile` object with the fields to be updated.
   * @returns A promise that resolves when the profile is successfully updated.
   * @throws An error if the user is not authenticated.
   */
  async updateProfile(updates: Partial<UserProfile>) {
    const { user, userProfile } = get();
    if (!user || !userProfile) throw new Error("User not authenticated");
    await userService.updateUserProfile(user.uid, updates);
    set({ userProfile: { ...userProfile, ...updates } });
  },

  /**
   * Creates a profile for the currently authenticated user.
   *
   * This is primarily for scenarios where a user might exist in Firebase Auth
   * but not have a corresponding profile document in Firestore (e.g., legacy users).
   *
   * @param profileData The initial data for the user's profile.
   * @returns A promise that resolves when the profile is created and the local state is updated.
   * @throws An error if the user is not authenticated.
   */
  async createProfile(profileData: Partial<UserProfile>) {
    const { user } = get();
    if (!user) throw new Error("User not authenticated");
    await userService.createUserProfile(user.uid, profileData);
    const newProfile = await userService.getUserProfile(user.uid);
    set({ userProfile: newProfile });
  },

  /**
   * Registers a callback function to be executed during the logout process.
   *
   * This allows other parts of the application (e.g., other stores) to perform
   * necessary cleanup, such as clearing cached data or unsubscribing from
   * real-time listeners, before the user's session is terminated.
   *
   * @param callback The function to be called on logout.
   */
  setLogoutCallback(callback: () => void) {
    set({ logoutCallback: callback });
  },

  /**
   * Initializes the authentication state by listening to Firebase's `onAuthStateChanged`.
   *
   * This is the entry point for the store's lifecycle. It sets up a real-time
   * listener that keeps the store's state synchronized with the user's
   * authentication status in Firebase.
   *
   * @returns An `unsubscribe` function to clean up the listener.
   */
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
