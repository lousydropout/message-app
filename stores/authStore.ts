import { auth } from "@/config/firebase";
import {
  User,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import { create } from "zustand";

export interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<User>;
  logout: () => Promise<void>;
  initialize: () => () => void; // returns unsubscribe
}

/**
 * Explicit-init auth store.
 * Nothing subscribes automatically; call initialize() once at app startup.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  /** Anonymous sign-in (for demo or guest mode). */
  async signIn() {
    set({ loading: true });
    try {
      const userCredential = await signInAnonymously(auth);
      // Optimistically set user so UI updates immediately
      set({ user: userCredential.user });
      return userCredential.user;
    } catch (error) {
      console.error("Sign-in error:", error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  /** Logout and clear local state. */
  async logout() {
    set({ loading: true });
    try {
      await signOut(auth);
      set({ user: null });
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  /** Start the Firebase auth listener manually. */
  initialize() {
    set({ loading: true });
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        set({ user, loading: false });
      },
      (error) => {
        console.error("Auth state listener error:", error);
        set({ loading: false });
      }
    );
    return unsubscribe; // caller can clean up if needed
  },
}));
