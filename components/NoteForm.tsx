// components/NoteForm.tsx
import { useAuthStore } from "@/stores/authStore";
import { useNotesStore } from "@/stores/notesStore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface NoteFormProps {
  noteId?: string;
  initialTitle?: string;
  initialContent?: string;
  onSave: () => void;
}

export function NoteForm({
  noteId,
  initialTitle = "",
  initialContent = "",
  onSave,
}: NoteFormProps) {
  const { user } = useAuthStore();
  const { createNote, updateNote } = useNotesStore();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  console.log("noteform: ", { noteId, initialTitle, initialContent });
  // Add this useEffect to sync state with props
  useEffect(() => {
    setTitle(initialTitle);
    setContent(initialContent);
  }, [initialTitle, initialContent]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("Error", "Please fill in both title and content");
      return;
    }

    if (!user) {
      Alert.alert("Error", "You must be signed in to save notes");
      return;
    }

    setSaving(true);
    try {
      if (noteId) {
        await updateNote(noteId, {
          title: title.trim(),
          content: content.trim(),
        });
      } else {
        await createNote({
          title: title.trim(),
          content: content.trim(),
          userId: user.uid,
        });
      }
      onSave();
    } catch (error) {
      Alert.alert("Error", "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.form}>
        <TextInput
          style={styles.titleInput}
          placeholder="Note title..."
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />
        <TextInput
          style={styles.contentInput}
          placeholder="Write your note here..."
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : noteId ? "Update Note" : "Save Note"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  form: {
    flex: 1,
    padding: 20,
  },
  titleInput: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 8,
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  contentInput: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 8,
    fontSize: 16,
    flex: 1,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  saveButton: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#ccc",
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
