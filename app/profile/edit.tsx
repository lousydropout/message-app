/**
 * @fileoverview Profile Edit Screen - Allows users to configure their settings.
 *
 * This screen provides a user-friendly interface for modifying profile settings,
 * including language preferences and AI feature toggles. It pre-populates the
 * form with the user's current settings from the `useAuthStore` and handles the
 * submission of any changes.
 *
 * A key piece of logic in this screen is its ability to gracefully handle both
 * profile creation and updates. If an attempt to update the profile fails (which
 * can happen if a profile document was not created during sign-up), it
 * automatically falls back to creating a new profile. This ensures a robust
 * user experience, particularly for new users or in edge cases.
 *
 * @see useAuthStore for the `updateProfile` and `createProfile` actions.
 * @see ProfileScreen for the screen that displays the saved settings.
 */

import { useAuthStore } from "@/stores/authStore";
import { SUPPORTED_LANGUAGES, SupportedLanguageCode } from "@/types/User";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * Profile edit screen component
 *
 * Allows users to edit their language preferences and AI settings.
 * Loads current profile data and updates it on save.
 */
export default function ProfileEditScreen() {
  const router = useRouter();
  const { userProfile, updateProfile, createProfile, loading, logout } =
    useAuthStore();

  const [languagePreferences, setLanguagePreferences] = useState<
    SupportedLanguageCode[]
  >([]);
  const [aiSettings, setAiSettings] = useState({
    autoTranslate: true,
    culturalHints: true,
    formalityAdjustment: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setLanguagePreferences(userProfile.languagePreferences);
      setAiSettings(userProfile.aiSettings);
    }
  }, [userProfile]);

  const toggleLanguage = (languageCode: SupportedLanguageCode) => {
    setLanguagePreferences((prev) => {
      if (prev.includes(languageCode)) {
        return prev.filter((lang) => lang !== languageCode);
      } else {
        return [...prev, languageCode];
      }
    });
  };

  const toggleAISetting = (setting: keyof typeof aiSettings) => {
    setAiSettings((prev) => ({
      ...prev,
      [setting]: !prev[setting],
    }));
  };

  const handleSave = async () => {
    if (languagePreferences.length === 0) {
      Alert.alert("Error", "Please select at least one language preference.");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        languagePreferences,
        aiSettings,
      });

      Alert.alert("Success", "Profile updated successfully!", [
        { text: "OK", onPress: () => router.replace("/(tabs)") },
      ]);
    } catch (error) {
      console.error("Error updating profile:", error);

      // Try creating the profile if update failed
      try {
        console.log("Attempting to create profile instead...");
        await createProfile({
          languagePreferences,
          aiSettings,
        });

        Alert.alert("Success", "Profile created successfully!", [
          { text: "OK", onPress: () => router.replace("/(tabs)") },
        ]);
      } catch (createError) {
        console.error("Error creating profile:", createError);
        Alert.alert(
          "Error",
          "Failed to update or create profile. Please try again."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!userProfile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          No profile found. Please sign in again.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            await logout();
            router.replace("/auth/login");
          }}
        >
          <Text style={styles.buttonText}>Sign Out & Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Edit Profile</Text>
        <Text style={styles.subtitle}>
          Customize your language preferences and AI settings
        </Text>
      </View>

      {/* User Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name:</Text>
          <Text style={styles.infoValue}>{userProfile.displayName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email:</Text>
          <Text style={styles.infoValue}>{userProfile.email}</Text>
        </View>
      </View>

      {/* Language Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Language Preferences</Text>
        <Text style={styles.sectionDescription}>
          Select the languages you&apos;re comfortable communicating in. This
          helps AI features work better for you.
        </Text>
        <View style={styles.languageGrid}>
          {SUPPORTED_LANGUAGES.map((language) => (
            <TouchableOpacity
              key={language.code}
              style={[
                styles.languageButton,
                languagePreferences.includes(language.code) &&
                  styles.languageButtonSelected,
              ]}
              onPress={() => toggleLanguage(language.code)}
            >
              <Text
                style={[
                  styles.languageButtonText,
                  languagePreferences.includes(language.code) &&
                    styles.languageButtonTextSelected,
                ]}
              >
                {language.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* AI Settings Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Features</Text>
        <Text style={styles.sectionDescription}>
          Configure how AI features assist you in conversations.
        </Text>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => toggleAISetting("autoTranslate")}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Auto-translate</Text>
            <Text style={styles.settingDescription}>
              Automatically translate messages to your preferred languages
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              aiSettings.autoTranslate && styles.toggleActive,
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                aiSettings.autoTranslate && styles.toggleThumbActive,
              ]}
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => toggleAISetting("culturalHints")}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Cultural Context Hints</Text>
            <Text style={styles.settingDescription}>
              Get suggestions for culturally appropriate responses
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              aiSettings.culturalHints && styles.toggleActive,
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                aiSettings.culturalHints && styles.toggleThumbActive,
              ]}
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => toggleAISetting("formalityAdjustment")}
        >
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Formality Adjustment</Text>
            <Text style={styles.settingDescription}>
              Adjust message tone based on conversation context
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              aiSettings.formalityAdjustment && styles.toggleActive,
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                aiSettings.formalityAdjustment && styles.toggleThumbActive,
              ]}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* Save Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6C757D",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#DC3545",
    textAlign: "center",
    marginBottom: 20,
  },
  header: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#212529",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6C757D",
  },
  section: {
    backgroundColor: "#FFFFFF",
    marginTop: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#6C757D",
    marginBottom: 16,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#495057",
    width: 80,
  },
  infoValue: {
    fontSize: 16,
    color: "#212529",
    flex: 1,
  },
  languageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  languageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DEE2E6",
    backgroundColor: "#FFFFFF",
  },
  languageButtonSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  languageButtonText: {
    fontSize: 14,
    color: "#495057",
    fontWeight: "500",
  },
  languageButtonTextSelected: {
    color: "#FFFFFF",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F3F4",
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#212529",
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: "#6C757D",
    lineHeight: 18,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#DEE2E6",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: "#007AFF",
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  buttonContainer: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    marginTop: 12,
  },
  saveButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#6C757D",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
});
