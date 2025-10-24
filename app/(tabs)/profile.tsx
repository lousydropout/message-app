import { useAuthStore } from "@/stores/authStore";
import { Link } from "expo-router";
import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function ProfileScreen() {
  const { user, userProfile, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch (error) {
            Alert.alert("Error", "Failed to sign out. Please try again.");
          }
        },
      },
    ]);
  };

  const formatLanguages = (languages: string[]) => {
    if (!languages || languages.length === 0) return "None selected";
    return languages.join(", ");
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userProfile?.displayName?.charAt(0)?.toUpperCase() || "?"}
            </Text>
          </View>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.displayName}>
            {userProfile?.displayName + " " || "No name set"}
          </Text>
          <Text style={styles.email}>{user?.email + " " || "No email"}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Language Preferences</Text>
        <Text style={styles.sectionContent}>
          {formatLanguages(userProfile?.languagePreferences || [])}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Settings</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Auto-translate messages</Text>
          <Text style={styles.settingValue}>
            {userProfile?.aiSettings?.autoTranslate ? "On " : "Off "}
          </Text>
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Cultural hints</Text>
          <Text style={styles.settingValue}>
            {userProfile?.aiSettings?.culturalHints ? "On " : "Off "}
          </Text>
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Formality adjustment</Text>
          <Text style={styles.settingValue}>
            {userProfile?.aiSettings?.formalityAdjustment ? "On " : "Off "}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Link href="/profile/edit" asChild>
          <TouchableOpacity style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </Link>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#212529",
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    margin: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  userInfo: {
    alignItems: "center",
  },
  displayName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: "#6C757D",
  },
  section: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 12,
  },
  sectionContent: {
    fontSize: 16,
    color: "#6C757D",
    lineHeight: 22,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 16,
    color: "#212529",
  },
  settingValue: {
    fontSize: 16,
    color: "#6C757D",
    fontWeight: "500",
  },
  actions: {
    padding: 20,
  },
  editButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  editButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "#DC3545",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
