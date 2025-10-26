import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
import { useContactsStore } from "@/stores/contactsStore";
import { User } from "@/types/User";
import { FlashList } from "@shopify/flash-list";
import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface ContactsListProps {
  friends: User[];
  onFriendSelect?: (friend: User) => void;
  onBlockFriend?: (friend: User) => void;
}

export default function ContactsList({
  friends,
  onFriendSelect,
  onBlockFriend,
}: ContactsListProps) {
  const { user } = useAuthStore();
  const { blockUser } = useContactsStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredFriends, setFilteredFriends] = useState(friends);

  // Filter friends based on search query
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFriends(friends);
    } else {
      const filtered = friends.filter(
        (friend) =>
          friend.displayName
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          friend.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredFriends(filtered);
    }
  }, [searchQuery, friends]);

  const handleBlockFriend = async (friend: User) => {
    if (!user) return;

    Alert.alert(
      "Block User",
      `Are you sure you want to block ${friend.displayName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await blockUser(user.uid, friend.id);
              onBlockFriend?.(friend);
              Alert.alert("Success", `${friend.displayName} has been blocked`);
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to block user");
            }
          },
        },
      ]
    );
  };

  const renderFriendCard = ({ item }: { item: User }) => {
    const statusInfo = userService.getOnlineStatusInfo(item);

    return (
      <TouchableOpacity
        style={styles.friendCard}
        onPress={() => onFriendSelect?.(item)}
        onLongPress={() => handleBlockFriend(item)}
      >
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userDetails}>
            <Text style={styles.displayName}>{item.displayName}</Text>
            <Text style={styles.email}>{item.email}</Text>
            <Text
              style={[
                styles.status,
                {
                  color: statusInfo.color,
                  fontWeight: statusInfo.fontWeight as any,
                },
              ]}
            >
              {statusInfo.text}
            </Text>
          </View>
        </View>
        <View style={styles.messageButton}>
          <Text style={styles.messageButtonText}>Message</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search friends..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <FlashList
        data={filteredFriends}
        keyExtractor={(item) => item.id}
        renderItem={renderFriendCard}
        style={styles.friendsList}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? "No friends found" : "No friends yet"}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery.trim()
                ? "Try a different search term"
                : "Search for users to add as friends"}
            </Text>
          </View>
        }
      />
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
  friendsList: {
    flex: 1,
  },
  friendCard: {
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
  status: {
    fontSize: 12,
    fontWeight: "500",
  },
  messageButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  messageButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6C757D",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#ADB5BD",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
