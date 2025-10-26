/**
 * @fileoverview Diagnostics Screen - A comprehensive suite of tools for debugging and testing.
 *
 * This screen is an essential internal tool for developers, providing a centralized
 * interface for monitoring the application's health and testing its core
 * functionalities. It is not intended for end-users but is included in development
 * and staging builds to facilitate troubleshooting.
 *
 * Key Features:
 * - **System Log Viewer**: Displays real-time, color-coded logs from the
 *   `loggerStore`, with support for filtering by log level, expanding metadata,
 *   and copying logs to the clipboard.
 * - **Connection Status**: Provides a live snapshot of the application's
 *   network state, including sync status, message queue counts, and any recent
 *   errors, sourced from the `connectionStore`.
 * - **API Tests**: Includes buttons to trigger test requests to the backend
 *   services, such as authentication checks and AI translations, helping to
 *   verify the integrity of the client-server communication.
 *
 * @see useLoggerStore for the log management and persistence.
 * @see useConnectionStore for the network and sync state.
 */

import translationService from "@/services/translationService";
import {
  connectionHelpers,
  useConnectionStore,
} from "@/stores/connectionStore";
import { logger, useLoggerStore } from "@/stores/loggerStore";
import { LogLevel } from "@/types/Log";
import { Message } from "@/types/Message";
import * as Clipboard from "expo-clipboard";
import { getAuth } from "firebase/auth";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * Diagnostics screen component
 *
 * Provides debugging tools and diagnostic information for
 * developers and troubleshooting.
 */
export default function DiagnosticsScreen() {
  // API Test Modal state
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [apiResponse, setApiResponse] = useState<string>("");
  const [apiLoading, setApiLoading] = useState(false);

  // Translation Test Modal state
  const [translateModalVisible, setTranslateModalVisible] = useState(false);
  const [translateResponse, setTranslateResponse] = useState<string>("");
  const [translateLoading, setTranslateLoading] = useState(false);

  // Enhanced Translation Test Modal state
  const [enhancedTranslateModalVisible, setEnhancedTranslateModalVisible] =
    useState(false);
  const [enhancedTranslateResponse, setEnhancedTranslateResponse] =
    useState<string>("");
  const [enhancedTranslateLoading, setEnhancedTranslateLoading] =
    useState(false);

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

  // API Test Function
  const testApiRequest = React.useCallback(async () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;

    if (!apiUrl) {
      Alert.alert(
        "Error",
        "EXPO_PUBLIC_API_URL environment variable is not set"
      );
      return;
    }

    setApiLoading(true);
    setApiModalVisible(true);
    setApiResponse("Loading...");

    try {
      // Step 1: Get the current user's Firebase ID token
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error("User not signed in");
      }

      logger.info("api", `🔐 Getting Firebase ID token for user: ${user.uid}`);
      const idToken = await user.getIdToken(); // Signed JWT

      logger.info(
        "api",
        `🌐 Making authenticated GET request to: ${apiUrl}/auth/check`
      );

      // Step 2: Call the Lambda endpoint with authentication
      const response = await fetch(`${apiUrl}/auth/check`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      logger.info("api", `✅ API Response (${response.status}):`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseData,
      });

      // Step 3: Handle response
      let responseDisplay = `Status: ${response.status} ${
        response.statusText
      }\n\nHeaders:\n${JSON.stringify(
        Object.fromEntries(response.headers.entries()),
        null,
        2
      )}\n\nBody:\n${JSON.stringify(responseData, null, 2)}`;

      if (responseData && typeof responseData === "object") {
        if (responseData.authenticated) {
          responseDisplay += `\n\n✅ Verified user: ${responseData.uid}`;
        } else {
          responseDisplay += `\n\n⚠️ User not authenticated: ${
            responseData.error || "Unknown error"
          }`;
        }
      }

      setApiResponse(responseDisplay);
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("api", `❌ Auth check failed:`, {
        error: errorMessage,
        url: `${apiUrl}/auth/check`,
      });
      setApiResponse(`Error: ${errorMessage}`);
    } finally {
      setApiLoading(false);
    }
  }, [logger]);

  // Translation Test Function
  const testTranslationRequest = React.useCallback(async () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;

    if (!apiUrl) {
      Alert.alert(
        "Error",
        "EXPO_PUBLIC_API_URL environment variable is not set"
      );
      return;
    }

    setTranslateLoading(true);
    setTranslateModalVisible(true);
    setTranslateResponse("Loading...");

    try {
      // Step 1: Get the current user's Firebase ID token
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error("User not signed in");
      }

      logger.info("api", `🔐 Getting Firebase ID token for user: ${user.uid}`);
      const idToken = await user.getIdToken(); // Signed JWT

      // Sample French text for translation
      const requestBody = {
        language: "English",
        content:
          "Bonjour, comment allez-vous aujourd'hui ? J'espère que vous passez une excellente journée. Le temps est magnifique, n'est-ce pas ?",
      };

      logger.info("api", `🌐 Making POST request to: ${apiUrl}/translate`);

      // Step 2: Call the translation endpoint
      const response = await fetch(`${apiUrl}/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      logger.info("api", `✅ Translation Response (${response.status}):`, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseData,
      });

      // Step 3: Handle response
      let responseDisplay = `Status: ${response.status} ${
        response.statusText
      }\n\nHeaders:\n${JSON.stringify(
        Object.fromEntries(response.headers.entries()),
        null,
        2
      )}\n\nBody:\n${JSON.stringify(responseData, null, 2)}`;

      if (responseData && typeof responseData === "object") {
        if (responseData.translated_text) {
          responseDisplay += `\n\n✅ Translation successful!`;
          responseDisplay += `\n\nOriginal (${responseData.original_language}): ${responseData.original_text}`;
          responseDisplay += `\n\nTranslated (${responseData.target_language}): ${responseData.translated_text}`;
          if (responseData.cultural_notes) {
            responseDisplay += `\n\nCultural Notes: ${responseData.cultural_notes}`;
          }
        } else {
          responseDisplay += `\n\n⚠️ Translation failed: ${
            responseData.error || "Unknown error"
          }`;
        }
      }

      setTranslateResponse(responseDisplay);
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("api", `❌ Translation request failed:`, {
        error: errorMessage,
        url: `${apiUrl}/translate`,
      });
      setTranslateResponse(`Error: ${errorMessage}`);
    } finally {
      setTranslateLoading(false);
    }
  }, [logger]);

  // Enhanced Translation Test Function
  const testEnhancedTranslationRequest = React.useCallback(async () => {
    setEnhancedTranslateLoading(true);
    setEnhancedTranslateModalVisible(true);
    setEnhancedTranslateResponse("Loading...");

    try {
      // Create a mock message for testing
      const mockMessage: Message = {
        id: "test-message-123",
        conversationId: "test-conversation",
        senderId: "test-sender",
        text: "いや、マジで草www", // Japanese slang that should trigger tool_call
        timestamp: { toMillis: () => Date.now() } as any,
        status: "sent",
        readBy: {},
        createdAt: { toMillis: () => Date.now() } as any,
        updatedAt: { toMillis: () => Date.now() } as any,
      };

      // Create mock conversation history
      const mockHistory: Message[] = [
        {
          id: "history-1",
          conversationId: "test-conversation",
          senderId: "test-sender",
          text: "teach me more slang",
          timestamp: { toMillis: () => Date.now() - 10000 } as any,
          status: "sent",
          readBy: {},
          createdAt: { toMillis: () => Date.now() - 10000 } as any,
          updatedAt: { toMillis: () => Date.now() - 10000 } as any,
        },
        {
          id: "history-2",
          conversationId: "test-conversation",
          senderId: "test-sender",
          text: "最近Rikaの英語すごい上手",
          timestamp: { toMillis: () => Date.now() - 5000 } as any,
          status: "sent",
          readBy: {},
          createdAt: { toMillis: () => Date.now() - 5000 } as any,
          updatedAt: { toMillis: () => Date.now() - 5000 } as any,
        },
      ];

      logger.info(
        "enhanced-translation",
        "🧪 Starting enhanced translation test",
        {
          messageText: mockMessage.text,
          historyLength: mockHistory.length,
        }
      );

      // Test the enhanced translation service
      const translation = await translationService.translateMessageWithGraph(
        mockMessage,
        "English",
        mockHistory
      );

      logger.info("enhanced-translation", "✅ Enhanced translation completed", {
        originalLanguage: translation.originalLanguage,
        translatedText: translation.translatedText,
        hasCulturalNotes: !!translation.culturalNotes,
      });

      let responseDisplay = `Enhanced Translation Test Results:\n\n`;
      responseDisplay += `Original Language: ${translation.originalLanguage}\n`;
      responseDisplay += `Translated Text: ${translation.translatedText}\n`;
      if (translation.culturalNotes) {
        responseDisplay += `Cultural Notes: ${translation.culturalNotes}\n`;
      }
      responseDisplay += `\nMessage ID: ${translation.messageId}\n`;
      responseDisplay += `Language: ${translation.language}\n`;
      responseDisplay += `Cached At: ${new Date(
        translation.createdAt
      ).toISOString()}\n\n`;
      responseDisplay += `✅ Enhanced translation with LangGraph orchestration successful!`;

      setEnhancedTranslateResponse(responseDisplay);
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        "enhanced-translation",
        "❌ Enhanced translation test failed:",
        {
          error: errorMessage,
        }
      );
      setEnhancedTranslateResponse(`Error: ${errorMessage}`);
    } finally {
      setEnhancedTranslateLoading(false);
    }
  }, [logger]);

  return (
    <ScrollView style={styles.container}>
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

      {/* API Test Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌐 API Tests</Text>
        <Text style={styles.helpText}>
          Test authenticated API endpoints with Firebase ID token:
          {"\n"}• Auth Check: GET /auth/check
          {"\n"}• Translation: POST /translate (French → English)
        </Text>

        <Button
          title="🔐 Test Auth API"
          onPress={testApiRequest}
          color="blue"
        />

        <Button
          title="🌍 Test Translation API"
          onPress={testTranslationRequest}
          color="green"
        />

        <Button
          title="🚀 Test Enhanced Translation (LangGraph)"
          onPress={testEnhancedTranslationRequest}
          color="purple"
        />
      </View>

      {/* API Response Modal */}
      <Modal
        visible={apiModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setApiModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Auth API Response</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setApiModalVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.apiResponseText}>
                {apiLoading ? "Loading..." : apiResponse}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Translation Response Modal */}
      <Modal
        visible={translateModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTranslateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Translation API Response</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setTranslateModalVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.apiResponseText}>
                {translateLoading ? "Loading..." : translateResponse}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Enhanced Translation Response Modal */}
      <Modal
        visible={enhancedTranslateModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEnhancedTranslateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Enhanced Translation (LangGraph) Response
              </Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setEnhancedTranslateModalVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.apiResponseText}>
                {enhancedTranslateLoading
                  ? "Loading..."
                  : enhancedTranslateResponse}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    margin: 20,
    maxHeight: "80%",
    width: "90%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#212529",
  },
  modalCloseButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f8f9fa",
  },
  modalCloseButtonText: {
    fontSize: 16,
    color: "#6c757d",
    fontWeight: "bold",
  },
  modalBody: {
    padding: 20,
    maxHeight: 400,
  },
  apiResponseText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#212529",
    lineHeight: 16,
  },
});
