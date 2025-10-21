import { useConnectionStore } from "@/stores/connectionStore";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function NetworkStatusBar() {
  const [modalVisible, setModalVisible] = useState(false);
  const {
    isOnline,
    connectionStatus,
    networkType,
    syncStatus,
    isSyncing,
    queuedMessagesCount,
    failedMessagesCount,
    lastSyncAt,
    lastError,
    syncStats,
  } = useConnectionStore();

  const getIndicatorColor = (): string => {
    if (!isOnline) return "#D32F2F"; // Red - disconnected
    if (isSyncing) return "#F57C00"; // Orange - syncing/reconnecting
    if (syncStatus === "error") return "#D32F2F"; // Red - error
    if (syncStatus === "synced") return "#2E7D32"; // Green - connected
    return "#9E9E9E"; // Gray - idle
  };

  const getIndicatorIcon = (): string => {
    if (!isOnline) return "cloud-offline-outline";
    if (isSyncing) return "sync-outline";
    if (syncStatus === "error") return "warning-outline";
    if (syncStatus === "synced") return "cloud-done-outline";
    return "cloud-outline";
  };

  const handleRefresh = () => {
    try {
      if (isOnline && !isSyncing) {
        import("@/stores/messagesStore")
          .then((module) => {
            module.useMessagesStore.getState().syncQueuedMessages();
          })
          .catch((error) => {
            console.error("Failed to import messagesStore:", error);
          });
      }
    } catch (error) {
      console.error("Error triggering manual sync:", error);
    }
  };

  const formatLastSyncTime = (timestamp: number | null): string => {
    if (!timestamp) return "Never";

    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else {
      return `${diffHours}h ago`;
    }
  };

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={["top", "right"]}>
        <View style={styles.indicatorContainer}>
          <TouchableOpacity
            style={styles.indicatorButton}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons
              name={getIndicatorIcon()}
              size={16}
              color={getIndicatorColor()}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={!isOnline || isSyncing}
          >
            <Ionicons
              name="refresh-outline"
              size={14}
              color={isOnline && !isSyncing ? "#007AFF" : "#9E9E9E"}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Network Status</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Connection Status */}
              <View style={styles.statusSection}>
                <Text style={styles.sectionTitle}>Connection</Text>
                <View style={styles.statusRow}>
                  <Ionicons
                    name={getIndicatorIcon()}
                    size={20}
                    color={getIndicatorColor()}
                  />
                  <Text style={styles.statusText}>
                    {isOnline
                      ? `Online (${networkType || "Unknown"}) `
                      : "Offline "}
                  </Text>
                </View>
              </View>

              {/* Sync Status */}
              <View style={styles.statusSection}>
                <Text style={styles.sectionTitle}>Sync Status</Text>
                <View style={styles.statusRow}>
                  <Ionicons
                    name={isSyncing ? "sync" : "checkmark-circle"}
                    size={20}
                    color={isSyncing ? "#F57C00" : "#2E7D32"}
                  />
                  <Text style={styles.statusText}>
                    {isSyncing
                      ? "Syncing... "
                      : syncStatus === "synced"
                      ? "Synced "
                      : syncStatus === "error"
                      ? "Error "
                      : "Idle "}
                  </Text>
                </View>
                {lastSyncAt && (
                  <Text style={styles.subText}>
                    Last synced: {formatLastSyncTime(lastSyncAt)}
                  </Text>
                )}
              </View>

              {/* Queue Status */}
              <View style={styles.statusSection}>
                <Text style={styles.sectionTitle}>Message Queue</Text>
                <Text style={styles.statusText}>
                  Queued: {queuedMessagesCount}
                </Text>
                {failedMessagesCount > 0 && (
                  <Text style={[styles.statusText, { color: "#D32F2F" }]}>
                    Failed: {failedMessagesCount}
                  </Text>
                )}
              </View>

              {/* Sync Statistics */}
              <View style={styles.statusSection}>
                <Text style={styles.sectionTitle}>Sync Statistics</Text>
                <Text style={styles.subText}>
                  Messages queued: {queuedMessagesCount}
                </Text>
                <Text style={styles.subText}>
                  Messages synced: {syncStats.messagesSynced}
                </Text>
                <Text style={styles.subText}>
                  Messages failed: {syncStats.messagesFailed}
                </Text>
                <Text style={styles.subText}>
                  Retry count: {syncStats.retryCount}
                </Text>
              </View>

              {/* Error Information */}
              {lastError && (
                <View style={styles.statusSection}>
                  <Text style={styles.sectionTitle}>Last Error</Text>
                  <Text style={[styles.subText, { color: "#D32F2F" }]}>
                    {lastError}
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  !isOnline && styles.actionButtonDisabled,
                ]}
                onPress={handleRefresh}
                disabled={!isOnline || isSyncing}
              >
                <Ionicons
                  name="refresh"
                  size={16}
                  color={isOnline && !isSyncing ? "white" : "#9E9E9E"}
                />
                <Text
                  style={[
                    styles.actionButtonText,
                    !isOnline && styles.actionButtonTextDisabled,
                  ]}
                >
                  Force Sync
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 1000,
  },
  indicatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 20,
    marginTop: 8,
    marginRight: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  indicatorButton: {
    padding: 4,
  },
  refreshButton: {
    padding: 4,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    width: "90%",
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  statusSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    fontSize: 14,
    color: "#333",
    marginLeft: 8,
  },
  subText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  actionButtonDisabled: {
    backgroundColor: "#E0E0E0",
  },
  actionButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  actionButtonTextDisabled: {
    color: "#9E9E9E",
  },
});
