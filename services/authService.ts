// services/authService.ts - Email/Password Authentication
import { auth } from "@/config/firebase";
import {
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from "firebase/auth";

export interface AuthResult {
  user: User;
  email: string;
  displayName: string;
}

const authService = {
  /**
   * Sign up with email and password
   */
  async signUp(
    email: string,
    password: string,
    displayName: string
  ): Promise<AuthResult> {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Update the user's display name
      await updateProfile(userCredential.user, {
        displayName: displayName,
      });

      return {
        user: userCredential.user,
        email: userCredential.user.email || email,
        displayName: displayName,
      };
    } catch (error) {
      // Re-throw the error so it can be handled by the calling component
      // Don't log raw Firebase errors here - they'll be handled in the UI layer
      throw error;
    }
  },

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      return {
        user: userCredential.user,
        email: userCredential.user.email || email,
        displayName: userCredential.user.displayName || email.split("@")[0],
      };
    } catch (error) {
      // Re-throw the error so it can be handled by the calling component
      // Don't log raw Firebase errors here - they'll be handled in the UI layer
      throw error;
    }
  },

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  },
};

export default authService;
