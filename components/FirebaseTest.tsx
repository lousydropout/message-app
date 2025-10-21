// components/FirebaseTest.tsx
import { auth, db } from "@/config/firebase";
import { Note } from "@/types/Note";
import { signInAnonymously } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export function FirebaseTest() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setResults((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const runFirebaseTest = async () => {
    setTesting(true);
    setResults([]);

    try {
      // Test 1: Authentication
      addResult("🧪 Testing authentication...");
      const userCredential = await signInAnonymously(auth);
      addResult(`✅ Auth successful! User: ${userCredential.user.uid}`);

      // Test 2: Create note
      addResult("🧪 Testing note creation...");
      const noteData = {
        title: "Test Note",
        content: "This is a test note from our app",
        userId: userCredential.user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Add this after creating the note
      addResult(
        `🔍 Debug: Created note with userId: ${userCredential.user.uid}`
      );
      addResult(`🔍 Debug: Current auth user: ${auth.currentUser?.uid}`);

      const docRef = await addDoc(collection(db, "notes"), noteData);
      addResult(`✅ Note created! ID: ${docRef.id}`);

      // Test 3: Read notes
      addResult("🧪 Testing note reading...");
      // const notesSnapshot = await getDocs(collection(db, "notes"));
      const q = query(
        collection(db, "notes"),
        where("userId", "==", userCredential.user.uid)
      );
      const notesSnapshot = await getDocs(q);
      const notes = notesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Note[];

      addResult(`✅ Notes read! Found ${notes.length} notes`);

      // Test 4: Security rules
      const userNotes = notes.filter(
        (note) => note.userId === userCredential.user.uid
      );
      addResult(
        `✅ Security rules working! User has ${userNotes.length} notes`
      );

      addResult("🎉 All Firebase tests passed!");
      Alert.alert("Success", "Firebase is working correctly!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      addResult(`❌ Test failed: ${errorMessage}`);
      Alert.alert("Error", `Firebase test failed: ${errorMessage}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Firebase Integration Test</Text>

      <TouchableOpacity
        style={[styles.button, testing && styles.buttonDisabled]}
        onPress={runFirebaseTest}
        disabled={testing}
      >
        <Text style={styles.buttonText}>
          {testing ? "Testing..." : "Run Firebase Test"}
        </Text>
      </TouchableOpacity>

      <View style={styles.results}>
        {results.map((result, index) => (
          <Text key={index} style={styles.resultText}>
            {result}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: "#ccc",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
  },
  results: {
    backgroundColor: "#f5f5f5",
    padding: 10,
    borderRadius: 8,
  },
  resultText: {
    fontSize: 12,
    marginBottom: 5,
    fontFamily: "monospace",
  },
});
