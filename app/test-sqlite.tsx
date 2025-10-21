import sqliteService from "@/services/sqliteService";
import { Message } from "@/types/Message";
import React, { useState } from "react";
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function TestSQLiteScreen() {
  const [testMessage, setTestMessage] = useState("Hello SQLite!");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  // Test 1: Initialize SQLite
  const testInitialize = async () => {
    try {
      await sqliteService.initialize();
      console.log("✅ SQLite initialized");
      alert("SQLite initialized successfully!");
    } catch (error) {
      console.error("❌ Initialization failed:", error);
      alert("Initialization failed: " + error.message);
    }
  };

  // Test 2: Save a test message
  const testSaveMessage = async () => {
    try {
      const messageToSave: Message = {
        id: `test_${Date.now()}`,
        conversationId: "test_conversation",
        senderId: "test_user",
        text: testMessage, // Use the state variable here
        timestamp: new Date() as any,
        readBy: { test_user: new Date() as any },
        status: "sent",
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
      };

      await sqliteService.saveMessage(messageToSave);
      console.log("✅ Message saved");
      alert("Message saved successfully!");

      // Refresh stats
      await testGetStats();
    } catch (error) {
      console.error("❌ Save failed:", error);
      alert("Save failed: " + error.message);
    }
  };

  // Test 3: Search messages
  const testSearch = async () => {
    try {
      const searchResults = await sqliteService.searchMessages(searchQuery);
      setResults(searchResults);
      console.log("✅ Search results:", searchResults);
    } catch (error) {
      console.error("❌ Search failed:", error);
      alert("Search failed: " + error.message);
    }
  };

  // Test 4: Get database stats
  const testGetStats = async () => {
    try {
      const dbStats = await sqliteService.getStats();
      setStats(dbStats);
      console.log("✅ Stats:", dbStats);
    } catch (error) {
      console.error("❌ Stats failed:", error);
      alert("Stats failed: " + error.message);
    }
  };

  // Test 5: Queue a message (offline simulation)
  const testQueueMessage = async () => {
    try {
      const tempId = `temp_${Date.now()}`;
      await sqliteService.queueMessage(
        tempId,
        "test_conversation",
        "test_user",
        `Queued: ${testMessage}`
      );
      console.log("✅ Message queued");
      alert("Message queued successfully!");

      // Refresh stats
      await testGetStats();
    } catch (error) {
      console.error("❌ Queue failed:", error);
      alert("Queue failed: " + error.message);
    }
  };

  // Test 6: Clear all data
  const testClearData = async () => {
    try {
      await sqliteService.clearAllData();
      console.log("✅ Data cleared");
      alert("All data cleared!");

      // Refresh stats
      await testGetStats();
      setResults([]);
    } catch (error) {
      console.error("❌ Clear failed:", error);
      alert("Clear failed: " + error.message);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>SQLite Service Tests</Text>

      {/* Test 1: Initialize */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Initialize SQLite</Text>
        <Button title="Initialize Database" onPress={testInitialize} />
      </View>

      {/* Test 2: Save Message */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Save Test Message</Text>
        <TextInput
          style={styles.input}
          value={testMessage}
          onChangeText={setTestMessage}
          placeholder="Enter test message"
        />
        <Button title="Save Message" onPress={testSaveMessage} />
      </View>

      {/* Test 3: Search */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. Search Messages</Text>
        <TextInput
          style={styles.input}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Enter search query"
        />
        <Button title="Search" onPress={testSearch} />
        {results.length > 0 && (
          <View>
            <Text style={styles.resultsTitle}>Search Results:</Text>
            {results.map((result, index) => (
              <Text key={index} style={styles.resultItem}>
                {result.text} (Conv: {result.conversationId})
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Test 4: Queue Message */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>4. Queue Message (Offline)</Text>
        <Button title="Queue Message" onPress={testQueueMessage} />
      </View>

      {/* Test 5: Get Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>5. Database Stats</Text>
        <Button title="Get Stats" onPress={testGetStats} />
        {stats && (
          <Text style={styles.stats}>
            Messages: {stats.messages}, Conversations: {stats.conversations},
            Queued: {stats.queuedMessages}
          </Text>
        )}
      </View>

      {/* Test 6: Clear Data */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>6. Clear All Data</Text>
        <Button title="Clear Data" onPress={testClearData} color="red" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  section: {
    backgroundColor: "white",
    padding: 15,
    marginBottom: 15,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 10,
  },
  resultItem: {
    padding: 5,
    backgroundColor: "#f0f0f0",
    marginVertical: 2,
    borderRadius: 3,
  },
  stats: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "bold",
  },
});
