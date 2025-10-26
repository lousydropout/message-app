/**
 * @fileoverview Authentication Service - Handles user authentication via Firebase.
 *
 * This service provides a centralized interface for all Firebase Authentication
 * operations, including email/password sign-up, sign-in, and sign-out. It is
 * designed to be a thin wrapper around the Firebase SDK, abstracting the core
 * authentication logic from the UI and state management layers.
 *
 * @see /docs/authentication.md for a detailed explanation of the auth flow.
 * @see authStore for how this service is used in the application's state.
 */

/**
 * @fileoverview Authentication Service - Email/Password Authentication
 *
 * Provides Firebase authentication functionality for email/password sign up and sign in.
 * Handles user registration, login, and logout operations.
 *
 * Integration with other services:
 * - Used by authStore for authentication state management
 * - User profiles are created separately via userService
 *
 * @notes
 * This service is responsible *only* for authentication, not for managing user
 * profile data in Firestore. After a successful sign-up, the `authStore` is
 * responsible for calling `userService.createUserProfile` to create the
 * corresponding user document in the database. This separation of concerns
 * keeps the authentication logic clean and focused.
 */

import { auth } from "@/config/firebase";
import {
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from "firebase/auth";

/**
 * Result returned after successful authentication
 */
export interface AuthResult {
  user: User;
  email: string;
  displayName: string;
}

const authService = {
  /**
   * Sign up a new user with email and password
   *
   * Creates a Firebase auth account and sets the user's display name.
   * After the user is created, a separate call to `userService.createUserProfile`
   * is required to create the user's profile document in Firestore.
   *
   * @param email - User's email address
   * @param password - User's password (must be at least 6 characters).
   * @param displayName - User's display name.
   * @returns A promise that resolves to an AuthResult object upon successful sign-up.
   * @throws Throws a Firebase error if sign-up fails (e.g., email already in use, weak password).
   *
   * @note Error handling is deferred to the calling layer (e.g., UI component
   * or authStore) to provide appropriate user feedback. This service does not
   * log Firebase errors directly.
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
   * Sign in an existing user with email and password
   *
   * Authenticates the user with Firebase and returns their information.
   * Falls back to extracting display name from email if no display name is set.
   *
   * @param email - User's email address
   * @param password - User's password
   * @returns A promise that resolves to an AuthResult object upon successful sign-in.
   * @throws Throws a Firebase error if sign-in fails (e.g., wrong password, user not found).
   *
   * @note Similar to signUp, error handling is managed by the caller.
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
   * Sign out the current user
   *
   * Logs out the authenticated user from Firebase. This triggers the
   * `onAuthStateChanged` listener, which will clear the user state in `authStore`.
   *
   * @returns A promise that resolves when sign-out is complete.
   * @throws Throws an error if the sign-out operation fails.
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
