import sqliteService from "@/services/sqliteService";
import {
  connectionHelpers,
  useConnectionStore,
} from "@/stores/connectionStore";
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
  const [indexes, setIndexes] = useState<string[]>([]);

  // Connection store state
  const {
    isOnline,
    connectionStatus,
    networkType,
    syncStatus,
    isSyncing,
    queuedMessagesCount,
    failedMessagesCount,
    syncStats,
    lastError,
  } = useConnectionStore();

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

  // Test 7: Connection Store Actions
  const testConnectionActions = () => {
    const {
      setOnline,
      setSyncStatus,
      setError,
      clearError,
      updateQueueCounts,
    } = useConnectionStore.getState();

    // Test manual offline
    setOnline(false);
    setTimeout(() => {
      // Test manual online
      setOnline(true);
    }, 2000);

    // Test sync status changes
    setTimeout(() => {
      setSyncStatus("syncing");
    }, 1000);

    setTimeout(() => {
      setSyncStatus("synced");
    }, 3000);

    // Test error handling
    setTimeout(() => {
      setError("Test error message");
    }, 4000);

    setTimeout(() => {
      clearError();
    }, 6000);

    // Test queue counts
    setTimeout(() => {
      updateQueueCounts(5, 2);
    }, 5000);

    alert("Connection store actions started - watch the status!");
  };

  // Test 8: Helper Functions
  const testHelperFunctions = () => {
    const helpers = connectionHelpers;

    console.log("Should sync:", helpers.shouldSync());
    console.log("Is healthy:", helpers.isHealthy());
    console.log("Should queue:", helpers.shouldQueueMessages());
    console.log("Retry delay:", helpers.getRetryDelay(3));
    console.log("Network emoji:", helpers.getNetworkEmoji());
    console.log("Sync emoji:", helpers.getSyncEmoji());
    console.log("Summary:", helpers.getConnectionSummary());

    alert("Check console for helper function results!");
  };

  // Test 9: Update Database Indexes
  const testUpdateIndexes = async () => {
    try {
      console.log("🔄 Updating database indexes...");
      
      // Call the initialize method which will create all indexes
      await sqliteService.initialize();
      
      console.log("✅ All indexes updated successfully!");
      alert("Database indexes updated successfully!");
      
      // Refresh stats and indexes to show updated info
      await testGetStats();
      await testGetIndexes();
    } catch (error) {
      console.error("❌ Index update failed:", error);
      alert("Index update failed: " + error.message);
    }
  };

  // Test 10: Get Database Indexes
  const testGetIndexes = async () => {
    try {
      const dbIndexes = await sqliteService.getIndexes();
      setIndexes(dbIndexes);
      console.log("✅ Indexes:", dbIndexes);
    } catch (error) {
      console.error("❌ Get indexes failed:", error);
      alert("Get indexes failed: " + error.message);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>SQLite Service Tests</Text>

      {/* Connection Status Display */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌐 Connection Status</Text>
        <Text style={styles.statusText}>
          Status: {connectionHelpers.getNetworkEmoji()} {connectionStatus} (
          {networkType})
        </Text>
        <Text style={styles.statusText}>
          Sync: {connectionHelpers.getSyncEmoji()} {syncStatus}{" "}
          {isSyncing ? "(Syncing...)" : ""}
        </Text>
        <Text style={styles.statusText}>
          Queue: {queuedMessagesCount} queued, {failedMessagesCount} failed
        </Text>
        <Text style={styles.statusText}>
          Stats: {syncStats.messagesSynced} synced, {syncStats.retryCount}{" "}
          retries
        </Text>
        {lastError && <Text style={styles.errorText}>Error: {lastError}</Text>}
        <Text style={styles.statusText}>
          Summary: {connectionHelpers.getConnectionSummary()}
        </Text>
      </View>
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

      {/* Test 7: Connection Store Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>7. Connection Store Actions</Text>
        <Button
          title="Test Connection Actions"
          onPress={testConnectionActions}
        />
        <Text style={styles.helpText}>
          This will test manual status changes, sync states, errors, and queue
          counts over 6 seconds.
        </Text>
      </View>

      {/* Test 8: Helper Functions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>8. Helper Functions</Text>
        <Button title="Test Helper Functions" onPress={testHelperFunctions} />
        <Text style={styles.helpText}>
          Check console for helper function results (should sync, is healthy,
          etc.)
        </Text>
      </View>

      {/* Test 9: Update Database Indexes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>9. Update Database Indexes</Text>
        <Button title="Update All Indexes" onPress={testUpdateIndexes} />
        <Text style={styles.helpText}>
          Creates/updates all performance indexes including the new composite indexes:
          • Messages: (conversationId, id), (conversationId, updatedAt), (conversationId, id, updatedAt)
          • Conversations: (type), (type, updatedAt)
          • Queued Messages: (conversationId, timestamp), (retryCount)
        </Text>
      </View>

      {/* Test 10: Show Database Indexes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>10. Show Database Indexes</Text>
        <Button title="Get Indexes" onPress={testGetIndexes} />
        {indexes.length > 0 && (
          <View>
            <Text style={styles.resultsTitle}>Current Indexes ({indexes.length}):</Text>
            {indexes.map((index, idx) => (
              <Text key={idx} style={styles.resultItem}>
                {index}
              </Text>
            ))}
          </View>
        )}
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
  statusText: {
    fontSize: 14,
    marginVertical: 2,
    color: "#333",
  },
  errorText: {
    fontSize: 14,
    marginVertical: 2,
    color: "#d32f2f",
    fontWeight: "bold",
  },
  helpText: {
    fontSize: 12,
    marginTop: 5,
    color: "#666",
    fontStyle: "italic",
  },
});
