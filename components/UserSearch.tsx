import { useAuthStore } from "@/stores/authStore";
import { useContactsStore } from "@/stores/contactsStore";
import { User } from "@/types/User";
import { FlashList } from "@shopify/flash-list";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface UserSearchProps {
  onUserSelect?: (user: User) => void;
}

export default function UserSearch({ onUserSelect }: UserSearchProps) {
  const { user } = useAuthStore();
  const {
    searchResults,
    searchLoading,
    searchUsers,
    clearSearchResults,
    sendRequest,
    checkFriendRequestStatus,
  } = useContactsStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [friendStatuses, setFriendStatuses] = useState<
    Record<string, "stranger" | "pending" | "friend" | "blocked">
  >({});

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim() && user) {
        searchUsers(searchQuery, user.uid);
      } else {
        clearSearchResults();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, user, searchUsers, clearSearchResults]);

  // Check friend statuses when search results change
  useEffect(() => {
    if (searchResults.length > 0 && user) {
      const checkStatuses = async () => {
        const statuses: Record<
          string,
          "stranger" | "pending" | "friend" | "blocked"
        > = {};

        for (const targetUser of searchResults) {
          try {
            const status = await checkFriendRequestStatus(
              user.uid,
              targetUser.id
            );
            statuses[targetUser.id] = status;
          } catch (error) {
            console.error(`Error checking status for ${targetUser.id}:`, error);
            statuses[targetUser.id] = "stranger";
          }
        }

        setFriendStatuses(statuses);
      };

      checkStatuses();
    } else {
      setFriendStatuses({});
    }
  }, [searchResults, user, checkFriendRequestStatus]);

  const handleSendRequest = async (targetUser: User) => {
    if (!user) return;

    setActionLoading(targetUser.id);
    try {
      await sendRequest(user.uid, targetUser.id);

      // Update the friend status to "pending" after successful request
      setFriendStatuses((prev) => ({
        ...prev,
        [targetUser.id]: "pending",
      }));

      Alert.alert(
        "Success",
        `Friend request sent to ${targetUser.displayName}`
      );
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send friend request");
    } finally {
      setActionLoading(null);
    }
  };

  const getActionButton = (targetUser: User) => {
    if (!user) return null;

    const status = friendStatuses[targetUser.id] || "stranger";

    switch (status) {
      case "friend":
        return (
          <TouchableOpacity
            style={[styles.actionButton, styles.messageButton]}
            onPress={() => onUserSelect?.(targetUser)}
          >
            <Text style={styles.messageButtonText}>Message</Text>
          </TouchableOpacity>
        );
      case "pending":
        return (
          <TouchableOpacity
            style={[styles.actionButton, styles.pendingButton]}
            disabled
          >
            <Text style={styles.pendingButtonText}>Request Sent</Text>
          </TouchableOpacity>
        );
      case "blocked":
        return (
          <TouchableOpacity
            style={[styles.actionButton, styles.blockedButton]}
            disabled
          >
            <Text style={styles.blockedButtonText}>Blocked</Text>
          </TouchableOpacity>
        );
      default:
        return (
          <TouchableOpacity
            style={[styles.actionButton, styles.addButton]}
            onPress={() => handleSendRequest(targetUser)}
            disabled={actionLoading === targetUser.id}
          >
            {actionLoading === targetUser.id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.addButtonText}>Add Friend</Text>
            )}
          </TouchableOpacity>
        );
    }
  };

  const renderUserCard = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.displayName}>{item.displayName}</Text>
          <Text style={styles.email}>{item.email}</Text>
        </View>
      </View>
      {getActionButton(item)}
    </View>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by name or email..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {searchLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      )}

      {searchQuery.trim() && !searchLoading && (
        <FlashList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderUserCard}
          style={styles.resultsList}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#DEE2E6",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#6C757D",
  },
  resultsList: {
    flex: 1,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 16,
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
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  addButton: {
    backgroundColor: "#007AFF",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  pendingButton: {
    backgroundColor: "#6C757D",
  },
  pendingButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  messageButton: {
    backgroundColor: "#28A745",
  },
  messageButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  blockedButton: {
    backgroundColor: "#DC3545",
  },
  blockedButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6C757D",
  },
});
