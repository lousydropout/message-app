// components/NotesList.tsx
import { useAuthStore } from "@/stores/authStore";
import { useNotesStore } from "@/stores/notesStore";
import { type Note } from "@/types/Note";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export function NotesList() {
  const { user, signIn } = useAuthStore();
  const { notes, loading, subscribeToNotes, deleteNote } = useNotesStore();

  useEffect(() => {
    if (user) {
      const unsubscribe = subscribeToNotes(user.uid);
      return unsubscribe;
    }
  }, [user, subscribeToNotes]);

  const handleDeleteNote = async (noteId: string) => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteNote(noteId);
          } catch (error) {
            Alert.alert("Error", "Failed to delete note");
          }
        },
      },
    ]);
  };

  const renderNote = ({ item }: { item: Note }) => (
    <TouchableOpacity style={styles.noteCard}>
      <Text
        style={styles.noteTitle}
        onPress={() => router.push(`/note/${item.id}`)}
      >
        {item.title}
      </Text>
      <Text style={styles.noteContent} numberOfLines={3}>
        {item.content}
      </Text>
      <Text style={styles.noteDate}>
        {item.updatedAt instanceof Date
          ? item.updatedAt.toLocaleDateString()
          : "No date"}
      </Text>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteNote(item.id)}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // Add floating action button:
  <View style={styles.container}>
    <Text style={styles.header}>My Notes ({notes.length})</Text>
    <FlatList
      data={notes}
      renderItem={renderNote}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContainer}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No notes yet!</Text>
          <Text style={styles.emptySubtext}>Create your first note</Text>
        </View>
      }
    />

    {/* Floating Action Button */}
    <TouchableOpacity
      style={styles.fab}
      onPress={() => router.push("/note/new")}
    >
      <Text style={styles.fabText}>+</Text>
    </TouchableOpacity>
  </View>;
  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.welcomeText}>Welcome to Notes!</Text>
        <TouchableOpacity style={styles.signInButton} onPress={signIn}>
          <Text style={styles.signInButtonText}>Sign In to Continue</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading notes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Notes ({notes.length})</Text>
      <FlatList
        data={notes}
        renderItem={renderNote}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No notes yet!</Text>
            <Text style={styles.emptySubtext}>Create your first note</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  signInButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  signInButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  header: {
    fontSize: 20,
    fontWeight: "bold",
    padding: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  listContainer: {
    padding: 10,
  },
  noteCard: {
    backgroundColor: "white",
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  noteContent: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
  },
  noteDate: {
    fontSize: 12,
    color: "#999",
    marginBottom: 10,
  },
  deleteButton: {
    backgroundColor: "#ff4444",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
    alignSelf: "flex-start",
  },
  deleteButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#666",
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
  },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    fontSize: 24,
    color: "white",
    fontWeight: "bold",
  },
});
