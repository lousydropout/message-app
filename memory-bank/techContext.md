# Technical Context: MessageAI Technology Stack & Setup

## Core Technologies

### React Native + Expo

- **Version**: React Native 0.81.4, Expo ~54.0.13
- **Development**: Expo Go for real device testing
- **Routing**: Expo Router ~6.0.12 (file-based routing)
- **Platform**: Cross-platform (iOS/Android/Web)
- **Mobile Lifecycle**: Proper background/foreground handling

### Firebase

- **Project**: `messageai-7e81f` (renamed from notetaker)
- **Services**: Firestore, Authentication, Cloud Functions, Cloud Messaging
- **SDK**: Firebase Web SDK (required for Expo Go)
- **Auth**: Google social login with user profiles and avatars
- **Database**: Firestore with composite indexes for conversations
- **Functions**: Server-side AI processing and API key security

### Unified Queue-First Architecture

- **Design Pattern**: All messages flow through queue regardless of online/offline status
- **UUID Generation**: `Crypto.randomUUID()` from expo-crypto for idempotency
- **Three-Tier Data Flow**: Firestore (Authoritative) → SQLite (Cache) → Zustand (Windowed Memory)
- **Memory Management**: MAX_MESSAGES_IN_MEMORY = 100 per conversation
- **Conversation Lifecycle**: Load/unload messages with subscription management
- **Incremental Sync**: `getMessagesSince()` with Firestore composite indexes
- **Queue Processing**: Mutex-protected with retry logic and exponential backoff

### Real-time Communication

- **Firestore Listeners**: Real-time subscriptions for conversations and messages
- **Subscription Architecture**:
  - Conversations: Persistent subscription on app start
  - Messages: Per-conversation subscription with lifecycle management
- **Connection Management**: Automatic reconnection and health monitoring
- **Message Queuing**: SQLite for offline message queuing and persistence

### AI Integration

- **Status**: Planned for future implementation
- **OpenAI API**: GPT-4o-mini with function calling capabilities (planned)
- **Server-side Processing**: Firebase Cloud Functions for API security (planned)
- **RAG Pipeline**: Conversation context retrieval and augmentation (planned)
- **Rate Limiting**: Per-user API call limits and quotas (planned)
- **Response Streaming**: Real-time AI response delivery (planned)

### State Management

- **Library**: Zustand 5.0.8
- **Pattern**: Explicit initialization stores
- **Stores**: `authStore`, `messagesStore`, `connectionStore`, `contactsStore`, `loggerStore`, `notesStore`
- **Offline Support**: SQLite for complex data + AsyncStorage for simple preferences
- **Memory Optimization**: Windowed memory with conversation lifecycle management

### Logging System

- **Library**: Custom Zustand-based logger store
- **Console Integration**: Automatic console output for development
- **SQLite Persistence**: Complete log history stored in SQLite
- **In-Memory Cache**: Last 100 logs kept in memory for UI
- **Level-Based Methods**: Uses appropriate console methods (debug/log/warn/error)
- **Try-Catch Safety**: Console operations wrapped in try-catch
- **Categories**: auth, network, messages, firebase, sqlite, connection, conversations, stores
- **Levels**: debug, info, warning, error

### TypeScript

- **Version**: 5.9.3
- **Configuration**: `tsconfig.json` with path aliases
- **Types**: Custom interfaces for `Message`, `Conversation`, `User`, `FriendRequest`, `Log`, `Note`

## Development Environment

### Dependencies

```json
{
  "firebase": "^12.4.0",
  "zustand": "^5.0.8",
  "expo-sqlite": "~16.0.8",
  "expo-router": "~6.0.11",
  "react-native-gesture-handler": "~2.28.0",
  "react-native-reanimated": "~4.1.1",
  "expo-notifications": "~0.32.12",
  "expo-background-fetch": "~14.0.7",
  "expo-crypto": "~15.0.7",
  "@shopify/flash-list": "^2.1.0",
  "react": "19.1.0",
  "react-native": "0.81.4"
}
```

### Development Tools

```json
{
  "eslint": "^9.25.0",
  "eslint-config-expo": "~10.0.0"
}
```

## Project Structure

```
app/
├── _layout.tsx              # Root layout with auth initialization
├── (tabs)/
│   ├── _layout.tsx          # Tab navigation
│   ├── index.tsx            # Home screen (ConversationsList)
│   ├── contacts.tsx         # Contact list and friend management
│   ├── profile.tsx          # User profile
│   └── diagnostics.tsx      # Diagnostics and logging
├── conversation/
│   └── [id].tsx             # Dynamic conversation route
├── auth/
│   └── login.tsx            # Authentication
├── profile/
│   └── edit.tsx             # User profile editing
└── modal.tsx                # Modal route

components/
├── ConversationsList.tsx    # Main conversations list
├── ConversationView.tsx     # Chat interface with messages
├── MessageBubble.tsx        # Individual message component
├── ContactsList.tsx         # Contact/friend list
├── UserSearch.tsx           # Search for users
├── FriendRequestCard.tsx    # Friend request management
├── TypingIndicator.tsx      # Real-time typing status
├── NetworkStatusBar.tsx     # Network status indicator
└── ui/                      # Shared UI components

stores/
├── authStore.ts             # Authentication state management
├── messagesStore.ts         # Real-time message management
├── contactsStore.ts         # Contact and friend management
├── connectionStore.ts        # Network connection status
├── loggerStore.ts           # Comprehensive logging system
├── notesStore.ts            # Notes management
└── setupStores.ts           # Store initialization

services/
├── authService.ts           # Authentication operations
├── messageService.ts        # Message CRUD operations
├── conversationService.ts   # Conversation management
├── friendService.ts         # Friend request operations
├── userService.ts          # User profile operations
├── sqliteService.ts        # Local database operations
└── googleAuthService.ts     # Google OAuth integration

types/
├── Message.ts               # Message interface
├── Conversation.ts          # Conversation interface
├── User.ts                  # User interface
├── FriendRequest.ts         # Friend request interface
├── Log.ts                   # Log type definitions
└── Note.ts                  # Note interface
```

## Firebase Configuration

### Project Setup

- **Project ID**: `messageai-7e81f`
- **Database**: Firestore in production mode
- **Authentication**: Google OAuth and email/password auth
- **Cloud Functions**: OpenAI API integration
- **Cloud Messaging**: Push notifications
- **Security Rules**: Conversation-based access control

### Database Schema

```typescript
// Users Collection
interface User {
  id: string;
  email: string;
  displayName: string;
  avatar?: string;
  googleId?: string; // Google OAuth ID
  languagePreferences: string[];
  aiSettings: {
    autoTranslate: boolean;
    culturalHints: boolean;
    formalityAdjustment: boolean;
  };
  blockedUsers: string[]; // Array of user IDs
  createdAt: Timestamp;
  lastSeen: Timestamp;
}

// Friends Collection (subcollection under users)
interface Friend {
  id: string; // Friend's user ID
  displayName: string;
  avatar?: string;
  status: "pending" | "accepted" | "blocked";
  addedAt: Timestamp;
}

// Friend Requests Collection
interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: Timestamp;
  respondedAt?: Timestamp;
}

// Conversations Collection
interface Conversation {
  id: string;
  type: "direct" | "group";
  participants: string[]; // User IDs
  name?: string; // For group conversations
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: Timestamp;
  };
}

// Messages Collection
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: Timestamp;
  readBy: { [userId: string]: Timestamp };
  aiFeatures?: {
    translation?: string;
    culturalHints?: string[];
    formalityLevel?: "formal" | "informal" | "casual";
  };
}
```

### Composite Indexes

- **Messages**: `conversationId` (ascending), `timestamp` (descending)
- **Conversations**: `participants` (array-contains), `updatedAt` (descending)
- **Users**: `email` (ascending), `displayName` (ascending)
- **Friend Requests**: `toUserId` (ascending), `status` (ascending), `createdAt` (descending)
- **Friends**: `status` (ascending), `addedAt` (descending)

## SQLite Local Database Schema

### Hybrid Storage Architecture

**SQLite** for complex relational data:

- Message history with full-text search
- Conversation metadata and relationships
- Contact lists and friend relationships
- Read receipts and typing indicators

**AsyncStorage** for simple key-value data:

- User preferences and settings
- Auth tokens and session data
- App configuration flags
- Simple cache data

### SQLite Schema

```sql
-- Messages table with comprehensive indexing
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL,
  senderId TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  readBy TEXT, -- JSON for read receipts
  status TEXT DEFAULT 'sent',
  aiFeatures TEXT, -- JSON for AI data (planned)
  createdAt INTEGER,
  updatedAt INTEGER,
  syncedAt INTEGER,
  FOREIGN KEY (conversationId) REFERENCES conversations(id)
);

-- Full-text search index for message content
CREATE VIRTUAL TABLE messages_fts USING fts5(
  text, senderId, conversationId, content='messages', content_rowid='rowid'
);

-- Conversations with proper indexing
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
  participants TEXT NOT NULL, -- JSON array of user IDs
  name TEXT, -- For group conversations
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  lastMessageId TEXT,
  lastMessageText TEXT,
  lastMessageSenderId TEXT,
  lastMessageTimestamp INTEGER,
  unreadCounts TEXT, -- JSON for unread counts per user
  syncedAt INTEGER,
  FOREIGN KEY (lastMessageId) REFERENCES messages(id)
);

-- Queued messages for offline scenarios
CREATE TABLE queued_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  messageId TEXT UNIQUE NOT NULL,
  conversationId TEXT NOT NULL,
  senderId TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  retryCount INTEGER DEFAULT 0,
  lastRetryAt INTEGER,
  error TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (conversationId) REFERENCES conversations(id)
);

-- Logs table for comprehensive logging
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Sync metadata for incremental sync
CREATE TABLE sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Comprehensive indexes for performance
CREATE INDEX idx_messages_conversation_timestamp ON messages(conversationId, timestamp DESC);
CREATE INDEX idx_messages_sender ON messages(senderId);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_conversation_id ON messages(conversationId, id);
CREATE INDEX idx_messages_conversation_updated ON messages(conversationId, updatedAt DESC);
CREATE INDEX idx_messages_conversation_status ON messages(conversationId, status);
CREATE INDEX idx_messages_conversation_sender ON messages(conversationId, senderId);
CREATE INDEX idx_messages_conversation_id_updated ON messages(conversationId, id, updatedAt DESC);

CREATE INDEX idx_conversations_updated ON conversations(updatedAt DESC);
CREATE INDEX idx_conversations_participants ON conversations(participants);
CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_type_updated ON conversations(type, updatedAt DESC);

CREATE INDEX idx_queued_timestamp ON queued_messages(timestamp ASC);
CREATE INDEX idx_queued_conversation ON queued_messages(conversationId);
CREATE INDEX idx_queued_conversation_timestamp ON queued_messages(conversationId, timestamp ASC);
CREATE INDEX idx_queued_retry_count ON queued_messages(retryCount);

CREATE INDEX idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_category ON logs(category);
```

### SQLite Service Implementation

```typescript
// services/sqliteService.ts
import * as SQLite from "expo-sqlite";

class SQLiteService {
  private db: SQLite.SQLiteDatabase;

  async initialize() {
    this.db = await SQLite.openDatabaseAsync("messageai.db");
    await this.createTables();
    await this.createIndexes();
  }

  // Message operations
  async saveMessage(message: Message) {
    await this.db.runAsync(
      "INSERT OR REPLACE INTO messages (id, conversation_id, sender_id, text, timestamp, read_by, ai_features, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        message.id,
        message.conversationId,
        message.senderId,
        message.text,
        message.timestamp,
        JSON.stringify(message.readBy),
        JSON.stringify(message.aiFeatures),
        Date.now(),
      ]
    );
  }

  async getMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ) {
    return await this.db.getAllAsync(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
      [conversationId, limit, offset]
    );
  }

  async searchMessages(query: string, conversationId?: string) {
    const sql = conversationId
      ? "SELECT * FROM messages_fts WHERE messages_fts MATCH ? AND conversation_id = ?"
      : "SELECT * FROM messages_fts WHERE messages_fts MATCH ?";
    const params = conversationId ? [query, conversationId] : [query];
    return await this.db.getAllAsync(sql, params);
  }

  // Conversation operations
  async saveConversation(conversation: Conversation) {
    await this.db.runAsync(
      "INSERT OR REPLACE INTO conversations (id, type, participants, name, created_at, updated_at, last_message_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        conversation.id,
        conversation.type,
        JSON.stringify(conversation.participants),
        conversation.name,
        conversation.createdAt,
        conversation.updatedAt,
        conversation.lastMessage?.id,
      ]
    );
  }

  async getConversations(userId: string) {
    return await this.db.getAllAsync(
      "SELECT * FROM conversations WHERE participants LIKE ? ORDER BY updated_at DESC",
      [`%${userId}%`]
    );
  }
}
```

## Development Scripts

```json
{
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
  "lint": "expo lint",
  "build:functions": "cd functions && npm run build",
  "deploy:functions": "firebase deploy --only functions"
}
```

## Key Technical Decisions

### 1. Firestore Real-time Listeners

- **Reason**: Real-time delivery with persistence and offline support
- **Benefit**: Unified approach with built-in conflict resolution

### 2. Unified Queue-First Architecture

- **Reason**: Reliable message delivery across all network conditions
- **Implementation**: Always queue first, then process if online
- **Benefit**: Consistent behavior regardless of connectivity

### 3. Three-Tier Data Architecture

- **Reason**: Optimal performance with complete offline access
- **Implementation**: Firestore (Authoritative) → SQLite (Cache) → Zustand (Windowed Memory)
- **Benefit**: Fast UI with persistent storage and memory management

### 4. Zustand for Complex State

- **Reason**: Better performance than Context for real-time updates
- **Benefit**: Explicit state management with minimal re-renders
- **Memory Management**: Windowed memory with conversation lifecycle

### 5. TypeScript Strict Mode

- **Reason**: Type safety for complex messaging data structures
- **Implementation**: Comprehensive interfaces for all data types
- **Privacy**: User data protection without encryption complexity

## Performance Considerations

### Message Optimization

- **Windowed Memory**: Load MAX_MESSAGES_IN_MEMORY (100) messages per conversation
- **Virtual Scrolling**: FlashList for smooth scrolling through 1000+ messages
- **Image Compression**: Optimize media attachments
- **Message Deduplication**: UUID-based idempotency prevents duplicates
- **Conversation Lifecycle**: Load/unload messages with subscription management

### AI Response Optimization

- **Status**: Planned for future implementation
- **Caching**: Cache common translations and responses (planned)
- **Streaming**: Stream long AI responses for better UX (planned)
- **Debouncing**: Prevent excessive API calls during typing (planned)
- **Background Processing**: Queue AI requests for offline processing (planned)

### Mobile Lifecycle Optimization

- **Background Tasks**: Efficient background message processing
- **Battery Usage**: Minimize background activity
- **Memory Management**: Proper cleanup of subscriptions and state
- **Push Notifications**: Smart notification scheduling
- **Offline-First**: Complete offline functionality with sync on reconnect

## App Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MESSAGEAI ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   UI Layer  │    │  State Mgmt │    │  Services   │          │
│  │             │    │             │    │             │          │
│  │ • React     │◄──►│ • Zustand   │◄──►│ • Firebase  │          │
│  │   Native    │    │ • SQLite    │    │ • Message   │          │
│  │ • Expo      │    │ • Async     │    │ • Auth      │          │
│  │   Router    │    │   Storage   │    │ • User      │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              UNIFIED QUEUE-FIRST FLOW                      │ │
│  │                                                            │ │
│  │  User Types Message → Always Queue First → Process Queue   │ │
│  │                                                            │ │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │ │
│  │  │   Online    │    │   Offline   │    │  Reconnect  │     │ │
│  │  │             │    │             │    │             │     │ │
│  │  │ Queue →     │    │ Queue →     │    │ Queue →     │     │ │
│  │  │ Process     │    │ Wait        │    │ Process +   │     │ │
│  │  │ Immediately │    │             │    │ Sync Missed │     │ │
│  │  └─────────────┘    └─────────────┘    └─────────────┘     │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Three-Tier Data Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA FLOW ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                FIRESTORE (Authoritative Truth)             │ │
│  │                                                            │ │
│  │  • Real-time subscriptions (onSnapshot)                    │ │
│  │  • Incremental sync (getMessagesSince)                     │ │
│  │  • Server-side persistence & conflict resolution           │ │
│  │  • Expensive operations (minimize queries)                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                SQLITE (Persistent Cache)                   │ │
│  │                                                            │ │
│  │  • ALL messages stored locally                             │ │
│  │  • Full-text search (FTS5)                                 │ │
│  │  • Message queuing (offline scenarios)                     │ │
│  │  • Sync metadata (lastSyncedAt per conversation)           │ │
│  │  • Optimized indexes for fast queries                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                ZUSTAND (In-Memory Window)                  │ │
│  │                                                            │ │
│  │  • Last 100 messages per conversation                      │ │
│  │  • Real-time UI updates                                    │ │
│  │  • Conversation lifecycle management                       │ │
│  │  • Memory-bounded (prevents bloat)                         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Subscription Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                    SUBSCRIPTION ARCHITECTURE                      │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                CONVERSATIONS SUBSCRIPTION                    │ │
│  │                                                              │ │
│  │  When: App Start (User Login)                                │ │
│  │  Where: ConversationsList.tsx                                │ │
│  │  Purpose: Monitor conversation list changes                  │ │
│  │                                                              │ │
│  │  On Updates:                                                 │ │
│  │  • New conversations appear in list                          │ │
│  │  • Conversation metadata updates (lastMessage, unread)       │ │
│  │  • Triggers UI refresh of conversations list                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  MESSAGES SUBSCRIPTION                       │ │
│  │                                                              │ │
│  │  When: Enter Conversation (ConversationView mount)           │ │
│  │  Where: ConversationView.tsx                                 │ │
│  │  Purpose: Real-time message updates for active conversation  │ │
│  │                                                              │ │
│  │  On Updates:                                                 │ │
│  │  • New messages appear instantly (<200ms)                    │ │
│  │  • Read receipt updates propagate                            │ │
│  │                                                              │ │
│  │  Message Callback Handler:                                   │ │
│  │  1. Save ALL messages to SQLite (upsert)                     │ │
│  │  2. Update Zustand state (conversation view)                │ │
│  │     • Find new messages (not in current state)              │ │
│  │     • Update read receipts for existing messages            │ │
│  │     • Merge and limit to 100 messages                       │ │
│  │     • Trigger UI re-render                                   │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

### Message Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    MESSAGE LIFECYCLE FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. USER TYPES MESSAGE                                          │
│     │                                                           │
│     ▼                                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Generate UUID (Crypto.randomUUID())                       │ │
│  │  • Same ID used throughout entire lifecycle                │ │
│  │  • Prevents duplicates & enables idempotency               │ │
│  └────────────────────────────────────────────────────────────┘ │
│     │                                                           │
│     ▼                                                           │
│  2. ALWAYS QUEUE FIRST (Unified Flow)                          │
│     │                                                           │
│     ▼                                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  SQLite Queue Operations:                                  │ │
│  │  • INSERT INTO queued_messages                             │ │
│  │  • Optimistic UI update (immediate display)                │ │
│  │  • Status: "sending" → "sent" → "failed"                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│     │                                                           │
│     ▼                                                           │
│  3. PROCESS QUEUE (If Online)                                  │
│     │                                                           │
│     ▼                                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Firestore Operations:                                     │ │
│  │  • Check existing.exists() before setDoc() (idempotency)   │ │
│  │  • setDoc() with UUID (idempotent)                         │ │
│  │  • Update conversation (lastMessage, unreadCounts)         │ │
│  │  • Remove from queue on success                            │ │
│  │  • Update retry count on failure                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│     │                                                           │
│     ▼                                                           │
│  4. REAL-TIME DISTRIBUTION                                      │
│     │                                                           │
│     ▼                                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Firestore onSnapshot → All Participants:                  │ │
│  │  • Real-time message delivery (<200ms)                     │ │
│  │  • SQLite cache update (INSERT OR REPLACE)                 │ │
│  │  • Zustand state update (if conversation loaded)           │ │
│  │  • UI re-render with new message                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Memory Management Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    MEMORY MANAGEMENT STRATEGY                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                CONVERSATION LIFECYCLE                      │ │
│  │                                                            │ │
│  │  User Opens Conversation:                                  │ │
│  │  │                                                         │ │
│  │  ▼                                                         │ │
│  │  ┌───────────────────────────────────────────────────────┐ │ │
│  │  │  loadConversationMessages(conversationId):            │ │ │
│  │  │                                                       │ │ │
│  │  │  • Load last MAX_MESSAGES_IN_MEMORY (100) messages   │ │ │
│  │  │    from SQLite                                        │ │ │
│  │  │  • Add to Zustand state                               │ │ │
│  │  │  • Subscribe to Firestore real-time updates           │ │ │
│  │  │  • Background sync for any missed messages            │ │ │
│  │  └───────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │  User Closes Conversation:                                 │ │
│  │  │                                                         │ │
│  │  ▼                                                         │ │
│  │  ┌───────────────────────────────────────────────────────┐ │ │
│  │  │  unloadConversationMessages(conversationId):          │ │ │
│  │  │                                                       │ │ │
│  │  │  • Remove messages from Zustand state                │ │ │
│  │  │  • Unsubscribe from Firestore listeners               │ │ │
│  │  │  • Free memory (messages remain in SQLite cache)      │ │ │
│  │  └───────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                MEMORY BOUNDARIES                           │ │
│  │                                                            │ │
│  │  • Zustand: 100 messages × N conversations (bounded)       │ │
│  │  • SQLite: ALL messages (persistent, unlimited)            │ │
│  │  • Firestore: Authoritative source (server-side)           │ │
│  │                                                            │ │
│  │  Benefits:                                                 │ │
│  │  • Fast UI performance (limited memory usage)              │ │
│  │  • Complete offline access (SQLite cache)                  │ │
│  │  • Reliable sync (Firestore authoritative)                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architecture Constants

- **MAX_MESSAGES_IN_MEMORY**: 100 (windowed memory per conversation)
- **UUID Generation**: `Crypto.randomUUID()` from expo-crypto
- **Queue Processing**: Mutex-protected with 3 retry attempts
- **Sync Strategy**: Incremental via `getMessagesSince(lastSyncedAt)`
- **Subscription Pattern**: Persistent conversations + per-conversation messages

## Completed Epic 3.2: Data Management & Sync + Memory Optimization

### Status: ✅ COMPLETE

**Major Achievements**:

- **Unified Queue-First Architecture**: All messages flow through queue regardless of online/offline status
- **UUID-Based Idempotency**: `Crypto.randomUUID()` prevents message duplication throughout lifecycle
- **Three-Tier Data Flow**: Firestore (Authoritative) → SQLite (Cache) → Zustand (Windowed Memory)
- **Memory Optimization**: MAX_MESSAGES_IN_MEMORY = 100 per conversation with lifecycle management
- **Incremental Sync**: `getMessagesSince()` with Firestore composite indexes for efficient sync
- **Queue Processing**: Mutex-protected with retry logic and exponential backoff

**Technical Implementation**:

- ✅ Schema migration: `tempId` → `messageId` in SQLite
- ✅ UUID generation using `expo-crypto` (superior to uuid package)
- ✅ Idempotency checks: `existing.exists()` before `setDoc()`
- ✅ Unified flow: Always queue first, then process if online
- ✅ Conversation lifecycle: `loadConversationMessages()` / `unloadConversationMessages()`
- ✅ Subscription architecture: Persistent conversations + per-conversation messages
- ✅ Error handling: Retry logic with exponential backoff
- ✅ Performance: 99.7% improvement in conversation loading (6,900ms → 18ms)

**Architecture Diagrams**: Comprehensive ASCII diagrams in README showing:

- Core architecture overview
- Three-tier data flow
- Message lifecycle flow
- Offline/online sync flow
- Memory management strategy
- Subscription architecture
- Error handling & retry logic

## Future Technical Considerations

### Scalability

- **Message Sharding**: Distribute messages across multiple collections (planned)
- **Firestore Scaling**: Optimize queries with composite indexes
- **Caching Layer**: Redis for frequently accessed data (planned)
- **Load Balancing**: Multiple Firebase projects for scaling (planned)

### Advanced Features

- **Voice Messages**: Audio recording and transcription (planned)
- **Message Reactions**: Emoji reactions with real-time updates (planned)
- **Rich Media**: Link previews and media galleries (planned)
- **Advanced Search**: Semantic search across message history (planned)
- **AI Features**: Translation, cultural hints, formality adjustment (planned)
