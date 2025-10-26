/**
 * @fileoverview CreateGroupModal Component - A modal for creating new group conversations.
 *
 * This component provides a full-screen modal interface that allows users to
 * create a new group chat. It displays a list of the user's friends, allowing
 * for multi-selection, and includes an input field for the group's name. The
 * component has built-in validation to ensure that a group name is provided
 * and that at least two friends are selected.
 *
 * Upon successful creation, it uses the `expo-router` to navigate the user
 * directly to the newly created group conversation.
 *
 * @see ConversationsList for where this modal is triggered.
 * @see useMessagesStore for the `createGroupConversation` action.
 * @see useContactsStore for the list of friends to select from.
 */

import { useAuthStore } from "@/stores/authStore";
import { useContactsStore } from "@/stores/contactsStore";
import { useMessagesStore } from "@/stores/messagesStore";
import { User } from "@/types/User";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * Props for CreateGroupModal component
 */
interface CreateGroupModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback to close the modal */
  onClose: () => void;
}

/**
 * Create group modal component
 *
 * Allows users to create a new group conversation by selecting
 * friends and providing a group name.
 */
export default function CreateGroupModal({
  visible,
  onClose,
}: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const { user } = useAuthStore();
  const { friends } = useContactsStore();
  const { createGroupConversation } = useMessagesStore();

  const handleFriendToggle = (friendId: string) => {
    setSelectedFriends((prev) => {
      if (prev.includes(friendId)) {
        return prev.filter((id) => id !== friendId);
      } else {
        return [...prev, friendId];
      }
    });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert("Error", "Please enter a group name");
      return;
    }

    if (selectedFriends.length < 2) {
      Alert.alert("Error", "Please select at least 2 friends");
      return;
    }

    if (!user) {
      Alert.alert("Error", "User not authenticated");
      return;
    }

    setCreating(true);
    try {
      const conversationId = await createGroupConversation(
        selectedFriends,
        groupName.trim()
      );

      // Reset form
      setGroupName("");
      setSelectedFriends([]);
      onClose();

      // Navigate to the new group conversation
      router.push(`/conversation/${conversationId}`);
    } catch (error: any) {
      console.error("Error creating group:", error);
      Alert.alert("Error", error.message || "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setGroupName("");
    setSelectedFriends([]);
    onClose();
  };

  const renderFriendItem = ({ item }: { item: User }) => {
    const isSelected = selectedFriends.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.friendItem, isSelected && styles.friendItemSelected]}
        onPress={() => handleFriendToggle(item.id)}
      >
        <View style={styles.friendInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.friendDetails}>
            <Text style={styles.friendName}>{item.displayName}</Text>
            <Text style={styles.friendEmail}>{item.email}</Text>
          </View>
        </View>
        <View style={styles.checkbox}>
          {isSelected && (
            <Ionicons name="checkmark" size={20} color="#007AFF" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSelectedPreview = () => {
    if (selectedFriends.length === 0) return null;

    return (
      <View style={styles.selectedPreview}>
        <Text style={styles.selectedLabel}>
          Selected ({selectedFriends.length}):
        </Text>
        <View style={styles.selectedAvatars}>
          {selectedFriends.slice(0, 5).map((friendId) => {
            const friend = friends.find((f) => f.id === friendId);
            if (!friend) return null;
            return (
              <View key={friendId} style={styles.selectedAvatar}>
                <Text style={styles.selectedAvatarText}>
                  {friend.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            );
          })}
          {selectedFriends.length > 5 && (
            <View style={styles.selectedAvatar}>
              <Text style={styles.selectedAvatarText}>
                +{selectedFriends.length - 5}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Group</Text>
          <TouchableOpacity
            onPress={handleCreateGroup}
            style={[
              styles.createButton,
              (!groupName.trim() || selectedFriends.length < 2 || creating) &&
                styles.createButtonDisabled,
            ]}
            disabled={
              !groupName.trim() || selectedFriends.length < 2 || creating
            }
          >
            <Text style={styles.createText}>Create</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.groupNameSection}>
            <Text style={styles.sectionLabel}>Group Name</Text>
            <TextInput
              style={styles.groupNameInput}
              placeholder="Enter group name"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={50}
            />
          </View>

          {renderSelectedPreview()}

          <View style={styles.friendsSection}>
            <Text style={styles.sectionLabel}>
              Select Friends ({selectedFriends.length})
            </Text>
            <FlashList
              data={friends}
              renderItem={renderFriendItem}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color="#C7C7CC" />
                  <Text style={styles.emptyText}>No friends yet</Text>
                  <Text style={styles.emptySubtext}>
                    Add friends to create groups
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  cancelButton: {
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 16,
    color: "#007AFF",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  createButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonDisabled: {
    backgroundColor: "#C7C7CC",
  },
  createText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  groupNameSection: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
  },
  groupNameInput: {
    borderWidth: 1,
    borderColor: "#DEE2E6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "white",
  },
  selectedPreview: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  selectedLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  selectedAvatars: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectedAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  selectedAvatarText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  friendsSection: {
    flex: 1,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  friendItemSelected: {
    backgroundColor: "#E3F2FD",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  friendInfo: {
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
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  friendDetails: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 2,
  },
  friendEmail: {
    fontSize: 14,
    color: "#666",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#DEE2E6",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
});
