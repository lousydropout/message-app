/**
 * @fileoverview Firebase Configuration and Initialization.
 *
 * This file is responsible for initializing the connection to the Firebase
 * project. It reads the necessary configuration credentials from environment
 * variables and sets up the core Firebase services, including Authentication
 * and Firestore.
 *
 * For Firebase Authentication, it is configured to use React Native's
 * AsyncStorage for persistence, which allows the user's session to be
 * maintained across app launches. This is a critical part of providing a
 * seamless user experience.
 *
 * The file also includes a workaround to suppress benign "BloomFilter" warnings
 * that can appear in development builds, keeping the console output clean and
 * focused on more critical issues.
 *
 * @see authService for the implementation of authentication logic.
 * @see conversationService, messageService, etc., for how the Firestore `db`
 *      instance is used.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
// @ts-ignore
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { enableNetwork, getFirestore } from "firebase/firestore";
// Suppress BloomFilter warnings in development
if (__DEV__) {
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    if (
      args[0]?.includes?.("BloomFilter") ||
      args[0]?.includes?.("@firebase/firestore")
    ) {
      return; // Suppress BloomFilter warnings
    }
    originalConsoleWarn.apply(console, args);
  };
}

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY as string,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
  databaseURL: process.env.EXPO_PUBLIC_DATABASE_URL as string,
  projectId: process.env.FIREBASE_PROJECT_ID as string,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: process.env
    .EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string,
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

// Configure Firestore settings to reduce warnings
if (__DEV__) {
  // Enable offline persistence
  // Keep network enabled for real-time features
  enableNetwork(db);
}

export default app;
