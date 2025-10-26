/**
 * @fileoverview Root Layout - The main entry point and initialization hub for the application.
 *
 * This component serves as the root of the application's UI and is responsible
 * for orchestrating the initialization of all core services and systems. It
 * sets up the application's theme, manages the navigation stack, and handles
 * the critical logic for routing users based on their authentication status.
 *
 * The initialization sequence includes:
 * 1.  **SQLite Database**: Sets up the local database for offline storage.
 * 2.  **Authentication**: Listens for changes in the user's authentication state.
 * 3.  **Connection Monitoring**: Tracks network connectivity for the offline-first architecture.
 * 4.  **Store Connections**: Establishes communication between different state stores.
 * 5.  **Presence Management**: Handles real-time user online status.
 *
 * This component ensures that all necessary systems are ready before rendering
 * the main application UI, providing a stable and reliable user experience.
 *
 * @see setupStoreConnections for the inter-store communication logic.
 * @see useAuthStore for the authentication state management.
 * @see sqliteService for the local database initialization.
 */

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import "react-native-reanimated";

import NetworkStatusBar from "@/components/NetworkStatusBar";
import Toast from "@/components/Toast";
import { useColorScheme } from "@/hooks/use-color-scheme";
import presenceService from "@/services/presenceService";
import sqliteService from "@/services/sqliteService";
import { useAuthStore } from "@/stores/authStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useContactsStore } from "@/stores/contactsStore";
import { useLoggerStore } from "@/stores/loggerStore";
import { setupStoreConnections } from "@/stores/setupStores";

/** Navigation settings for Expo Router */
export const unstable_settings = {
  anchor: "(tabs)",
};

/**
 * Root layout component
 *
 * Initializes all core services and manages navigation based on auth state.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { user, userProfile, loading, initialize } = useAuthStore();
  const { initialize: initializeConnection } = useConnectionStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Initialize auth store
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  useEffect(() => {
    // Initialize SQLite database
    const initializeSQLite = async () => {
      try {
        await sqliteService.initialize();
        console.log("✅ SQLite initialized successfully");

        // Initialize logger and cleanup old logs
        const { loadLogs } = useLoggerStore.getState();
        await loadLogs();

        // Clean up logs older than 7 days
        await sqliteService.clearOldLogs(7);

        // Log successful initialization
        useLoggerStore.getState().info("app", "App initialized successfully", {
          timestamp: Date.now(),
          sqliteInitialized: true,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("❌ SQLite initialization failed:", error);
        useLoggerStore.getState().error("app", "SQLite initialization failed", {
          error: errorMessage,
          timestamp: Date.now(),
        });
      }
    };

    initializeSQLite();
  }, []);

  useEffect(() => {
    // Initialize connection monitoring
    const unsubscribeConnection = initializeConnection();
    return unsubscribeConnection;
  }, [initializeConnection]);

  useEffect(() => {
    // Setup store connections after connection store is initialized
    const unsubscribeStores = setupStoreConnections();
    return unsubscribeStores;
  }, []);

  useEffect(() => {
    // Subscribe to friend requests when user is logged in
    if (user) {
      const {
        subscribeToFriendRequests,
        subscribeToSentRequests,
        subscribeToAcceptedRequests,
        subscribeToFriendsSubcollection,
        syncFriendsFromAcceptedRequests,
      } = useContactsStore.getState();

      // Sync friends from accepted requests on startup
      syncFriendsFromAcceptedRequests(user.uid).catch(console.error);

      const unsubscribeFriendRequests = subscribeToFriendRequests(user.uid);
      const unsubscribeSentRequests = subscribeToSentRequests(user.uid);
      const unsubscribeAcceptedRequests = subscribeToAcceptedRequests(user.uid);
      const unsubscribeFriendsSubcollection = subscribeToFriendsSubcollection(
        user.uid
      );

      return () => {
        unsubscribeFriendRequests();
        unsubscribeSentRequests();
        unsubscribeAcceptedRequests();
        unsubscribeFriendsSubcollection();
      };
    } else {
      // Clear friend requests when user logs out
      useContactsStore.setState({ friendRequests: [], sentRequests: [] });
    }
  }, [user]);

  useEffect(() => {
    // Handle app state changes for presence management
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const { user } = useAuthStore.getState();
      if (!user) return;

      if (nextAppState === "active") {
        presenceService.setOnlineStatus(user.uid, true).catch(console.error);
        presenceService.startHeartbeat(user.uid);
      } else if (nextAppState === "background" || nextAppState === "inactive") {
        presenceService.setOnlineStatus(user.uid, false).catch(console.error);
        presenceService.stopHeartbeat();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Handle navigation based on auth state
    if (loading) return; // Don't navigate while loading

    const inAuthGroup = segments[0] === "auth";
    const inProfileGroup = segments[0] === "profile";

    if (!user) {
      // User is not signed in, redirect to login
      if (!inAuthGroup) {
        router.replace("/auth/login");
      }
    } else if (user && !userProfile) {
      // User is signed in but no profile exists, redirect to profile setup
      if (!inProfileGroup) {
        router.replace("/profile/edit");
      }
    } else if (user && userProfile) {
      // User is signed in and has profile, redirect to main app
      // But allow navigation to profile/edit for editing
      if (inAuthGroup || (inProfileGroup && segments[1] !== "edit")) {
        router.replace("/(tabs)");
      }
    }
  }, [user, userProfile, loading, segments, router]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <NetworkStatusBar />
      <Toast />
      <Stack>
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen
          name="profile/edit"
          options={{
            title: "Edit Profile",
            presentation: "modal",
            headerBackTitle: "Back",
          }}
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="conversation/[id]"
          options={{
            headerShown: false,
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
