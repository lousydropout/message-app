import sqliteService from "@/services/sqliteService";
import {
  connectionHelpers,
  useConnectionStore,
} from "@/stores/connectionStore";
import { useLoggerStore } from "@/stores/loggerStore";
import { LogLevel } from "@/types/Log";
import { Message } from "@/types/Message";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function DiagnosticsScreen() {
  const [testMessage, setTestMessage] = useState("Hello SQLite!");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [indexes, setIndexes] = useState<string[]>([]);

  // Logs state
  const [selectedLogLevel, setSelectedLogLevel] = useState<
    LogLevel | "verbose"
  >("verbose");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Logger store
  const { logs, loadLogs, clearLogs } = useLoggerStore();

  // ScrollView ref for auto-scroll to bottom
  const logsScrollViewRef = useRef<ScrollView>(null);

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

  // Load logs on component mount
  useEffect(() => {
    loadLogs();
  }, []); // Empty dependency array - only run once on mount

  // Helper functions for logs
  const getLogLevelColor = (level: LogLevel): string => {
    switch (level) {
      case "error":
        return "#d32f2f";
      case "warning":
        return "#f57c00";
      case "info":
        return "#0288d1";
      case "debug":
        return "#6c757d";
      default:
        return "#6c757d";
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const filteredLogs = logs
    .filter((log) => {
      if (selectedLogLevel === "verbose") return true;
      const levelOrder = ["debug", "info", "warning", "error"];
      const selectedIndex = levelOrder.indexOf(selectedLogLevel);
      const logIndex = levelOrder.indexOf(log.level);
      return logIndex >= selectedIndex;
    })
    .reverse(); // Reverse to show newest at bottom

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (logsScrollViewRef.current && filteredLogs.length > 0) {
      setTimeout(() => {
        logsScrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [filteredLogs]);

  const toggleLogExpansion = (logId: string) => {
    setExpandedLogs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const handleClearLogs = React.useCallback(async () => {
    try {
      await clearLogs();
      alert("All logs cleared successfully!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      alert("Failed to clear logs: " + errorMessage);
    }
  }, [clearLogs]);

  const handleLoadLogs = React.useCallback(async () => {
    try {
      await loadLogs(
        100,
        selectedLogLevel === "verbose" ? undefined : selectedLogLevel
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      alert("Failed to load logs: " + errorMessage);
    }
  }, [loadLogs, selectedLogLevel]);

  const handleCopyLogs = React.useCallback(async () => {
    try {
      const logsText = filteredLogs
        .map((log) => {
          const timestamp = formatTimestamp(log.timestamp);
          const metadata = log.metadata
            ? `\n  Metadata: ${JSON.stringify(log.metadata)}`
            : "";
          return `[${timestamp}] ${log.level.toUpperCase()} [${log.category}] ${
            log.message
          }${metadata}`;
        })
        .join("\n\n");

      await Clipboard.setStringAsync(logsText);
      Alert.alert("Success", "Logs copied to clipboard!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", "Failed to copy logs: " + errorMessage);
    }
  }, [filteredLogs]);
  const testInitialize = React.useCallback(async () => {
    try {
      await sqliteService.initialize();
      console.log("✅ SQLite initialized");
      alert("SQLite initialized successfully!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Initialization failed:", error);
      alert("Initialization failed: " + errorMessage);
    }
  }, []);

  // Test 2: Save a test message
  const testSaveMessage = React.useCallback(async () => {
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Save failed:", error);
      alert("Save failed: " + errorMessage);
    }
  }, [testMessage]);

  // Test 3: Search messages
  const testSearch = React.useCallback(async () => {
    try {
      const searchResults = await sqliteService.searchMessages(searchQuery);
      setResults(searchResults);
      console.log("✅ Search results:", searchResults);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Search failed:", error);
      alert("Search failed: " + errorMessage);
    }
  }, [searchQuery]);

  // Test 4: Get database stats
  const testGetStats = React.useCallback(async () => {
    try {
      const dbStats = await sqliteService.getStats();
      setStats(dbStats);
      console.log("✅ Stats:", dbStats);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Stats failed:", error);
      alert("Stats failed: " + errorMessage);
    }
  }, []);

  // Test 5: Queue a message (offline simulation)
  const testQueueMessage = React.useCallback(async () => {
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Queue failed:", error);
      alert("Queue failed: " + errorMessage);
    }
  }, [testMessage]);

  // Test 6: Clear all data
  const testClearData = React.useCallback(async () => {
    try {
      await sqliteService.clearAllData();
      console.log("✅ Data cleared");
      alert("All data cleared!");

      // Refresh stats
      await testGetStats();
      setResults([]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Clear failed:", error);
      alert("Clear failed: " + errorMessage);
    }
  }, [testGetStats]);

  // Test 7: Connection Store Actions
  const testConnectionActions = React.useCallback(() => {
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
  }, []);

  // Refresh queue counts
  const refreshQueueCounts = React.useCallback(async () => {
    try {
      const { refreshQueueCounts } = useConnectionStore.getState();
      await refreshQueueCounts();
      alert("Queue counts refreshed!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      alert("Failed to refresh queue counts: " + errorMessage);
    }
  }, []);

  // Test 8: Helper Functions
  const testHelperFunctions = React.useCallback(() => {
    const helpers = connectionHelpers;

    console.log("Should sync:", helpers.shouldSync());
    console.log("Is healthy:", helpers.isHealthy());
    console.log("Should queue:", helpers.shouldQueueMessages());
    console.log("Retry delay:", helpers.getRetryDelay(3));
    console.log("Network emoji:", helpers.getNetworkEmoji());
    console.log("Sync emoji:", helpers.getSyncEmoji());
    console.log("Summary:", helpers.getConnectionSummary());

    alert("Check console for helper function results!");
  }, []);

  // Test 9: Update Database Indexes
  const testUpdateIndexes = React.useCallback(async () => {
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Index update failed:", error);
      alert("Index update failed: " + errorMessage);
    }
  }, [testGetStats]);

  // Test 10: Get Database Indexes
  const testGetIndexes = React.useCallback(async () => {
    try {
      const dbIndexes = await sqliteService.getIndexes();
      setIndexes(dbIndexes);
      console.log("✅ Indexes:", dbIndexes);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Get indexes failed:", error);
      alert("Get indexes failed: " + errorMessage);
    }
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Diagnostics</Text>

      {/* System Logs Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 System Logs</Text>

        {/* Log Level Filter Buttons */}
        <View style={styles.filterButtons}>
          {(["error", "warning", "info", "verbose"] as const).map((level) => (
            <TouchableOpacity
              key={level}
              style={[
                styles.filterButton,
                selectedLogLevel === level && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedLogLevel(level)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selectedLogLevel === level && styles.filterButtonTextActive,
                ]}
              >
                {level === "verbose"
                  ? "Verbose"
                  : level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Log Actions */}
        <View style={styles.logActions}>
          <Button title="Refresh Logs" onPress={handleLoadLogs} />
          <Button title="Copy Logs" onPress={handleCopyLogs} />
          <Button
            title="Clear All Logs"
            onPress={handleClearLogs}
            color="red"
          />
        </View>

        {/* Logs List */}
        <ScrollView
          ref={logsScrollViewRef}
          style={styles.logsContainer}
          nestedScrollEnabled
        >
          {filteredLogs.length === 0 ? (
            <Text style={styles.noLogsText}>No logs found</Text>
          ) : (
            filteredLogs.map((log) => (
              <View key={log.id} style={styles.logItem}>
                <TouchableOpacity
                  style={styles.logHeader}
                  onPress={() => toggleLogExpansion(log.id)}
                >
                  <View style={styles.logInfo}>
                    <Text style={styles.logTimestamp}>
                      {formatTimestamp(log.timestamp)}
                    </Text>
                    <View
                      style={[
                        styles.logLevelBadge,
                        { backgroundColor: getLogLevelColor(log.level) },
                      ]}
                    >
                      <Text style={styles.logLevelText}>
                        {log.level.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.logCategoryBadge}>
                      <Text style={styles.logCategoryText}>{log.category}</Text>
                    </View>
                  </View>
                  {log.metadata && (
                    <View style={styles.expandButton}>
                      <Text style={styles.expandButtonText}>
                        {expandedLogs.has(log.id) ? "▼" : "▶"}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.logMessage}>{log.message}</Text>
                {log.metadata && expandedLogs.has(log.id) && (
                  <View style={styles.logMetadata}>
                    <Text style={styles.logMetadataText}>
                      {JSON.stringify(log.metadata, null, 2)}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>

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
        <Button
          title="Refresh Queue Counts"
          onPress={refreshQueueCounts}
          color="blue"
        />
        <Text style={styles.helpText}>
          Test Actions: Manual status changes, sync states, errors, and queue
          counts over 6 seconds.
        </Text>
        <Text style={styles.helpText}>
          Refresh Queue: Updates queue counts from SQLite database.
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
          Creates/updates all performance indexes including the new composite
          indexes: • Messages: (conversationId, id), (conversationId,
          updatedAt), (conversationId, id, updatedAt) • Conversations: (type),
          (type, updatedAt) • Queued Messages: (conversationId, timestamp),
          (retryCount)
        </Text>
      </View>

      {/* Test 10: Show Database Indexes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>10. Show Database Indexes</Text>
        <Button title="Get Indexes" onPress={testGetIndexes} />
        {indexes.length > 0 && (
          <View>
            <Text style={styles.resultsTitle}>
              Current Indexes ({indexes.length}):
            </Text>
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
  // Log styles
  filterButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "#e9ecef",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dee2e6",
  },
  filterButtonActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#495057",
  },
  filterButtonTextActive: {
    color: "#ffffff",
  },
  logActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  logsContainer: {
    maxHeight: 300,
    borderWidth: 1,
    borderColor: "#dee2e6",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  noLogsText: {
    textAlign: "center",
    padding: 20,
    color: "#6c757d",
    fontStyle: "italic",
  },
  logItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f8f9fa",
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  logInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logTimestamp: {
    fontSize: 12,
    color: "#6c757d",
    marginRight: 8,
    fontFamily: "monospace",
  },
  logLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  logLevelText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#ffffff",
  },
  logCategoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#e9ecef",
    borderRadius: 4,
    marginRight: 6,
  },
  logCategoryText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#495057",
  },
  expandButton: {
    padding: 4,
  },
  expandButtonText: {
    fontSize: 12,
    color: "#6c757d",
  },
  logMessage: {
    fontSize: 14,
    color: "#212529",
    lineHeight: 18,
  },
  logMetadata: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#f8f9fa",
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  logMetadataText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: "#495057",
  },
});
