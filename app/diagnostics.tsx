import conversationService from "@/services/conversationService";
import friendService from "@/services/friendService";
import messageService from "@/services/messageService";
import sqliteService from "@/services/sqliteService";
import userService from "@/services/userService";
import { useAuthStore } from "@/stores/authStore";
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

  // API Test Modal state
  const [apiModalVisible, setApiModalVisible] = useState(false);
  const [apiResponse, setApiResponse] = useState<string>("");
  const [apiLoading, setApiLoading] = useState(false);

  // Translation Test Modal state
  const [translateModalVisible, setTranslateModalVisible] = useState(false);
  const [translateResponse, setTranslateResponse] = useState<string>("");
  const [translateLoading, setTranslateLoading] = useState(false);

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

  // Firestore CRUD Tests
  const testFirestoreCRUD = React.useCallback(async () => {
    const { user } = useAuthStore.getState();
    if (!user) {
      alert("❌ Not authenticated - please log in first");
      return;
    }

    try {
      logger.info(
        "firestore",
        `🧪 Starting Firestore CRUD tests for user: ${user.uid}`
      );

      // Test 1: Read user profile
      logger.info(
        "firestore",
        "📖 Testing: READ operation on USERS collection"
      );
      logger.info(
        "firestore",
        `🔍 Operation: READ | Collection: users | Document: ${user.uid} | Method: getUserProfile()`
      );
      try {
        const userProfile = await userService.getUserProfile(user.uid);
        logger.info(
          "firestore",
          `✅ READ users/${user.uid} SUCCESS: ${
            userProfile?.displayName || "No name"
          }`
        );
      } catch (error: any) {
        logger.error("firestore", `❌ READ users/${user.uid} FAILED:`, {
          operation: "READ",
          collection: "users",
          document: user.uid,
          method: "getUserProfile",
          error: error.message,
          code: error.code,
          userId: user?.uid,
        });
        throw error;
      }

      // Test 2: Create conversation
      logger.info(
        "firestore",
        "📝 Testing: CREATE operation on CONVERSATIONS collection"
      );
      logger.info(
        "firestore",
        `🔍 Operation: CREATE | Collection: conversations | Participants: [${user.uid}, test_user_2] | Method: createConversation()`
      );
      let conversationId: string;
      try {
        conversationId = await conversationService.createConversation(
          [user.uid, "test_user_2"],
          "direct"
        );
        logger.info(
          "firestore",
          `✅ CREATE conversations/${conversationId} SUCCESS`
        );
      } catch (error: any) {
        logger.error("firestore", `❌ CREATE conversations FAILED:`, {
          operation: "CREATE",
          collection: "conversations",
          participants: [user.uid, "test_user_2"],
          method: "createConversation",
          error: error.message,
          code: error.code,
          userId: user?.uid,
        });
        throw error;
      }

      // Test 3: Read conversation
      logger.info(
        "firestore",
        "📖 Testing: READ operation on CONVERSATIONS collection"
      );
      logger.info(
        "firestore",
        `🔍 Operation: READ | Collection: conversations | Document: ${conversationId} | Method: getConversation()`
      );
      try {
        const conversation = await conversationService.getConversation(
          conversationId
        );
        logger.info(
          "firestore",
          `✅ READ conversations/${conversationId} SUCCESS: ${
            conversation?.type || "No type"
          }`
        );
      } catch (error: any) {
        logger.error(
          "firestore",
          `❌ READ conversations/${conversationId} FAILED:`,
          {
            operation: "READ",
            collection: "conversations",
            document: conversationId,
            method: "getConversation",
            error: error.message,
            code: error.code,
            userId: user?.uid,
          }
        );
        throw error;
      }

      // Test 4: Create message
      logger.info(
        "firestore",
        "📝 Testing: CREATE operation on MESSAGES subcollection"
      );
      const messageId = `test_${Date.now()}`;
      logger.info(
        "firestore",
        `🔍 Operation: CREATE | Collection: conversations/${conversationId}/messages | Document: ${messageId} | Method: sendMessage()`
      );
      try {
        const message = await messageService.sendMessage(
          messageId,
          conversationId,
          user.uid,
          "Test message from diagnostics"
        );
        logger.info(
          "firestore",
          `✅ CREATE conversations/${conversationId}/messages/${messageId} SUCCESS`
        );
      } catch (error: any) {
        logger.error(
          "firestore",
          `❌ CREATE conversations/${conversationId}/messages/${messageId} FAILED:`,
          {
            operation: "CREATE",
            collection: "conversations/{conversationId}/messages",
            document: messageId,
            conversationId: conversationId,
            method: "sendMessage",
            error: error.message,
            code: error.code,
            userId: user?.uid,
          }
        );
        throw error;
      }

      // Test 5: Read messages (subscription test)
      logger.info(
        "firestore",
        "📖 Testing: READ operation on MESSAGES subcollection (subscription)"
      );
      logger.info(
        "firestore",
        `🔍 Operation: READ | Collection: conversations/${conversationId}/messages | Method: subscribeToMessages()`
      );
      const unsubscribe = messageService.subscribeToMessages(
        conversationId,
        (messages) => {
          logger.info(
            "firestore",
            `✅ READ conversations/${conversationId}/messages (subscription) SUCCESS: ${messages.length} messages`
          );
        }
      );

      // Clean up after 2 seconds
      setTimeout(() => {
        unsubscribe();
        logger.info("firestore", "🧹 Messages subscription cleaned up");
      }, 2000);

      alert("✅ Firestore CRUD tests completed - check logs for details!");
    } catch (error: any) {
      logger.error("firestore", "❌ Firestore CRUD test FAILED:", {
        error: error.message,
        code: error.code,
        userId: user?.uid,
        operation: "CRUD_TEST_SUITE_FAILED",
        collections: [
          "users",
          "conversations",
          "messages",
          "conversations/{id}/typing",
        ],
        lastSuccessfulOperation:
          "Check logs above for last successful operation",
        note: "This error occurred during the CRUD test suite - check individual operation logs above to identify which specific operation failed",
      });
      alert(`❌ Firestore test failed: ${error.message}`);
    }
  }, [logger]);

  const testFirestorePermissions = React.useCallback(async () => {
    const { user } = useAuthStore.getState();
    if (!user) {
      alert("❌ Not authenticated - please log in first");
      return;
    }

    try {
      logger.info(
        "firestore",
        `🔐 Testing Firestore permissions for user: ${user.uid}`
      );

      // Test each collection with detailed logging
      const tests = [
        {
          name: "Read Users Collection",
          test: () => userService.getUserProfile(user.uid),
          collection: "users",
        },
        {
          name: "Read Conversations Collection",
          test: () => conversationService.getUserConversations(user.uid),
          collection: "conversations",
        },
        {
          name: "Create Friend Request",
          test: () => friendService.sendFriendRequest(user.uid, "test_user_2"),
          collection: "friendRequests",
        },
        {
          name: "Update Typing Status",
          test: async () => {
            // First create a conversation that includes the current user
            try {
              const conversationId =
                await conversationService.createConversation(
                  [user.uid, "test_user_2"],
                  "direct"
                );
              logger.info(
                "firestore",
                `✅ CREATE conversations/${conversationId} SUCCESS`
              );
              // Then update typing status
              return messageService.updateTypingStatus(
                conversationId,
                user.uid,
                true
              );
            } catch (error: any) {
              logger.error("firestore", `❌ Update typing status test FAILED:`);
              throw error;
            }
          },
          collection: "conversations/{conversationId}/typing",
        },
      ];

      for (const test of tests) {
        try {
          logger.info("firestore", `🔍 Testing: ${test.name}`);
          logger.info(
            "firestore",
            `🔍 Operation: ${
              test.name.includes("Read")
                ? "READ"
                : test.name.includes("Create")
                ? "CREATE"
                : "UNKNOWN"
            } | Collection: ${test.collection} | Method: ${test.name}`
          );
          const result = await test.test();
          logger.info("firestore", `✅ ${test.name} SUCCESS:`, {
            operation: test.name.includes("Read")
              ? "READ"
              : test.name.includes("Create")
              ? "CREATE"
              : "UNKNOWN",
            collection: test.collection,
            result:
              typeof result === "object" && result !== null
                ? Object.keys(result)
                : result,
          });
        } catch (error: any) {
          logger.error("firestore", `❌ ${test.name} FAILED:`, {
            operation: test.name.includes("Read")
              ? "READ"
              : test.name.includes("Create")
              ? "CREATE"
              : "UNKNOWN",
            collection: test.collection,
            error: error.message,
            code: error.code,
            userId: user.uid,
            method: test.name,
          });
        }
      }

      alert("🔐 Permission tests completed - check logs for detailed results!");
    } catch (error: any) {
      logger.error("firestore", "❌ Permission test failed:", error);
      alert(`❌ Permission test failed: ${error.message}`);
    }
  }, [logger]);

  const testFirestoreRules = React.useCallback(async () => {
    const { user } = useAuthStore.getState();
    if (!user) {
      alert("❌ Not authenticated - please log in first");
      return;
    }

    try {
      logger.info(
        "firestore",
        `📋 Testing Firestore rules for user: ${user.uid}`
      );

      // Test specific rule scenarios
      const ruleTests = [
        {
          name: "Users Read Rule",
          description: "Should allow reading any user profile",
          test: () => userService.getUserProfile("test_user_2"),
        },
        {
          name: "Users Write Rule",
          description: "Should only allow writing own profile",
          test: () =>
            userService.updateUserProfile(user.uid, {
              displayName: "Test Update",
            }),
        },
        {
          name: "Conversations Read Rule",
          description:
            "Should only allow reading conversations user participates in",
          test: () => conversationService.getUserConversations(user.uid),
        },
      ];

      for (const ruleTest of ruleTests) {
        try {
          logger.info("firestore", `📋 Testing rule: ${ruleTest.name}`);
          logger.info("firestore", `📝 Description: ${ruleTest.description}`);
          logger.info(
            "firestore",
            `🔍 Operation: ${
              ruleTest.name.includes("Read")
                ? "READ"
                : ruleTest.name.includes("Write")
                ? "WRITE"
                : "UNKNOWN"
            } | Collection: ${
              ruleTest.name.includes("Users")
                ? "users"
                : ruleTest.name.includes("Conversations")
                ? "conversations"
                : "unknown"
            } | Method: ${ruleTest.name}`
          );
          const result = await ruleTest.test();
          logger.info("firestore", `✅ Rule test PASSED: ${ruleTest.name}`);
        } catch (error: any) {
          logger.error("firestore", `❌ Rule test FAILED: ${ruleTest.name}`, {
            operation: ruleTest.name.includes("Read")
              ? "READ"
              : ruleTest.name.includes("Write")
              ? "WRITE"
              : "UNKNOWN",
            collection: ruleTest.name.includes("Users")
              ? "users"
              : ruleTest.name.includes("Conversations")
              ? "conversations"
              : "unknown",
            error: error.message,
            code: error.code,
            description: ruleTest.description,
            method: ruleTest.name,
          });
        }
      }

      alert("📋 Firestore rules tests completed - check logs for results!");
    } catch (error: any) {
      logger.error("firestore", "❌ Rules test failed:", error);
      alert(`❌ Rules test failed: ${error.message}`);
    }
  }, [logger]);

  const testFirestoreSubscription = React.useCallback(async () => {
    const { user } = useAuthStore.getState();
    if (!user) {
      alert("❌ Not authenticated - please log in first");
      return;
    }

    try {
      logger.info(
        "firestore",
        `📡 Testing Firestore subscription for user: ${user.uid}`
      );

      // Test conversation subscription
      logger.info(
        "firestore",
        "📡 Testing: READ operation on CONVERSATIONS collection (subscription)"
      );
      logger.info(
        "firestore",
        `🔍 Operation: READ | Collection: conversations | Query: where participants array-contains ${user.uid} | Method: subscribeToConversations()`
      );
      const unsubscribeConversations =
        conversationService.subscribeToConversations(
          user.uid,
          (conversations) => {
            logger.info(
              "firestore",
              `✅ READ conversations (subscription) SUCCESS: ${conversations.length} conversations`
            );
          }
        );

      // Test messages subscription with error handling
      logger.info(
        "firestore",
        "📡 Testing: READ operation on MESSAGES subcollection (subscription with error handling)"
      );
      const testConversationId = "test_conversation_subscription";

      // Create a test conversation first
      try {
        logger.info(
          "firestore",
          `🔍 Operation: CREATE | Collection: conversations | Participants: [${user.uid}] | Method: createConversation()`
        );
        const conversationId = await conversationService.createConversation(
          [user.uid],
          "direct"
        );
        logger.info(
          "firestore",
          `✅ CREATE conversations/${conversationId} SUCCESS`
        );

        // Now test subscription
        logger.info(
          "firestore",
          `🔍 Operation: READ | Collection: conversations/${conversationId}/messages | Method: subscribeToMessages()`
        );
        const unsubscribeMessages = messageService.subscribeToMessages(
          conversationId,
          (messages) => {
            logger.info(
              "firestore",
              `✅ READ messages (subscription) SUCCESS: ${messages.length} messages`
            );
          }
        );

        // Test typing subscription
        logger.info(
          "firestore",
          `🔍 Operation: READ | Collection: conversations/${conversationId}/typing | Query: where isTyping == true | Method: subscribeToTypingStatus()`
        );
        const unsubscribeTyping = messageService.subscribeToTypingStatus(
          conversationId,
          (typingUsers) => {
            logger.info(
              "firestore",
              `✅ READ typing (subscription) SUCCESS: ${typingUsers.length} typing users`
            );
          }
        );

        // Clean up after 3 seconds
        setTimeout(() => {
          unsubscribeMessages();
          unsubscribeTyping();
          unsubscribeConversations();
          logger.info("firestore", "🧹 All subscriptions cleaned up");
        }, 3000);

        alert("📡 Subscription tests started - check logs for results!");
      } catch (error: any) {
        logger.error("firestore", "❌ Subscription test failed:", {
          error: error.message,
          code: error.code,
          userId: user.uid,
        });
        alert(`❌ Subscription test failed: ${error.message}`);
      }
    } catch (error: any) {
      logger.error("firestore", "❌ Subscription test failed:", error);
      alert(`❌ Subscription test failed: ${error.message}`);
    }
  }, [logger]);

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

      {/* Firestore CRUD Tests Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔥 Firestore CRUD Tests</Text>
        <Text style={styles.helpText}>
          Test all Firestore operations to identify permission issues
        </Text>

        <Button
          title="🧪 Test All CRUD Operations"
          onPress={testFirestoreCRUD}
          color="blue"
        />

        <Button
          title="🔐 Test Permissions"
          onPress={testFirestorePermissions}
          color="orange"
        />

        <Button
          title="📋 Test Firestore Rules"
          onPress={testFirestoreRules}
          color="purple"
        />

        <Button
          title="📡 Test Subscriptions"
          onPress={testFirestoreSubscription}
          color="green"
        />

        <Text style={styles.helpText}>
          • CRUD Tests: Create, Read, Update, Delete operations{"\n"}•
          Permission Tests: Test each collection access{"\n"}• Rules Tests: Test
          specific Firestore rule scenarios{"\n"}• Subscription Tests: Test
          real-time subscriptions with error handling
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
