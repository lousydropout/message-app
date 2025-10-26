/**
 * @fileoverview Modal Screen - A generic, reusable modal component.
 *
 * This file defines a simple, presentational modal screen that can be used
 * throughout the application for various purposes. It is built with themed
 * components to ensure a consistent look and feel with the rest of the app.
 *
 * The `expo-router` `Link` component is used to provide a convenient way to
 * dismiss the modal and navigate back to the home screen. This component can
 * serve as a template or a base for more complex modal dialogs that may be
 * required in the future.
 *
 * @see _layout.tsx for how this modal is integrated into the navigation stack.
 */

import { Link } from "expo-router";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

/**
 * Modal screen component
 *
 * Basic modal template with themed components.
 */
export default function ModalScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">This is a modal</ThemedText>
      <Link href="/" dismissTo style={styles.link}>
        <ThemedText type="link">Go to home screen</ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
