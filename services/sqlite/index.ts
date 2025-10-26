/**
 * @fileoverview SQLite Service Facade - The primary interface for all local database operations.
 *
 * This service acts as a centralized facade for interacting with the application's
 * local SQLite database. It follows the repository pattern, delegating specific
 * data operations (e.g., for messages, conversations, users) to specialized
 * repository classes. This approach promotes a clean separation of concerns and
 * makes the database logic more modular and maintainable.
 *
 * The `SQLiteService` is responsible for:
 * - Initializing the database and all repositories.
 * - Providing a unified, backward-compatible API for all database operations.
 * - Managing the database lifecycle, including initialization and cleanup.
 *
 * @see SQLiteDatabase for the core database connection and write queue management.
 * @see /services/sqlite/repositories/ for the individual repository implementations.
 */

import { SQLiteDatabase } from "@/services/sqlite/core/SQLiteDatabase";
import { QueuedMessage, SearchResult } from "@/services/sqlite/core/types";
import { ConversationRepository } from "@/services/sqlite/repositories/ConversationRepository";
import { LogRepository } from "@/services/sqlite/repositories/LogRepository";
import { MessageQueueRepository } from "@/services/sqlite/repositories/MessageQueueRepository";
import { MessageRepository } from "@/services/sqlite/repositories/MessageRepository";
import { SyncMetadataRepository } from "@/services/sqlite/repositories/SyncMetadataRepository";
import { UserRepository } from "@/services/sqlite/repositories/UserRepository";
import { Conversation } from "@/types/Conversation";
import { Log, LogLevel } from "@/types/Log";
import { Message } from "@/types/Message";
import { User } from "@/types/User";

/**
 * @fileoverview SQLite Service - Main facade providing backward-compatible API
 *
 * This service maintains the exact same API as the original monolithic service
 * while delegating operations to focused repositories. All performance optimizations
 * (write queue, retry logic, WAL mode) are preserved.
 *
 * The SQLiteService acts as a facade that:
 * - Provides a unified interface to all SQLite operations
 * - Maintains backward compatibility with existing consumers
 * - Delegates operations to specialized repositories
 * - Manages the database lifecycle (initialize, cleanup)
 * - Provides utility methods for statistics and maintenance
 */
export class SQLiteService {
  /** Core database instance handling connection and write queue */
  private database: SQLiteDatabase;
  /** Repository for message-related operations */
  private messageRepo: MessageRepository;
  /** Repository for conversation-related operations */
  private conversationRepo: ConversationRepository;
  /** Repository for message queue operations */
  private queueRepo: MessageQueueRepository;
  /** Repository for user profile operations */
  private userRepo: UserRepository;
  /** Repository for logging operations */
  private logRepo: LogRepository;
  /** Repository for sync metadata operations */
  private syncRepo: SyncMetadataRepository;

  /**
   * Initializes the SQLite service with all repositories
   *
   * Creates instances of all repositories and passes the shared database
   * instance to each one, ensuring they all use the same connection and
   * write queue for consistency.
   */
  constructor() {
    this.database = new SQLiteDatabase();
    this.messageRepo = new MessageRepository(this.database);
    this.conversationRepo = new ConversationRepository(this.database);
    this.queueRepo = new MessageQueueRepository(this.database);
    this.userRepo = new UserRepository(this.database);
    this.logRepo = new LogRepository(this.database);
    this.syncRepo = new SyncMetadataRepository(this.database);
  }

  // ============================================================================
  // INITIALIZATION & CLEANUP
  // ============================================================================

  /**
   * Initialize the SQLite database and create all tables
   */
  async initialize(): Promise<void> {
    return this.database.initialize();
  }

  /**
   * Cleanup resources and close database connection
   */
  async cleanup(): Promise<void> {
    return this.database.cleanup();
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.database.isInitialized();
  }

  // ============================================================================
  // MESSAGE OPERATIONS
  // ============================================================================

  /**
   * Save a batch of messages to SQLite
   */
  async saveMessagesBatch(messages: Message[]): Promise<void> {
    return this.messageRepo.saveMessagesBatch(messages);
  }

  /**
   * Save a message to SQLite (from Firestore sync)
   */
  async saveMessage(message: Message): Promise<void> {
    return this.messageRepo.saveMessage(message);
  }

  /**
   * Get the latest message timestamp for a conversation
   */
  async getLatestMessageTimestamp(conversationId: string): Promise<number> {
    return this.messageRepo.getLatestMessageTimestamp(conversationId);
  }

  /**
   * Get messages for a conversation with pagination
   */
  async getMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    return this.messageRepo.getMessages(conversationId, limit, offset);
  }

  /**
   * Get messages around a specific timestamp (for jump-to-message)
   */
  async getMessagesAroundTimestamp(
    conversationId: string,
    targetTimestamp: number,
    beforeCount: number = 25,
    afterCount: number = 25
  ): Promise<Message[]> {
    return this.messageRepo.getMessagesAroundTimestamp(
      conversationId,
      targetTimestamp,
      beforeCount,
      afterCount
    );
  }

  /**
   * Search messages using FTS5 full-text search (fallback to LIKE if FTS5 unavailable)
   */
  async searchMessages(
    searchQuery: string,
    conversationId?: string,
    limit: number = 50
  ): Promise<SearchResult[]> {
    return this.messageRepo.searchMessages(searchQuery, conversationId, limit);
  }

  /**
   * Load recent messages for a conversation (for windowed Zustand) - optimized
   */
  async loadRecentMessages(
    conversationId: string,
    limit: number = 10000
  ): Promise<Message[]> {
    return this.messageRepo.loadRecentMessages(conversationId, limit);
  }

  /**
   * Delete old messages (for cleanup)
   */
  async deleteOldMessages(olderThanTimestamp: number): Promise<number> {
    return this.messageRepo.deleteOldMessages(olderThanTimestamp);
  }

  /**
   * Save a message to SQLite cache (distinct from queued messages)
   */
  async saveMessageToCache(message: Message): Promise<void> {
    return this.messageRepo.saveMessageToCache(message);
  }

  /**
   * Mark all messages in a conversation as read by a specific user
   */
  async markConversationAsRead(
    conversationId: string,
    userId: string
  ): Promise<void> {
    return this.messageRepo.markConversationAsRead(conversationId, userId);
  }

  // ============================================================================
  // CONVERSATION OPERATIONS
  // ============================================================================

  /**
   * Save a conversation to SQLite (from Firestore sync)
   */
  async saveConversation(conversation: Conversation): Promise<void> {
    return this.conversationRepo.saveConversation(conversation);
  }

  /**
   * Get all conversations for a user (optimized)
   */
  async getConversations(userId: string): Promise<Conversation[]> {
    return this.conversationRepo.getConversations(userId);
  }

  /**
   * Get a single conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    return this.conversationRepo.getConversation(conversationId);
  }

  // ============================================================================
  // QUEUED MESSAGE OPERATIONS
  // ============================================================================

  /**
   * Add a message to the queue (when offline)
   */
  async queueMessage(
    messageId: string,
    conversationId: string,
    senderId: string,
    text: string
  ): Promise<void> {
    return this.queueRepo.queueMessage(
      messageId,
      conversationId,
      senderId,
      text
    );
  }

  /**
   * Get all queued messages
   */
  async getQueuedMessages(): Promise<QueuedMessage[]> {
    return this.queueRepo.getQueuedMessages();
  }

  /**
   * Remove a message from the queue (after successful send)
   */
  async removeQueuedMessage(messageId: string): Promise<void> {
    return this.queueRepo.removeQueuedMessage(messageId);
  }

  /**
   * Update retry count for a queued message (after failed send)
   */
  async updateQueuedMessageRetry(
    messageId: string,
    error: string
  ): Promise<void> {
    return this.queueRepo.updateQueuedMessageRetry(messageId, error);
  }

  /**
   * Clear all queued messages (for testing/reset)
   */
  async clearQueuedMessages(): Promise<void> {
    return this.queueRepo.clearQueuedMessages();
  }

  // ============================================================================
  // SYNC METADATA OPERATIONS
  // ============================================================================

  /**
   * Get sync metadata by key
   */
  async getSyncMetadata(key: string): Promise<any | null> {
    return this.syncRepo.getSyncMetadata(key);
  }

  /**
   * Set sync metadata
   */
  async setSyncMetadata(key: string, value: any): Promise<void> {
    return this.syncRepo.setSyncMetadata(key, value);
  }

  /**
   * Get lastSyncedAt for a conversation
   */
  async getLastSyncedAt(conversationId: string): Promise<number> {
    return this.syncRepo.getLastSyncedAt(conversationId);
  }

  /**
   * Set lastSyncedAt for a conversation
   */
  async setLastSyncedAt(
    conversationId: string,
    timestamp: number
  ): Promise<void> {
    return this.syncRepo.setLastSyncedAt(conversationId, timestamp);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Clear all data (for logout/reset)
   */
  async clearAllData(): Promise<void> {
    return this.database.clearAllData();
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    messages: number;
    conversations: number;
    queuedMessages: number;
  }> {
    return this.database.getStats();
  }

  /**
   * Get database indexes
   */
  async getIndexes(): Promise<string[]> {
    return this.database.getIndexes();
  }

  // ============================================================================
  // LOG METHODS
  // ============================================================================

  /**
   * Save a log entry to the database
   */
  async saveLog(log: Log): Promise<void> {
    return this.logRepo.saveLog(log);
  }

  /**
   * Get logs with optional filtering
   */
  async getLogs(limit: number = 100, minLevel?: LogLevel): Promise<Log[]> {
    return this.logRepo.getLogs(limit, minLevel);
  }

  /**
   * Get logs by category
   */
  async getLogsByCategory(
    category: string,
    limit: number = 100
  ): Promise<Log[]> {
    return this.logRepo.getLogsByCategory(category, limit);
  }

  /**
   * Clear old logs (older than specified days)
   */
  async clearOldLogs(olderThanDays: number = 7): Promise<void> {
    return this.logRepo.clearOldLogs(olderThanDays);
  }

  /**
   * Clear all logs
   */
  async clearAllLogs(): Promise<void> {
    return this.logRepo.clearAllLogs();
  }

  // ============================================================================
  // USER PROFILE OPERATIONS
  // ============================================================================

  /**
   * Save user profile to local cache
   */
  async saveUserProfile(user: User): Promise<void> {
    return this.userRepo.saveUserProfile(user);
  }

  /**
   * Get user profile from local cache
   */
  async getUserProfile(userId: string): Promise<User | null> {
    return this.userRepo.getUserProfile(userId);
  }

  /**
   * Get multiple user profiles from local cache
   */
  async getUserProfiles(userIds: string[]): Promise<User[]> {
    return this.userRepo.getUserProfiles(userIds);
  }

  /**
   * Cache a translation result
   */
  async cacheTranslation(translation: {
    messageId: string;
    language: string;
    translatedText: string;
    culturalNotes: string;
    originalLanguage: string;
    createdAt: number;
  }): Promise<void> {
    await this.database.getDb().runAsync(
      `INSERT OR REPLACE INTO translations 
       (messageId, language, translatedText, culturalNotes, originalLanguage, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        translation.messageId,
        translation.language,
        translation.translatedText,
        translation.culturalNotes,
        translation.originalLanguage,
        translation.createdAt,
      ]
    );
  }

  /**
   * Get a cached translation
   */
  async getCachedTranslation(
    messageId: string,
    language: string
  ): Promise<{
    messageId: string;
    language: string;
    translatedText: string;
    culturalNotes: string;
    originalLanguage: string;
    createdAt: number;
  } | null> {
    const result = await this.database.getDb().getFirstAsync<{
      messageId: string;
      language: string;
      translatedText: string;
      culturalNotes: string;
      originalLanguage: string;
      createdAt: number;
    }>("SELECT * FROM translations WHERE messageId = ? AND language = ?", [messageId, language]);
    return result || null;
  }
}

// Export singleton instance for backward compatibility
export default new SQLiteService();
