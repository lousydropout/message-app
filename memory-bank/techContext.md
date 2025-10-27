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
- **Auth**: Email/password authentication with user profiles and presence tracking
- **Database**: Firestore with composite indexes for conversations and friends subcollections
- **Functions**: Server-side AI processing and API key security
- **Presence**: Real-time online status with heartbeat mechanism

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

### Mobile Lifecycle Management

- **AppState Listeners**: Background/foreground handling for presence management
- **Toast Notifications**: User feedback system (Expo Go equivalent of push notifications)
- **Battery Optimization**: SQLite caching reduces Firebase queries and network usage
- **Optimized Re-rendering**: Memoization and FlashList for performance
- **Message Persistence**: SQLite storage for offline messages during app transitions

### AI Integration (Advanced Implementation)

- **OpenAI API**: GPT-4.1-mini with advanced translation capabilities
- **Server-side Processing**: AWS Lambda for API security and scalability
- **Context-Aware Translation**: AI analyzes conversation history for accurate translations
- **Tool Calling System**: AI can request additional context when confidence is low (>95% threshold)
- **RAG Integration**: SQLite FTS5 search for relevant conversation context
- **Two-Phase Translation**: Exploratory and execution phases for optimal accuracy
- **MiniGraph Orchestration**: LangGraph-style state machine for complex AI workflows
- **Cultural Context**: Automatic cultural notes and formality guidance
- **Language Detection**: Automatic source language identification
- **Confidence Scoring**: AI provides confidence levels for translation accuracy
- **Reference Analysis**: Identifies and explains references to earlier messages
- **Real-time Progress**: Live status updates during translation process
- **Client Integration**: MessageBubble component with translation modal
- **Authentication**: Firebase ID token authentication for secure API access

### Production Deployment

- **Firestore Security Rules**: Production-ready rules with Principle of Least Privilege
- **Optimized Indexes**: Minimal composite indexes for optimal query performance
- **Environment Configuration**: Conditional diagnostics tab based on EXPO_PUBLIC_DEV_MODE
- **Project**: Deployed to MessageAI2 Firebase project
- **Security**: Comprehensive access controls for all collections and subcollections

## Note for handling the SQLite library

> The following code uses the `expo-sqlite` wrapper, **not** a normal Node or RN SQLite binding.
> This wrapper has some major behavioral quirks around async transactions, concurrency, and parameter limits that must be respected when reviewing or generating queries.

**Important constraints:**

1. **Async transactions aren’t real transactions.**

   - `db.withTransactionAsync(async () => {...})` runs `BEGIN`, `await task()`, `COMMIT`.
   - If `await` yields to the event loop, the native transaction context can vanish, causing
     `Error: cannot rollback - no transaction is active`.
   - Only `withExclusiveTransactionAsync` actually creates a new isolated native connection that guarantees a stable BEGIN/COMMIT/ROLLBACK cycle.

2. **Only one writer connection at a time.**

   - Expo SQLite uses file-level locking.
   - If any other query or background read is active, `withExclusiveTransactionAsync` will throw
     `Error code 5: database is locked`.
   - Avoid concurrent writes; queue writes through a mutex, or add a retry loop (50–100ms) on “database is locked”.

3. **Parameter limit = 999.**

   - Each `?` counts.
   - For `INSERT ... VALUES (?, ?, ...)`, batch size must stay within 999 parameters.
   - E.g., 11 columns × 90 rows = 990 safe.
   - If the schema adds columns later, recompute this.

4. **Never mix async `await` with the callback-style `db.transaction()`**

   - The callback API (`tx.executeSql(...)`) must be synchronous — no awaits inside.
   - Use one or the other, not both.

5. **Don’t leak statements.**

   - Expo’s internal implementation may not finalize prepared statements automatically.
   - A dangling prepared statement can cause the next `withExclusiveTransactionAsync` to fail with “database is locked”.

6. **Safe patterns for writes:**

   - Small writes → `withTransactionAsync` (same connection, no concurrency)
   - Large or critical batch writes → `withExclusiveTransactionAsync` + retry loop
   - Full control → manual `BEGIN IMMEDIATE / COMMIT / ROLLBACK` on the same connection

**Request for Cursor:**
Audit all `db.runAsync`, `db.execAsync`, and transaction calls for:

- possible `await` inside `withTransactionAsync` (replace with exclusive or manual BEGIN/COMMIT);
- unbounded concurrent calls that could collide on the write lock;
- any statement generating more than 999 bound parameters.

Ensure that all async inserts, updates, or deletes are **serialized** or **retry-safe**, and that every transaction path explicitly commits or rolls back before any new query can start.

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
├── friendService.ts         # Friend request operations with subcollection management
├── presenceService.ts       # Online presence and heartbeat management
├── userService.ts          # User profile operations
├── sqliteService.ts        # Local database operations
└── googleAuthService.ts     # Google OAuth integration

types/
├── Message.ts               # Message interface
├── Conversation.ts          # Conversation interface
├── User.ts                  # User interface with online and heartbeat fields
├── Friend.ts                # Friend interface for subcollection documents
├── FriendRequest.ts         # Friend request interface
├── Log.ts                   # Log type definitions
└── Note.ts                  # Note interface
```

## Firebase Configuration

### Project Setup

- **Project ID**: `messageai-862e3`
- **Database**: Firestore in production mode
- **Authentication**: Email/password auth
- **Cloud Functions**: OpenAI API integration
- **Cloud Messaging**: Push notifications
- **Security Rules**: Conversation-based access control

### Database Schema

**New Data Structures (Friends Subcollection & Online Presence)**:

```typescript
// User documents now include presence fields
interface User {
  // ... existing fields
  online: boolean; // Real-time online status
  heartbeat: Timestamp; // Last heartbeat timestamp (30s intervals)
}

// Friends subcollection: /users/{userId}/friends/{friendId}
interface Friend {
  id: string; // Friend's user ID
  addedAt: Timestamp; // When friendship was established
}

// Friend requests preserved for audit trail
interface FriendRequest {
  // ... existing fields (unchanged)
}
```

**Architecture Benefits**:

- **O(1) Friend Lookups**: Subcollection queries instead of O(n) collection scans
- **Minimal Storage**: Friend documents store only essential data
- **Audit Trail**: friendRequests collection preserved for compliance
- **Real-time Presence**: 30-second heartbeat with 40-second timeout
- **Scalable**: Works efficiently with millions of users
- **Security Compliance**: Users only update their own friend subcollections
- **Real-time Subscriptions**: Comprehensive friend request and friend management

```typescript
// Users Collection
interface User {
  id: string;
  email: string;
  displayName: string;
  avatar?: string;
  languagePreferences: string[];
  aiSettings: {
    autoTranslate: boolean;
    culturalHints: boolean;
    formalityAdjustment: boolean;
  };
  blockedUsers: string[]; // Array of user IDs
  createdAt: Timestamp;
  lastSeen: Timestamp;
  online: boolean; // Real-time online status
  heartbeat: Timestamp; // Last heartbeat timestamp
}

// Friends Collection (subcollection under users)
interface Friend {
  id: string; // Friend's user ID
  addedAt: Timestamp;
}

// Friend Requests Collection
interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Conversations Collection
interface Conversation {
  id: string;
  participants: string[]; // Array of user IDs
  lastMessage?: {
    id: string;
    content: string;
    senderId: string;
    timestamp: Timestamp;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Messages Collection (subcollection under conversations)
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: Timestamp;
  readBy: { [userId: string]: Timestamp };
  messageType: "text" | "image" | "file";
}
```

## Dependencies

### Core Dependencies

```json
{
  "expo": "~54.0.13",
  "react": "18.3.1",
  "react-native": "0.81.4",
  "expo-router": "~6.0.12",
  "firebase": "^10.14.0",
  "zustand": "^4.5.5",
  "expo-sqlite": "~15.0.1",
  "expo-crypto": "~14.0.1"
}
```

### Development Dependencies

```json
{
  "typescript": "~5.3.3",
  "@types/react": "~18.2.79",
  "@types/react-native": "~0.73.0",
  "eslint": "^9.25.0",
  "eslint-config-expo": "~10.0.0"
}
```

## Environment Setup

### Required Environment Variables

```bash
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key-here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### Development Setup

1. **Clone and install dependencies**

   ```bash
   git clone <repository-url>
   cd rn-firebase-hello-world
   npm install
   ```

2. **Configure Firebase**

   - Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Firestore Database and Authentication (email/password)
   - Copy `.env.template` to `.env.local` and fill in Firebase config

3. **Run the app**
   ```bash
   npx expo start
   ```

## Performance Considerations

### Firestore Optimization

- **Subcollection Architecture**: 50% reduction in operations
- **Composite Indexes**: Required for conversation queries
- **Real-time Listeners**: Efficient subscription management
- **Security Rules**: Optimized for conversation-based access

### Memory Management

- **Windowed Loading**: 100 messages per conversation maximum
- **Conversation Lifecycle**: Load/unload with subscription cleanup
- **SQLite Caching**: Local persistence for offline support
- **Zustand State**: In-memory state with proper cleanup

### Network Optimization

- **Incremental Sync**: Only fetch new messages since last sync
- **Offline Queue**: SQLite message queuing for reliability
- **Retry Logic**: Exponential backoff for failed operations
- **Connection Monitoring**: Automatic reconnection handling
