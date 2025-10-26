import { useToastStore } from "@/stores/toastStore";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Toast() {
  const { toasts, removeToast } = useToastStore();
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (toasts.length > 0) {
      // Slide in
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    } else {
      // Slide out
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [toasts.length, slideAnim]);

  if (toasts.length === 0) return null;

  const latestToast = toasts[toasts.length - 1];

  const getToastIcon = () => {
    switch (latestToast.type) {
      case "message":
        return "chatbubble-outline";
      case "friend_request":
        return "person-add-outline";
      case "friend_accepted":
        return "checkmark-circle-outline";
      default:
        return "notifications-outline";
    }
  };

  const getToastColor = () => {
    switch (latestToast.type) {
      case "message":
        return "#007AFF";
      case "friend_request":
        return "#FF9500";
      case "friend_accepted":
        return "#34C759";
      default:
        return "#007AFF";
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Animated.View
        style={[
          styles.toast,
          {
            transform: [{ translateY: slideAnim }],
            borderLeftColor: getToastColor(),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.toastContent}
          onPress={() => removeToast(latestToast.id)}
          activeOpacity={0.8}
        >
          <View style={styles.toastHeader}>
            <Ionicons
              name={getToastIcon()}
              size={20}
              color={getToastColor()}
              style={styles.toastIcon}
            />
            <Text style={styles.toastTitle} numberOfLines={1}>
              {latestToast.title}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => removeToast(latestToast.id)}
            >
              <Ionicons name="close" size={16} color="#666" />
            </TouchableOpacity>
          </View>
          <Text style={styles.toastMessage} numberOfLines={2}>
            {latestToast.message}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  toast: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: "white",
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toastContent: {
    padding: 16,
  },
  toastHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  toastIcon: {
    marginRight: 8,
  },
  toastTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
  toastMessage: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
});
