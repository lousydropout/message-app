/**
 * @fileoverview ThemedView Component - A custom View component with theme support.
 *
 * This component extends the standard React Native `View` component to provide
 * automatic support for light and dark color schemes. It uses the `useThemeColor`
 * hook to set the `backgroundColor` property based on the current theme, which
 * simplifies the process of building theme-aware layouts and components.
 *
 * By using this component, developers can ensure that their views and containers
 * have a consistent appearance across the application without needing to manually
 * manage background colors for different themes.
 *
 * @see useThemeColor for the hook that provides theme-aware colors.
 * @see ThemedText for a similar component for text.
 */

import { View, type ViewProps } from "react-native";

import { useThemeColor } from "@/hooks/use-theme-color";

/**
 * Props for ThemedView component
 */
export type ThemedViewProps = ViewProps & {
  /** Custom background color for light mode */
  lightColor?: string;
  /** Custom background color for dark mode */
  darkColor?: string;
};

/**
 * Themed view component
 *
 * Provides automatic theme background color adaptation.
 */
export function ThemedView({
  style,
  lightColor,
  darkColor,
  ...otherProps
}: ThemedViewProps) {
  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "background"
  );

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
