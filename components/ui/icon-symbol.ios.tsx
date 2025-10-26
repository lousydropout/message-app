/**
 * @fileoverview IconSymbol Component - A native wrapper for SF Symbols on iOS.
 *
 * This file provides the iOS-specific implementation of the `IconSymbol`
 * component, leveraging the `expo-symbols` library to render native SF Symbols.
 * This approach ensures that the icons have a pixel-perfect, platform-consistent
 * appearance and take advantage of native optimizations.
 *
 * The component's props are designed to align with the `SymbolView` from
 * `expo-symbols`, allowing for customization of the symbol's name, size, color,
 * and weight. This provides a powerful and flexible way to incorporate Apple's
 * extensive icon library into the application while maintaining a consistent
 * component API across different platforms.
 *
 * @see icon-symbol.tsx for the Android and web fallback implementation.
 */

import { SymbolView, SymbolViewProps, SymbolWeight } from "expo-symbols";
import { StyleProp, ViewStyle } from "react-native";

/**
 * Icon symbol component (iOS native)
 *
 * Uses native SF Symbols on iOS for optimal performance and appearance.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = "regular",
}: {
  name: SymbolViewProps["name"];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
