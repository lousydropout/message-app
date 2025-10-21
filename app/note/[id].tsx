// app/note/[id].tsx - Dynamic route for note editing
import { NoteForm } from "@/components/NoteForm";
import { useAuthStore } from "@/stores/authStore";
import { useNotesStore } from "@/stores/notesStore";
import { Note } from "@/types/Note";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { notes, updateNote, deleteNote } = useNotesStore();
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    if (id && id !== "new") {
      const foundNote = notes.find((n) => n.id === id);
      setNote(foundNote || null);
    }
  }, [id, notes]);

  const handleSave = () => {
    router.back();
  };

  const handleDelete = async () => {
    if (!note) return;

    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteNote(note.id);
            router.back();
          } catch (error) {
            Alert.alert("Error", "Failed to delete note");
          }
        },
      },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text>Please sign in to view notes</Text>
      </View>
    );
  }

  console.log("note: ", JSON.stringify(note, null, 2));
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        {note && (
          <TouchableOpacity onPress={handleDelete}>
            <Text style={styles.deleteButton}>Delete{"  "}</Text>
          </TouchableOpacity>
        )}
      </View>

      <NoteForm
        noteId={note?.id}
        initialTitle={note?.title || ""}
        initialContent={note?.content || ""}
        onSave={handleSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    fontSize: 16,
    color: "#007AFF",
  },
  deleteButton: {
    fontSize: 16,
    color: "#ff4444",
  },
});
