import { auth } from "@/config/firebase";
import authService from "@/services/authService";
import userService from "@/services/userService";
import { User as UserProfile } from "@/types/User";
import { User, onAuthStateChanged } from "firebase/auth";
import { create } from "zustand";

export interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userProfile: null,
  loading: true,

  async signUp(email: string, password: string, displayName: string) {
    set({ loading: true });
    try {
      const authResult = await authService.signUp(email, password, displayName);

      // Create user profile
      await userService.createUserProfile(authResult.user.uid, {
        email: authResult.email,
        displayName: authResult.displayName,
      });

      // Fetch the created profile
      const userProfile = await userService.getUserProfile(authResult.user.uid);

      set({ user: authResult.user, userProfile, loading: false });
      return authResult.user;
    } catch (error) {
      console.error("Sign up error:", error);
      set({ loading: false });
      throw error;
    }
  },

  async signIn(email: string, password: string) {
    set({ loading: true });
    try {
      const authResult = await authService.signIn(email, password);

      // Check if user profile exists, create if not
      let userProfile = await userService.getUserProfile(authResult.user.uid);

      if (!userProfile) {
        await userService.createUserProfile(authResult.user.uid, {
          email: authResult.email,
          displayName: authResult.displayName,
        });
        userProfile = await userService.getUserProfile(authResult.user.uid);
      }

      set({ user: authResult.user, userProfile, loading: false });
      return authResult.user;
    } catch (error) {
      console.error("Sign in error:", error);
      set({ loading: false });
      throw error;
    }
  },

  async logout() {
    set({ loading: true });
    try {
      await authService.signOut();
      set({ user: null, userProfile: null, loading: false });
    } catch (error) {
      console.error("Logout error:", error);
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
