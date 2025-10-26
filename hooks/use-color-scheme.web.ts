/**
 * @fileoverview A custom implementation of the `useColorScheme` hook for the web platform.
 *
 * This hook is specifically designed to address the challenges of server-side
 * rendering (SSR) and hydration when determining the color scheme on the web.
 * On the initial server render, it defaults to "light" to ensure a consistent
 * baseline. Then, once the component has hydrated on the client, it uses the
 * actual color scheme provided by React Native for Web.
 *
 * This approach prevents hydration mismatches that can occur when the
 * server-rendered markup does not match the initial client-rendered markup,
 * which is a common issue in universal React applications.
 *
 * @see use-color-scheme.ts for the native implementation.
 */
import { useEffect, useState } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return "light";
}
