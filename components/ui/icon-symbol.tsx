/**
 * @fileoverview IconSymbol Component - A cross-platform icon rendering solution (Android/Web Fallback).
 *
 * This file provides the Android and web implementation of the `IconSymbol`
 * component. It acts as a fallback for platforms that do not support Apple's
 * SF Symbols. The component's API is designed to be consistent with the iOS
 * implementation, using SF Symbol names as its primary identifier.
 *
 * It maintains a `MAPPING` object that translates SF Symbol names into their
 * closest equivalents in the Material Icons library, which is used for rendering
 * on these platforms. This approach allows developers to use a single, unified
 * icon component across the entire application, simplifying the development
 * process for a cross-platform codebase.
 *
 * @see icon-symbol.ios.tsx for the primary iOS implementation.
 */

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolViewProps, SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<
  SymbolViewProps["name"],
  ComponentProps<typeof MaterialIcons>["name"]
>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols to Material Icons mapping
 *
 * Add your SF Symbols to Material Icons mappings here.
 * - See Material Icons in the [Icons Directory](https://icons.expo.fyi)
 * - See SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
} as IconMapping;

/**
 * Icon symbol component (Android/Web fallback)
 *
 * Uses Material Icons for Android and web platforms.
 * Icon names are based on SF Symbols and require manual mapping.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <MaterialIcons
      color={color}
      size={size}
      name={MAPPING[name]}
      style={style}
    />
  );
}
