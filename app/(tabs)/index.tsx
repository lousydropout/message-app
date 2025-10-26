/**
 * @fileoverview Home Screen - The main landing screen of the application.
 *
 * This screen serves as the primary entry point for the user after they have
 * logged in. Its main purpose is to display the user's list of ongoing
 * conversations.
 *
 * The actual rendering and logic for the conversation list are encapsulated
 * within the `ConversationsList` component. This screen acts as a simple
 * container, promoting a clean separation of concerns where the screen component
 * is responsible for layout and navigation, while the child component handles
 * the specific functionality of displaying the conversation list.
 *
 * @see ConversationsList for the detailed implementation of the conversation list.
 * @see (tabs)/_layout.tsx for how this screen is integrated into the tab navigator.
 */

import { ConversationsList } from "@/components/ConversationsList";

/**
 * Home screen component
 *
 * Displays the list of conversations for the current user.
 * This is the default tab view when the app opens.
 */
export default function HomeScreen() {
  return <ConversationsList />;
}
