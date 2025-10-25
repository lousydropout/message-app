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
  apiKey: "AIzaSyBkKKPJFb-I-A_0HLizXRiWoG0ULpi1b80",
  authDomain: "messageai2.firebaseapp.com",
  databaseURL: "https://messageai2-default-rtdb.firebaseio.com",
  projectId: "messageai2",
  storageBucket: "messageai2.firebasestorage.app",
  messagingSenderId: "799591897749",
  appId: "1:799591897749:web:5f485911d1f8988915599c",
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
