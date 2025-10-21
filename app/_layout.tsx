import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/stores/authStore";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { user, userProfile, loading, initialize } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Initialize auth store
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

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
