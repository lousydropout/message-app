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

### Real-time Communication

- **WebSocket**: Native WebSocket API for instant messaging
- **Fallback**: Firestore real-time listeners as backup
- **Connection Management**: Automatic reconnection and health monitoring
- **Message Queuing**: SQLite for message history + AsyncStorage for simple queuing

### AI Integration

- **OpenAI API**: GPT-4o-mini with function calling capabilities
- **Server-side Processing**: Firebase Cloud Functions for API security
- **RAG Pipeline**: Conversation context retrieval and augmentation
- **Rate Limiting**: Per-user API call limits and quotas
- **Response Streaming**: Real-time AI response delivery

### State Management

- **Library**: Zustand 5.0.8
- **Pattern**: Explicit initialization stores
- **Stores**: `authStore`, `messagesStore`, `aiStore`, `connectionStore`
- **Offline Support**: SQLite for complex data + AsyncStorage for simple preferences

### TypeScript

- **Version**: 5.9.3
- **Configuration**: `tsconfig.json` with path aliases
- **Types**: Custom interfaces for `Message`, `Conversation`, `AIResponse`, `User`

## Development Environment

### Dependencies

```json
{
  "firebase": "12.4.0",
  "zustand": "5.0.8",
  "expo-sqlite": "16.0.8",
  "expo-router": "6.0.12",
  "react-native-gesture-handler": "~2.28.0",
  "react-native-reanimated": "~4.1.3",
  "react-native-websocket": "^1.0.0",
  "expo-notifications": "~0.32.12",
  "expo-background-fetch": "14.0.7"
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
│   └── explore.tsx          # AI features showcase
├── conversation/
│   └── [id].tsx             # Dynamic conversation route
├── profile/
│   └── edit.tsx             # User profile editing
├── search/
│   └── users.tsx            # User search and friending
└── modal.tsx                # Modal route for AI features

components/
├── ConversationsList.tsx    # Main conversations list
├── ConversationView.tsx    # Chat interface with messages
├── MessageBubble.tsx        # Individual message component
├── ContactsList.tsx         # Contact/friend list
├── UserSearch.tsx           # Search for users
├── FriendRequest.tsx         # Friend request management
├── AIFeatures.tsx           # AI feature integration
├── TypingIndicator.tsx      # Real-time typing status
├── ConnectionStatus.tsx     # Network status indicator
└── ui/                      # Shared UI components

stores/
├── authStore.ts             # Authentication state management
├── messagesStore.ts         # Real-time message management
├── contactsStore.ts         # Contact and friend management
├── aiStore.ts               # AI feature state and responses
└── connectionStore.ts       # WebSocket connection status

services/
├── firebase.ts              # Firebase configuration
├── websocket.ts             # WebSocket connection management
├── aiService.ts             # AI API integration
├── notificationService.ts  # Push notification handling
└── googleAuthService.ts     # Google OAuth integration

config/
├── firebase.ts              # Firebase configuration
├── websocket.ts             # WebSocket configuration
└── ai.ts                    # AI service configuration

types/
├── Message.ts               # Message interface
├── Conversation.ts          # Conversation interface
├── User.ts                  # User interface
├── Friend.ts                # Friend interface
├── FriendRequest.ts         # Friend request interface
└── AIResponse.ts            # AI response interface
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
-- Messages table with proper indexing
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  read_by TEXT, -- JSON for read receipts
  ai_features TEXT, -- JSON for AI data
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Full-text search index for message content
CREATE VIRTUAL TABLE messages_fts USING fts5(
  text, sender_id, conversation_id, content='messages', content_rowid='rowid'
);

-- Conversations with proper indexing
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  participants TEXT NOT NULL, -- JSON array of user IDs
  name TEXT, -- For group conversations
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_message_id TEXT,
  FOREIGN KEY (last_message_id) REFERENCES messages(id)
);

-- Contacts/Friends table
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  added_at INTEGER NOT NULL,
  UNIQUE(user_id, friend_id)
);

-- Friend requests table
CREATE TABLE friend_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at INTEGER NOT NULL,
  responded_at INTEGER
);

-- Indexes for performance
CREATE INDEX idx_messages_conversation_timestamp ON messages(conversation_id, timestamp DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_conversations_participants ON conversations(participants);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_contacts_user_status ON contacts(user_id, status);
CREATE INDEX idx_friend_requests_to_user ON friend_requests(to_user_id, status);
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

## WebSocket Configuration

### Connection Management

```typescript
// WebSocket service configuration
const WS_CONFIG = {
  url: "wss://messageai-websocket.com/ws",
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,
  messageTimeout: 10000,
};
```

### Message Protocol

```typescript
interface WSMessage {
  type: "message" | "typing" | "read_receipt" | "presence" | "ai_request";
  conversationId: string;
  userId: string;
  data: any;
  timestamp: number;
}
```

## AI Service Configuration

### OpenAI Integration

```typescript
// Server-side configuration (Firebase Functions)
const AI_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4",
  maxTokens: 1000,
  temperature: 0.7,
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerDay: 1000,
  },
};
```

### Function Calling Schema

```typescript
const AI_FUNCTIONS = {
  translate: {
    name: "translate_message",
    description: "Translate text between languages",
    parameters: {
      text: "string",
      targetLanguage: "string",
      sourceLanguage: "string",
    },
  },
  culturalContext: {
    name: "analyze_cultural_context",
    description: "Provide cultural context hints",
    parameters: {
      message: "string",
      conversationHistory: "array",
      userCulture: "string",
    },
  },
};
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

### 1. WebSocket + Firestore Hybrid

- **Reason**: WebSocket for instant delivery, Firestore for persistence
- **Benefit**: Best of both worlds - speed and reliability

### 2. Server-side AI Processing

- **Reason**: API key security and rate limiting
- **Implementation**: Firebase Cloud Functions with OpenAI API
- **Privacy**: User data protection without encryption complexity

### 3. Offline-First Architecture

- **Reason**: Mobile users frequently experience network issues
- **Implementation**: Local message queuing with sync on reconnect

### 4. Zustand for Complex State

- **Reason**: Better performance than Context for real-time updates
- **Benefit**: Explicit state management with minimal re-renders
- **Google Auth**: Integrated Google OAuth state management

### 5. TypeScript Strict Mode

- **Reason**: Type safety for complex messaging and AI data structures
- **Implementation**: Comprehensive interfaces for all data types
- **Privacy**: User data protection without encryption complexity

## Performance Considerations

### Message Optimization

- **Pagination**: Load 50 messages per page
- **Virtual Scrolling**: Handle 1000+ messages smoothly
- **Image Compression**: Optimize media attachments
- **Message Deduplication**: Prevent duplicate message display

### AI Response Optimization

- **Caching**: Cache common translations and responses
- **Streaming**: Stream long AI responses for better UX
- **Debouncing**: Prevent excessive API calls during typing
- **Background Processing**: Queue AI requests for offline processing

### Mobile Lifecycle Optimization

- **Background Tasks**: Efficient background message processing
- **Battery Usage**: Minimize background activity
- **Memory Management**: Proper cleanup of WebSocket connections
- **Push Notifications**: Smart notification scheduling

## Future Technical Considerations

### Scalability

- **Message Sharding**: Distribute messages across multiple collections
- **WebSocket Scaling**: Multiple WebSocket servers with load balancing
- **AI Service Scaling**: Multiple AI providers for redundancy
- **Caching Layer**: Redis for frequently accessed data

### Advanced Features

- **Voice Messages**: Audio recording and transcription
- **Message Reactions**: Emoji reactions with real-time updates
- **Rich Media**: Link previews and media galleries
- **Advanced Search**: Semantic search across message history
