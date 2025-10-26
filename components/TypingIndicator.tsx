/**
 * @fileoverview TypingIndicator Component - Displays an animated typing indicator.
 *
 * This component provides real-time feedback to the user when other participants
 * in a conversation are typing. It renders a subtle animation of three bouncing
 * dots, accompanied by text that identifies who is typing. The component is
 * designed to handle multiple typists gracefully, updating the text to reflect
 * scenarios with one, two, or more people typing.
 *
 * It fetches the display names of the typing users from the `userService` and
 * ensures that the current user's own typing status is not displayed to them.
 * The animation is implemented using React Native's `Animated` API for smooth
 * and performant visuals.
 *
 * @see ConversationView for the component that integrates this indicator.
 * @see useMessagesStore for the state that provides the list of typing users.
 * @see messageService for the logic that updates typing status in Firestore.
 */

import userService from "@/services/userService";
import { User } from "@/types/User";
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

/**
 * Props for TypingIndicator component
 */
interface TypingIndicatorProps {
  /** Array of user IDs who are currently typing */
  typingUsers: string[];
  /** Current user's ID (to filter out) */
  currentUserId: string;
}

/**
 * Typing indicator component
 *
 * Displays an animated typing indicator with user names when
 * others are typing in the conversation.
 */
export function TypingIndicator({
  typingUsers,
  currentUserId,
}: TypingIndicatorProps) {
  const [userProfiles, setUserProfiles] = useState<User[]>([]);
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  // Filter out current user from typing users
  const otherTypingUsers = typingUsers.filter(
    (userId) => userId !== currentUserId
  );

  useEffect(() => {
    if (otherTypingUsers.length > 0) {
      // Fetch user profiles for typing users
      Promise.all(
        otherTypingUsers.map((userId) =>
          userService.getUserProfile(userId).catch(() => null)
        )
      ).then((profiles) => {
        setUserProfiles(profiles.filter(Boolean) as User[]);
      });

      // Start typing animation
      const createAnimation = (animValue: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(animValue, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(animValue, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ])
        );
      };

      const animation1 = createAnimation(dot1Anim, 0);
      const animation2 = createAnimation(dot2Anim, 200);
      const animation3 = createAnimation(dot3Anim, 400);

      animation1.start();
      animation2.start();
      animation3.start();

      return () => {
        animation1.stop();
        animation2.stop();
        animation3.stop();
      };
    } else {
      setUserProfiles([]);
    }
  }, [otherTypingUsers.length]);

  if (otherTypingUsers.length === 0) {
    return null;
  }

  const getTypingText = () => {
    if (userProfiles.length === 1) {
      return `${userProfiles[0].displayName} is typing...`;
    } else if (userProfiles.length === 2) {
      return `${userProfiles[0].displayName} and ${userProfiles[1].displayName} are typing...`;
    } else if (userProfiles.length > 2) {
      return `${userProfiles[0].displayName} and ${
        userProfiles.length - 1
      } others are typing...`;
    }
    return "Someone is typing...";
  };

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={styles.typingText}>{getTypingText()}</Text>
        <View style={styles.dotsContainer}>
          <Animated.View
            style={[
              styles.dot,
              {
                opacity: dot1Anim,
                transform: [
                  {
                    scale: dot1Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1.2],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              {
                opacity: dot2Anim,
                transform: [
                  {
                    scale: dot2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1.2],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              {
                opacity: dot3Anim,
                transform: [
                  {
                    scale: dot3Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1.2],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bubble: {
    backgroundColor: "#E5E5EA",
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "75%",
    flexDirection: "row",
    alignItems: "center",
  },
  typingText: {
    fontSize: 14,
    color: "#666",
    marginRight: 8,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#666",
    marginHorizontal: 1,
  },
});
