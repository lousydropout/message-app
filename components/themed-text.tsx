/**
 * @fileoverview ThemedText Component - A custom Text component with theme support.
 *
 * This component extends the standard React Native `Text` component to provide
 * automatic support for light and dark color schemes. It uses the `useThemeColor`
 * hook to select the appropriate color from the application's theme based on the
 * current color mode.
 *
 * It also defines a set of typographic styles (e.g., "title", "subtitle", "link")
 * to ensure consistent typography throughout the application, reducing the need
 * for inline styling and promoting a more maintainable codebase.
 *
 * @see useThemeColor for the hook that provides theme-aware colors.
 * @see ThemedView for a similar component for views.
 */

import { StyleSheet, Text, type TextProps } from "react-native";

import { useThemeColor } from "@/hooks/use-theme-color";

/**
 * Props for ThemedText component
 */
export type ThemedTextProps = TextProps & {
  /** Custom color for light mode */
  lightColor?: string;
  /** Custom color for dark mode */
  darkColor?: string;
  /** Text style type */
  type?: "default" | "title" | "defaultSemiBold" | "subtitle" | "link";
};

/**
 * Themed text component
 *
 * Provides automatic theme color adaptation and predefined text styles.
 */
export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");

  return (
    <Text
      style={[
        { color },
        type === "default" ? styles.default : undefined,
        type === "title" ? styles.title : undefined,
        type === "defaultSemiBold" ? styles.defaultSemiBold : undefined,
        type === "subtitle" ? styles.subtitle : undefined,
        type === "link" ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: "#0a7ea4",
  },
});
