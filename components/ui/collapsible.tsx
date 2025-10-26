/**
 * @fileoverview Collapsible Component - An expandable content container.
 *
 * This component provides a common UI pattern where a section of content can be
 * shown or hidden by tapping on a header. It includes a title and an animated
 * chevron icon that rotates to indicate the current state (expanded or collapsed).
 *
 * It is built using the application's themed components (`ThemedView` and
 * `ThemedText`) to ensure that its appearance is consistent with the rest of
 * the application's design and supports both light and dark modes.
 *
 * @see ThemedView for the themed container component.
 * @see ThemedText for the themed text component.
 */

import { PropsWithChildren, useState } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * Collapsible component
 *
 * Provides an expandable/collapsible section with a title and content.
 * Used for hiding/showing detailed information.
 */
export function Collapsible({
  children,
  title,
}: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useColorScheme() ?? "light";

  return (
    <ThemedView>
      <TouchableOpacity
        style={styles.heading}
        onPress={() => setIsOpen((value) => !value)}
        activeOpacity={0.8}
      >
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={theme === "light" ? Colors.light.icon : Colors.dark.icon}
          style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }}
        />

        <ThemedText type="defaultSemiBold">{title}</ThemedText>
      </TouchableOpacity>
      {isOpen && <ThemedView style={styles.content}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  content: {
    marginTop: 6,
    marginLeft: 24,
  },
});
