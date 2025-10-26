/**
 * @fileoverview HelloWave Component - Animated waving hand emoji
 *
 * This component provides:
 * - Animated waving hand emoji (👋)
 * - Rotation animation on mount
 * - Lightweight welcome animation
 *
 * Used as a decorative element in welcome screens.
 */

import Animated from "react-native-reanimated";

/**
 * Hello wave component
 *
 * Displays an animated waving hand emoji with rotation animation.
 */
export function HelloWave() {
  return (
    <Animated.Text
      style={{
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
        animationName: {
          "50%": { transform: [{ rotate: "25deg" }] },
        },
        animationIterationCount: 4,
        animationDuration: "300ms",
      }}
    >
      👋
    </Animated.Text>
  );
}
