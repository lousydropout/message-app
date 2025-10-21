import { Timestamp } from "firebase/firestore";

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatar?: string;
  languagePreferences: SupportedLanguageCode[];
  aiSettings: {
    autoTranslate: boolean;
    culturalHints: boolean;
    formalityAdjustment: boolean;
  };
  blockedUsers: string[]; // Array of user IDs
  createdAt: Timestamp;
  lastSeen: Timestamp;
}

// Common languages for the International Communicator persona
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
