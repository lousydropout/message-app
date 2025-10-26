/**
 * @fileoverview A custom hook for accessing theme-dependent colors.
 *
 * This hook provides a centralized way to retrieve colors from the application's
 * theme, automatically selecting the correct color based on the current color
 * scheme (light or dark). It simplifies the process of applying theme-aware
 * styling to components.
 *
 * The hook first checks if a specific color for the current theme has been
 * passed directly as a prop. If so, it returns that color, allowing for
 * component-level overrides. If not, it falls back to the globally defined
 * theme colors in the `constants/theme.ts` file.
 *
 * @param props - An object that may contain `light` and `dark` color overrides.
 * @param colorName - The name of the color to retrieve from the global theme.
 * @returns The appropriate color value for the current theme.
 *
 * @see constants/theme.ts for the global color definitions.
 * @see useColorScheme for the hook that determines the current theme.
 */
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? "light";
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
