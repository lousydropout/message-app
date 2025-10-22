import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
// @ts-ignore
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  // measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

// Configure Firestore settings to reduce warnings
if (__DEV__) {
  // Enable offline persistence
  import("firebase/firestore").then(({ enableNetwork, disableNetwork }) => {
    // Keep network enabled for real-time features
    enableNetwork(db);
  });
}

export default app;
