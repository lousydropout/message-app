/**
 * @fileoverview FriendRequestCard Component - A card for displaying an incoming friend request.
 *
 * This component renders a card that presents the details of an incoming friend
 * request, including the sender's name and email, and the date the request was
 * sent. It provides two primary actions for the user: "Accept" and "Decline".
 *
 * The component manages its own loading state for these actions, showing an
 * `ActivityIndicator` to provide visual feedback to the user while the request
 * is being processed. It uses the `useContactsStore` to perform the actual
 * accept or decline operations.
 *
 * @see ContactsScreen for where this component is used.
 * @see useContactsStore for the `acceptRequest` and `declineRequest` actions.
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
 * Props for FriendRequestCard component
 */
interface FriendRequestCardProps {
  /** Friend request data */
  request: FriendRequest;
  /** Sender's display name */
  senderName: string;
  /** Sender's email */
  senderEmail: string;
}

/**
 * Friend request card component
 *
 * Displays an incoming friend request with options to accept or decline.
 */
export default function FriendRequestCard({
  request,
  senderName,
  senderEmail,
}: FriendRequestCardProps) {
  const { acceptRequest, declineRequest } = useContactsStore();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAccept = async () => {
    setActionLoading("accept");
    try {
      await acceptRequest(request.id);
      Alert.alert("Success", `You are now friends with ${senderName}`);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to accept friend request");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async () => {
    setActionLoading("decline");
    try {
      await declineRequest(request.id);
      Alert.alert("Success", "Friend request declined");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to decline friend request");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  };

  return (
    <View style={styles.container}>
      <View style={styles.userInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {senderName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.displayName}>{senderName}</Text>
          <Text style={styles.email}>{senderEmail}</Text>
          <Text style={styles.date}>Sent {formatDate(request.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={handleAccept}
          disabled={actionLoading !== null}
        >
          {actionLoading === "accept" ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.acceptButtonText}>Accept</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.declineButton]}
          onPress={handleDecline}
          disabled={actionLoading !== null}
        >
          {actionLoading === "decline" ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.declineButtonText}>Decline</Text>
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  userDetails: {
    flex: 1,
  },
  displayName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#212529",
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
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  acceptButton: {
    backgroundColor: "#28A745",
  },
  acceptButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  declineButton: {
    backgroundColor: "#6C757D",
  },
  declineButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
