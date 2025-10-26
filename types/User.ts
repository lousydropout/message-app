/**
 * @fileoverview Type definitions for the User data model.
 *
 * This file contains the TypeScript interface for the `User` object, which is
 * the central data model for a user's profile. This interface is used
 * consistently across Firestore, the local SQLite cache, and the application's
 * state to ensure data integrity.
 *
 * The `User` interface includes not only basic profile information but also
 * application-specific settings like `languagePreferences` and `aiSettings`.
 * It also contains fields for managing the user's social graph (`blockedUsers`)
 * and real-time presence (`online`, `heartbeat`, `lastSeen`).
 *
 * The file also defines the list of `SUPPORTED_LANGUAGES`, which is crucial
 * for the application's AI-powered translation and cultural context features.
 *
 * @see userService for the service that manages user profiles.
 * @see UserRepository for the local database implementation for user data.
 */

import { Timestamp } from "firebase/firestore";

/**
 * User profile interface
 *
 * Represents a user's profile stored in Firestore with authentication,
 * preferences, and presence information.
 */
export interface User {
  /** Unique user ID (matches Firebase Auth UID) */
  id: string;
  /** User's email address */
  email: string;
  /** User's display name */
  displayName: string;
  /** Optional avatar URL */
  avatar?: string;
  /** Array of language codes the user can communicate in */
  languagePreferences: SupportedLanguageCode[];
  /** AI-powered communication features settings */
  aiSettings: {
    /** Automatically translate messages */
    autoTranslate: boolean;
    /** Show cultural context hints */
    culturalHints: boolean;
    /** Adjust formality level based on context */
    formalityAdjustment: boolean;
  };
  /** Array of user IDs that this user has blocked */
  blockedUsers: string[];
  /** Timestamp when user account was created */
  createdAt: Timestamp;
  /** Timestamp when user was last seen */
  lastSeen: Timestamp;
  /** Whether user is currently online */
  online: boolean;
  /** Timestamp of last heartbeat (for presence tracking) */
  heartbeat: Timestamp;
}

/**
 * Supported languages for the International Communicator persona
 * Used for translation and cultural context features
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "it", name: "Italian" },
] as const;

export type SupportedLanguageCode =
  (typeof SUPPORTED_LANGUAGES)[number]["code"];
