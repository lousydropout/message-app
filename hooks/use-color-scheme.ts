/**
 * @fileoverview Re-exports the `useColorScheme` hook from React Native.
 *
 * This file provides a consistent import path for the `useColorScheme` hook,
 * which is used throughout the application to detect the user's preferred color
 * scheme (light or dark). This is the standard implementation for native
 * platforms (iOS and Android).
 *
 * For the web platform, a separate implementation is provided in
 * `use-color-scheme.web.ts` to handle server-side rendering and hydration
 * correctly.
 *
 * @see use-color-scheme.web.ts for the web-specific implementation.
 */
export { useColorScheme } from "react-native";
