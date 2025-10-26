/**
 * @fileoverview SentRequestCard Component - Renders a card for an outgoing friend request.
 *
 * This component is used to display a friend request that the current user has
 * sent to another user. It shows the recipient's details and provides a "Cancel"
 * button to allow the user to withdraw the request. The component handles the
 * asynchronous nature of this action by displaying a loading indicator and
 * providing feedback to the user upon success or failure.
 *
 * @see ContactsScreen for the UI where this component is displayed.
 * @see useContactsStore for the `cancelSentRequest` action.
 */

import { useContactsStore } from "@/stores/contactsStore";
import { FriendRequest } from "@/types/FriendRequest";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * Props for SentRequestCard component
 */
interface SentRequestCardProps {
  /** Friend request data */
  request: FriendRequest;
  /** Recipient's display name */
  recipientName: string;
  /** Recipient's email */
  recipientEmail: string;
}

/**
 * Sent request card component
 *
 * Displays a sent friend request with option to cancel.
 */
export default function SentRequestCard({
  request,
  recipientName,
  recipientEmail,
}: SentRequestCardProps) {
  const { cancelSentRequest } = useContactsStore();
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await cancelSentRequest(request.id);
      Alert.alert("Success", "Friend request cancelled");
    } catch (error) {
      console.error("Error cancelling friend request:", error);
      Alert.alert(
        "Error",
        "Failed to cancel friend request. Please try again."
      );
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "Unknown date";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    );

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.userInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {recipientName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.displayName}>{recipientName}</Text>
          <Text style={styles.email}>{recipientEmail}</Text>
          <Text style={styles.date}>Sent {formatDate(request.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.cancelButton]}
          onPress={handleCancel}
          disabled={actionLoading}
        >
          {actionLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.cancelButtonText}>Cancel</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
  },
  userDetails: {
    flex: 1,
  },
  displayName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    color: "#6C757D",
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
    color: "#ADB5BD",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  actionButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#DC3545",
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
