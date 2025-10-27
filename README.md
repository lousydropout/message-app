# MessageAI

A React Native messaging smart phone application with AI-powered features for international communicators. Built with Firebase, Zustand, and SQLite for robust offline-first messaging.

## 🎯 Project Goals & Persona

**Target Persona**: International Communicator

- Professionals, students, and travelers who regularly communicate across language barriers
- Need real-time translation, cultural context hints, and formality adjustment
- Require reliable messaging with offline support for global connectivity

## ✨ Features

### Core Messaging Infrastructure

- **Real-time Messaging**: Sub-200ms message delivery with Firestore onSnapshot listeners
- **User Authentication**: Email/password authentication with comprehensive debugging and error handling
- **Contact Management**: Friend requests, user search, contact lists, and blocking functionality
- **Online Presence**: Real-time online status with heartbeat mechanism and app lifecycle integration
- **Group Messaging**: Support for 3+ users in conversations with participant management
- **Message Features**: Real-time read receipts, typing indicators, message attribution, and unread counts
- **Offline Support**: SQLite message queuing with automatic sync on reconnection
- **Network Visibility**: Discreet status indicator with detailed information modal and manual controls
- **Cross-platform**: Works consistently on iOS and Android
- **Performance**: FlashList optimization for smooth scrolling through 1000+ messages
- **Android Compatibility**: Comprehensive fix for text cutoff issues
- **Diagnostics**: Comprehensive logging system with SQLite persistence and console integration
- **Architecture**: Unified queue-first architecture with three-tier data flow and sequential message processing

### Friends & Online Presence

- **Scalable Friend Management**: O(1) friend lookups using Firestore subcollections
- **Real-time Online Status**: See when friends are online/offline with heartbeat mechanism
- **App Lifecycle Integration**: Automatic presence updates on background/foreground transitions
- **Crash-Resistant Design**: 40-second timeout for reliable offline detection
- **Audit Trail**: Complete friend request history preserved for compliance
- **Minimal Storage**: Friend documents store only essential data, profiles cached in SQLite

### AI-Powered Translation & Communication

- **Context-Aware Translation**: AI analyzes conversation history for accurate translations
- **Tool Calling System**: AI can request additional context when confidence is low
- **RAG Integration**: SQLite-based retrieval system for conversation context
- **Cultural Context Hints**: Automatic cultural notes and formality guidance
- **Language Detection**: Automatic source language detection
- **Two-Phase Translation**: Exploratory phase determines if more context is needed
- **Real-time Progress**: Live status updates during translation process
- **Confidence Scoring**: AI provides confidence levels for translation accuracy
- **Reference Analysis**: Identifies and explains references to earlier messages

## 📊 Performance Metrics

### Achieved Performance Targets

- **Message Delivery**: <200ms on good network (Firestore real-time listeners)
- **App Launch**: <2s to chat screen (optimized initialization)
- **Memory Usage**: Bounded to 100 messages per conversation (windowed Zustand)
- **Offline Sync**: <1s after reconnection (incremental sync)
- **Database Operations**: 99.7% improvement in conversation loading (6,900ms → 18ms)
- **Cross-platform**: Consistent experience on iOS, Android, and Web
- **Firestore Operations**: 50% reduction with subcollection architecture
- **Read Receipts**: Real-time behavior with proper timing (entry vs exit)
- **Friend Management**: O(1) friend lookups with subcollection architecture
- **Online Presence**: 30-second heartbeat with 40-second timeout for reliability

### Architecture Performance

- **Three-tier Data Flow**: Firestore (Authoritative) → SQLite (Cache) → Zustand (Memory)
- **Unified Queue-First**: All messages queue first, process immediately if online
- **Sequential Processing**: Messages processed one by one to maintain order and prevent race conditions
- **UUID-based Idempotency**: Prevents duplicate messages throughout lifecycle
- **Incremental Sync**: Only fetch new messages using `getMessagesSince()`
- **Memory Management**: Conversation lifecycle with load/unload patterns
- **Scalable Friends**: Subcollection-based friend management for millions of users
- **Presence Tracking**: Heartbeat mechanism with app lifecycle integration

## 🚀 Quick Start

### Prerequisites

- Node.js 22
- Firebase project with Firestore enabled
- iPhone and/or Android device with Expo Go app installed

### Installation

1. **Clone and install dependencies**

   ```bash
   git clone <repository-url>
   cd rn-firebase-hello-world
   npm install
   ```

2. **Configure Firebase**

   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Firestore Database and Authentication (email/password)
   - Copy `.env.template` to `.env` and fill in your Firebase config:

   ```bash
   cp .env.template .env
   ```

   Then edit `.env` with your Firebase project details:

   ```bash
   # Firebase Configuration
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=
   EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key-here
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
   EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
   EXPO_PUBLIC_DATABASE_URL=your-firestore-url

   # From the AWS CDK deployment in `server/`
   EXPO_PUBLIC_API_URL=your-api-server-url
   ```

3. **Deploy Firestore Security Rules**

   ```bash
   firebase deploy --only firestore:rules
   ```

4. **Deploy Firestore Indexes**

   ```bash
   firebase deploy --only firestore:indexes
   ```

5. **Start the development server**

   ```bash
   npx expo start --clear
   ```

6. **Open on device**

   - Scan QR code with Expo Go (iOS/Android)
   - Press `r` to refresh all connected devices

## 🔧 Troubleshooting

### Common Issues

**Firebase Connection Issues**

- Ensure Firebase project has Firestore and Authentication enabled
- Verify all environment variables in `.env.local` are correct
- Check Firebase console for any quota limits or billing issues
- Run `firebase deploy --only firestore:rules` to ensure rules are deployed

**Expo Go Connection Issues**

- Make sure device and computer are on the same network
- Try `npx expo start --clear` to clear cache
- Restart Expo Go app if QR code scanning fails
- Use tunnel mode: `npx expo start --tunnel` for network issues

**Message Sync Issues**

- Check network status indicator (top-right corner)
- Use Diagnostics tab to view detailed logs
- Force sync by tapping refresh button in network modal
- Check SQLite database in Diagnostics for queued messages

**Performance Issues**

- Monitor memory usage in Diagnostics tab (in dev mode)

### Debug Tools

- **Diagnostics Tab**: Comprehensive logging system with SQLite persistence and copy functionality
- **Network Status**: Real-time connection monitoring with manual controls and Firebase state tracking
- **Console Logs**: All application logs automatically appear in console with try-catch safety
- **SQLite Inspector**: View local database state, queued messages, and log history
- **Authentication Debugging**: Complete authentication flow tracking with error context
- **Log Filtering**: Filter logs by level (Verbose, Error, Warning, Info, Debug)
- **Export Logs**: Copy formatted logs to clipboard for external analysis

## 🏗️ Architecture

### Unified Queue-First Architecture

MessageAI implements a sophisticated **unified queue-first architecture** that ensures reliable message delivery and optimal performance across all network conditions.

#### Core Architecture Overview

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

#### Three-Tier Data Architecture

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

#### Message Lifecycle Flow

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
│  2. ALWAYS QUEUE FIRST (Unified Flow)                           │
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
│  3. PROCESS QUEUE (If Online)                                   │
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

#### Offline/Online Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE/ONLINE SYNC FLOW                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    OFFLINE SCENARIO                        │ │
│  │                                                            │ │
│  │  User Types Message → Queue in SQLite → Wait               │ │
│  │                                                            │ │
│  │  • Message stored with UUID in queued_messages table       │ │
│  │  • Optimistic UI update (shows "sending" status)           │ │
│  │  • Network status indicator shows "offline"                │ │
│  │  • No Firestore operations attempted                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    RECONNECTION                            │ │
│  │                                                            │ │
│  │  Network Status: Offline → Online                          │ │
│  │                                                            │ │
│  │  • Connection store detects network change                 │ │
│  │  • Triggers processQueue() (send queued messages)          │ │
│  │  • Triggers syncMissedMessages() (fetch new messages)      │ │
│  │  • Updates sync metadata (lastSyncedAt)                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    SYNC OPERATIONS                         │ │
│  │                                                            │ │
│  │  1. Process Queue:                                         │ │
│  │     • Send queued messages to Firestore                    │ │
│  │     • Remove from queue on success                         │ │
│  │     • Update retry count on failure                        │ │
│  │                                                            │ │
│  │  2. Sync Missed Messages (Incremental query):              │ │
│  │     • getMessagesSince(lastSyncedAt) for each conversation │ │
│  │     • Batch save to SQLite (INSERT OR REPLACE)             │ │
│  │     • Add new messages to Zustand (if conversation loaded) │ │
│  │     • Update lastSyncedAt timestamp                        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### Memory Management Strategy

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
│  │  │  • Load last MAX_MESSAGES_IN_MEMORY (100) messages    │ │ │
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
│  │  │  • Remove messages from Zustand state                 │ │ │
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

#### Subscription Architecture

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
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  useEffect(() => {                                      │ │ │
│  │  │    if (user) {                                          │ │ │
│  │  │      loadConversations(user.uid);                       │ │ │
│  │  │      subscribeToConversations(user.uid);                │ │ │
│  │  │    }                                                    │ │ │
│  │  │  }, [user]);                                            │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
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
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  useEffect(() => {                                      │ │ │
│  │  │    loadConversationMessages(conversationId);            │ │ │
│  │  │    return () => {                                       │ │ │
│  │  │      unloadConversationMessages(conversationId);        │ │ │
│  │  │    };                                                   │ │ │
│  │  │  }, [conversationId]);                                  │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  │  On Updates:                                                 │ │
│  │  • New messages appear instantly (<200ms)                    │ │
│  │  • Read receipt updates propagate                            │ │
│  │                                                              │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  Message Callback Handler:                              │ │ │
│  │  │                                                         │ │ │
│  │  │  1. Save ALL messages to SQLite (upsert)                │ │ │
│  │  │     await sqliteService.saveMessagesBatch(messages)     │ │ │
│  │  │                                                         │ │ │
│  │  │  2. Update Zustand state (conversation view)            │ │ │
│  │  │     • Find new messages (not in current state)          │ │ │
│  │  │     • Update read receipts for existing messages        │ │ │
│  │  │     • Merge and limit to 100 messages                   │ │ │
│  │  │     • Trigger UI re-render                              │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                SUBSCRIPTION LIFECYCLE                        │ │
│  │                                                              │ │
│  │  App Start:                                                  │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  User Login → ConversationsList mounts                  │ │ │
│  │  │  → subscribeToConversations() (persistent)              │ │ │
│  │  │  → Monitor conversation list changes                    │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  │  Enter Conversation:                                         │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  User taps conversation → ConversationView mounts       │ │ │
│  │  │  → loadConversationMessages()                           │ │ │
│  │  │  → Load MAX_MESSAGES_IN_MEMORY (100) messages from SQLite│ │ │
│  │  │  → subscribeToMessages() (conversation-specific)        │ │ │
│  │  │  → Real-time message updates                            │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  │  Leave Conversation:                                         │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  User navigates away → ConversationView unmounts        │ │ │
│  │  │  → unloadConversationMessages()                         │ │ │
│  │  │  → Unsubscribe from messages                            │ │ │
│  │  │  → Clear Zustand state (free memory)                    │ │ │
│  │  │  → Messages remain in SQLite cache                      │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  │  App Close:                                                  │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  User logout → clearAllData()                           │ │ │
│  │  │  → Unsubscribe from conversations                       │ │ │
│  │  │  → Clear all subscriptions                              │ │ │
│  │  │  → Clear all state                                      │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

#### Error Handling & Retry Logic

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING & RETRY LOGIC                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    QUEUE PROCESSING                            │ │
│  │                                                                │ │
│  │  processQueue() with Mutex Protection:                         │ │
│  │                                                                │ │
│  │  ┌───────────────────────────────────────────────────────────┐ │ │
│  │  │  if (queueProcessingMutex) return; // Prevent concurrent  │ │ │
│  │  │  queueProcessingMutex = true;                             │ │ │
│  │  │                                                           │ │ │
│  │  │  try {                                                    │ │ │
│  │  │    for (const queuedMessage of queuedMessages) {          │ │ │
│  │  │      try {                                                │ │ │
│  │  │        await messageService.sendMessage(messageId,        │ │ |
│  │  │          conversationId, senderId, text)                  │ │ │
│  │  │        await sqliteService.removeQueuedMessage(id)        │ │ │
│  │  │      } catch (error) {                                    │ │ │
│  │  │        await sqliteService.updateQueuedMessageRetry(      │ │ │
│  │  │          id, error.message, retryCount + 1                │ │ │
│  │  │        )                                                  │ │ │
│  │  │      }                                                    │ │ │
│  │  │    }                                                      │ │ │
│  │  │  } finally {                                              │ │ │
│  │  │    queueProcessingMutex = false;                          │ │ │
│  │  │  }                                                        │ │ │
│  │  └───────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    RETRY STRATEGY                              │ │
│  │                                                                │ │
│  │  • Max Retry Count: 3 attempts                                 │ │
│  │  • Exponential Backoff: 1s, 2s, 4s delays                      │ │
│  │  • Error Tracking: Store error message in SQLite               │ │
│  │  • User Feedback: Show "failed" status in UI                   │ │
│  │  • Manual Retry: User can tap failed message to retry          │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## 🔐 Advanced AI Translation Architecture

MessageAI implements a sophisticated AI translation system with tool calling and RAG (Retrieval-Augmented Generation) capabilities that protects API keys while providing context-aware translation and cultural guidance for international communicators.

### Security-First Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURE AI TRANSLATION FLOW                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    MESSAGEAI APP                           │ │
│  │                                                            │ │
│  │  User Types Message → Translation Request → API Server     │ │
│  │                                                            │ │
│  │  • No API keys stored in app                              │ │
│  │  • Firebase ID token for authentication                   │ │
│  │  • Secure HTTPS communication                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  API SERVER (AWS Lambda)                   │ │
│  │                                                            │ │
│  │  1. Firebase Admin Authentication                          │ │
│  │     • Verifies Firebase ID token                           │ │
│  │     • Confirms user is authenticated                       │ │
│  │                                                            │ │
│  │  2. OpenAI API Integration                                 │ │
│  │     • Secure API key storage (server-side only)           │ │
│  │     • GPT-4.1-mini for translation + cultural context      │ │
│  │                                                            │ │
│  │  3. Response Format                                        │ │
│  │     • Translation result                                   │ │
│  │     • Cultural context and formality notes                │ │
│  │     • JSON response to MessageAI                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### API Server Features

- **Firebase Admin Authentication**: Verifies user identity using Firebase ID tokens
- **Secure API Key Management**: OpenAI API key stored server-side, never exposed to client
- **Tool Calling System**: AI can request additional context when confidence is low
- **Two-Phase Translation**: Exploratory and execution phases for optimal accuracy
- **RAG Integration**: Context retrieval from conversation history
- **Cultural Context & Formality**: Uses GPT-4.1-mini for accurate translations with cultural notes
- **Language Detection**: Automatic source language identification
- **Confidence Scoring**: AI provides confidence levels for translation accuracy
- **AWS Lambda Deployment**: Serverless architecture for cost-effective scaling
- **HTTPS Security**: All communication encrypted in transit

### Advanced Translation Flow

1. **User Input**: User taps message to translate in MessageAI app
2. **Authentication**: App sends Firebase ID token with translation request
3. **Server Validation**: API Server verifies token using Firebase Admin SDK
4. **Exploratory Phase**: AI analyzes message and conversation history
5. **Tool Calling Decision**: AI either translates directly or requests more context
6. **RAG Search** (if needed): SQLite FTS5 search for relevant conversation context
7. **Execution Phase**: AI translates with full context and cultural awareness
8. **Response**: Server returns translation, cultural notes, and confidence score
9. **Display**: MessageAI shows translation with progress indicators and cultural context

### MiniGraph AI Orchestrator

MessageAI uses a custom MiniGraph implementation (inspired by LangGraph) to orchestrate complex AI workflows. The orchestrator manages the two-phase translation process with intelligent context retrieval and tool calling capabilities.

```
┌─────────────────────────────────────────────────────────────────┐
│                    MINIGRAPH AI ORCHESTRATOR                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    TRANSLATION CONTEXT                     │ │
│  │                                                            │ │
│  │  • Message to translate                                    │ │
│  │  • Conversation history (last 5 messages)                  │ │
│  │  • Speaker and audience information                        │ │
│  │  • Target language preference                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    NODE: TRANSLATE                         │ │
│  │                                                            │ │
│  │  Phase: Exploratory                                        │ │
│  │  Action: Call /translate/explore                           │ │
│  │                                                            │ │
│  │  AI Decision:                                              │ │
│  │  • High confidence (>95%) → Direct translation             │ │
│  │  • Low confidence (<95%) → Request more context            │ │
│  │                                                            │ │
│  │  Response Types:                                           │ │
│  │  ┌─────────────────┐    ┌─────────────────┐                │ │
│  │  │   Translation   │    │   Tool Call     │                │ │
│  │  │   Response      │    │   Response      │                │ │
│  │  │                 │    │                 │                │ │
│  │  │ • translated    │    │ • search_terms  │                │ │
│  │  │ • cultural_notes│    │ • reason        │                │ │
│  │  │ • confidence    │    │ • confidence    │                │ │
│  │  └─────────────────┘    └─────────────────┘                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    NODE: SEARCH                            │ │
│  │                                                            │ │
│  │  Trigger: Tool Call Response                               │ │
│  │  Action: SQLite FTS5 Search                                │ │
│  │                                                            │ │
│  │  Process:                                                  │ │
│  │  1. Extract search terms from AI response                  │ │
│  │  2. Perform FTS5 search in SQLite database                 │ │
│  │  3. Retrieve relevant conversation context                 │ │
│  │  4. Format context for AI consumption                      │ │
│  │                                                            │ │
│  │  Context Enhancement:                                      │ │
│  │  • Find messages containing search terms                   │ │
│  │  • Include speaker names and timestamps                    │ │
│  │  • Limit to 5 most relevant results                        │ │
│  │  • Deduplicate and sort by relevance                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    NODE: TRANSLATE                         │ │
│  │                                                            │ │
│  │  Phase: Execution                                          │ │
│  │  Action: Call /translate/execute                           │ │
│  │                                                            │ │
│  │  Enhanced Context:                                         │ │
│  │  • Original message                                        │ │
│  │  • Conversation history                                    │ │
│  │  • Additional context from FTS5 search                     │ │
│  │  • Speaker and audience information                        │ │
│  │                                                            │ │
│  │  AI Processing:                                            │ │
│  │  • Analyze full context for cultural nuances               │ │
│  │  • Identify references to earlier messages                 │ │
│  │  │  • Adjust formality based on conversation tone          │ │
│  │  │  • Provide cultural context and explanations            │ │
│  │  │  • Generate confidence score for translation            │ │
│  │                                                            │ │
│  │  Final Response:                                           │ │
│  │  • translated_text: Final translation                      │ │
│  │  • cultural_notes: Cultural context and guidance           │ │
│  │  • references_earlier: Boolean flag                        │ │
│  │  • reference_detail: Explanation of references             │ │
│  │  • confidence: AI confidence score (0-100)                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    NODE: DONE                              │ │
│  │                                                            │ │
│  │  Action: Stop execution                                    │ │
│  │  Result: Return translation to user                        │ │
│  │                                                            │ │
│  │  User Experience:                                          │ │
│  │  • Translation displayed in MessageBubble                  │ │
│  │  • Cultural notes shown in modal                           │ │
│  │  • Reference explanations provided                         │ │
│  │  • Confidence indicator displayed                          │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### State Machine Flow

```
┌─────────────┐    Tool Call     ┌─────────────┐    Enhanced     ┌─────────────┐
│  TRANSLATE  │ ───────────────► │   SEARCH    │ ──────────────► │  TRANSLATE  │
│ (Exploratory)│                 │             │                 │ (Execution) │
└─────────────┘                  └─────────────┘                 └─────────────┘
       │                                                               │
       │ Direct Translation                                            │
       │ (High Confidence)                                             │
       ▼                                                               ▼
┌─────────────┐                                                   ┌─────────────┐
│    DONE     │ ◄──────────────────────────────────────────────── │    DONE     |│             |                                                   |             |
│             │                                                   │             │
└─────────────┘                                                   └─────────────┘
```

#### Key Features

- **Intelligent Decision Making**: AI determines when additional context is needed
- **Context-Aware Translation**: Uses conversation history and cultural context
- **Tool Calling System**: AI can request specific information from the database
- **RAG Integration**: SQLite FTS5 search provides relevant conversation context
- **Confidence Scoring**: AI provides confidence levels for translation accuracy
- **Reference Analysis**: Identifies and explains references to earlier messages
- **Cultural Intelligence**: Provides cultural notes and formality guidance
- **Error Handling**: Graceful fallbacks and retry logic built into the graph

### Environment Configuration

The API Server URL is configured in your `.env` file:

```bash
# From the AWS CDK deployment in `server/`
EXPO_PUBLIC_API_URL=your-api-server-url
```

For detailed API Server setup and deployment, see the [`server/README.md`](server/README.md).

### Technology Stack

- **Frontend**: React Native 0.81.4 + Expo ~54.0.13
- **Backend**: Firebase (Firestore, Auth, Cloud Functions)
- **State Management**: Zustand 5.0.8
- **Local Database**: SQLite (expo-sqlite) + AsyncStorage
- **Navigation**: Expo Router ~6.0.12 (file-based routing)
- **Real-time**: Firestore onSnapshot listeners
- **AI Integration**: OpenAI GPT-4.1-mini (via secure API Server)
- **AI Orchestration**: MiniGraph (LangGraph-style state machine)
- **RAG System**: SQLite FTS5 full-text search
- **Tool Calling**: Two-phase translation with context retrieval
- **Performance**: FlashList for optimized list rendering
- **TypeScript**: Full type safety throughout

### Project Structure

```
app/                          # Expo Router pages
├── _layout.tsx               # Root layout with auth initialization
├── (tabs)/                   # Tab navigation
│   ├── index.tsx            # Home (ConversationsList)
│   ├── contacts.tsx          # Contact management
│   └── profile.tsx           # User profile
├── conversation/[id].tsx    # Dynamic conversation route
├── auth/login.tsx           # Authentication
└── profile/edit.tsx         # Profile editing

components/                   # Reusable UI components
├── ConversationsList.tsx    # Main conversations list
├── ConversationView.tsx     # Chat interface
├── MessageBubble.tsx        # Individual message component
├── ContactsList.tsx         # Contact/friend list
├── UserSearch.tsx           # User search functionality
├── TypingIndicator.tsx      # Real-time typing status
├── NetworkStatusBar.tsx    # Network status indicator
└── ui/                      # Shared UI components

stores/                       # Zustand state management
├── authStore.ts             # Authentication state
├── messagesStore.ts         # Real-time message management
├── contactsStore.ts         # Contact and friend management
└── connectionStore.ts       # Network connection status

services/                     # Business logic
├── authService.ts           # Authentication operations
├── messageService.ts        # Message CRUD operations
├── conversationService.ts   # Conversation management
├── friendService.ts         # Friend request operations with subcollection management
├── presenceService.ts       # Online presence and heartbeat management
├── userService.ts          # User profile operations
└── sqliteService.ts        # Local database operations

types/                        # TypeScript interfaces
├── Message.ts               # Message interface
├── Conversation.ts          # Conversation interface
├── User.ts                  # User interface with online and heartbeat fields
├── Friend.ts                # Friend interface for subcollection documents
└── FriendRequest.ts         # Friend request interface
```

## 🗄️ Data Structures

### Friends Subcollection & Online Presence

**New Data Architecture**:

```typescript
// User documents with presence tracking
interface User {
  id: string;
  email: string;
  displayName: string;
  // ... existing fields
  online: boolean; // Real-time online status
  heartbeat: Timestamp; // Last heartbeat (30s intervals)
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

## 📱 Current Status

**Current Status: Core messaging infrastructure complete**

- ✅ **Core Messaging Infrastructure** (Epic 1.1-1.8 Complete)
- ✅ **Data Management & Sync** (Epic 3.2 Complete)
- ✅ **Logger Console Integration** (Complete)
- ✅ **Firestore Rules Optimization** (Complete)
- ✅ **Firestore Subcollection Architecture** (Complete)
- ✅ **Read Receipt Timing Fix** (Complete)
- ✅ **Authentication Debugging** (Complete)
- ✅ **Friends Subcollection & Online Presence** (Epic 1.6 Complete)
- ✅ **Mobile Lifecycle Management** (Epic 2.1 Complete)
- ✅ **Performance Optimization** (Epic 2.2 - Next Phase)
- ✅ **AI Features Implementation** (Epic 5.1 - 80% Complete)
- ✅ **Documentation & Deployment** (Epic 4)

### Recent Major Accomplishments

**AI Features with Tool Calling & RAG** ✅

- **Context-Aware Translation**: AI analyzes conversation history for accurate translations
- **Tool Calling System**: AI can request additional context when confidence is low (>95% threshold)
- **RAG Integration**: SQLite FTS5 search for relevant conversation context
- **Two-Phase Translation**: Exploratory phase determines if more context is needed
- **MiniGraph Orchestration**: LangGraph-style state machine for complex AI workflows
- **Cultural Context**: Automatic cultural notes and formality guidance
- **Language Detection**: Automatic source language identification
- **Confidence Scoring**: AI provides confidence levels for translation accuracy
- **Reference Analysis**: Identifies and explains references to earlier messages
- **Real-time Progress**: Live status updates during translation process

## 🔧 Development

### Script

```bash
npx expo start --clear          # Start Expo development server
```

### Environment Variables

Copy the template file and fill in your Firebase configuration:

```bash
cp .env.template .env
```

Then edit `.env` with your Firebase project details:

```bash
# Firebase Configuration
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key-here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

### Firebase Setup

1. **Firestore Security Rules** (production-ready configuration):

✅ **Note**: The following rules implement proper security with Principle of Least Privilege. These are production-ready security rules.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own profile
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;

      // Friends subcollection - users can read their own friends
      match /friends/{friendId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
    }

    // Friend requests - users can read their own requests
    match /friendRequests/{requestId} {
      allow read: if request.auth != null &&
        (request.auth.uid == resource.data.fromUserId ||
         request.auth.uid == resource.data.toUserId);
      allow create: if request.auth != null &&
        request.auth.uid == request.resource.data.fromUserId;
      allow update: if request.auth != null &&
        (request.auth.uid == resource.data.fromUserId ||
         request.auth.uid == resource.data.toUserId);
      allow delete: if request.auth != null &&
        request.auth.uid == resource.data.fromUserId;
    }

    // Conversations - only participants can access
    match /conversations/{conversationId} {
      allow read: if request.auth != null &&
        resource.data.participants.hasAny([request.auth.uid]);
      allow create: if request.auth != null &&
        request.resource.data.participants.hasAny([request.auth.uid]);
      allow update: if request.auth != null &&
        resource.data.participants.hasAny([request.auth.uid]);

      // Typing indicators subcollection - only accessible by conversation participants
      match /typing/{userId} {
        // Everyone in the conversation can read who's typing
        allow read: if request.auth != null &&
          get(/databases/$(database)/documents/conversations/$(conversationId))
            .data.participants.hasAny([request.auth.uid]);

        // Only the owner can write their own typing doc
        allow write: if request.auth != null &&
          request.auth.uid == userId &&
          get(/databases/$(database)/documents/conversations/$(conversationId))
            .data.participants.hasAny([request.auth.uid]);
      }
      // Messages subcollection - inherits conversation access
      match /messages/{messageId} {
        allow read, write: if request.auth != null &&
          get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants
            .hasAny([request.auth.uid]);
      }
    }
  }
}
```

2. **Firestore Indexes** (optimized for production queries):

**Index Optimization Summary**:

- **Conversations**: Optimized for user conversation lists and direct conversation lookups
- **Friend Requests**: Optimized for incoming, outgoing, and bidirectional request queries
- **Automatic Indexes**: Single-field indexes (email, displayName, id, updatedAt, isTyping) are handled automatically by Firestore
- **Minimal Configuration**: Only composite indexes that Firestore cannot auto-generate are manually defined
- **Removed**: Obsolete "notes" collection indexes (not used in current implementation)

**Index Strategy**:

- **Single-field queries**: Firestore automatically creates ascending/descending indexes
- **Range queries**: Work with automatic single-field indexes (e.g., `where("email", ">=", term)`)
- **Composite queries**: Manual indexes required for equality + array-contains combinations
- **Subcollection queries**: Already scoped to specific conversation, no parent document fields needed

```json
{
  "indexes": [
    {
      "collectionGroup": "conversations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "participants", "arrayConfig": "CONTAINS" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "conversations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "participants", "arrayConfig": "CONTAINS" }
      ]
    },
    {
      "collectionGroup": "friendRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "toUserId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "friendRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "fromUserId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "friendRequests",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "fromUserId", "order": "ASCENDING" },
        { "fieldPath": "toUserId", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

## ⚠️ Known Issues

### Current Limitations

- **Google OAuth**: Not implemented (email/password auth only)

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Follow the existing code style and patterns
4. Add tests for new functionality
5. Update documentation as needed
6. Submit a pull request

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for public functions
- Use the existing logging system (`logger.info()`, `logger.error()`)
- Test on both iOS and Android devices

### Reporting Issues

- Use the Diagnostics tab to gather logs
- Include device information and steps to reproduce
- Check existing issues before creating new ones
- Provide console logs and SQLite database state when possible

## 🔒 Security Notice

**✅ Production-Ready Security**: This project implements comprehensive security with Principle of Least Privilege. See `firestore.rules` for production-ready security rules.

**Security Features Implemented**:

- ✅ **Firestore Security Rules**: Production-ready rules with proper access controls
- ✅ **User Authentication**: Firebase Auth with email/password authentication
- ✅ **API Key Protection**: OpenAI API keys stored server-side only
- ✅ **Data Access Control**: Users can only access their own data and conversations they participate in
- ✅ **Friend Management**: Secure friend subcollection with proper permissions
- ✅ **Message Security**: Messages only accessible by conversation participants
- ✅ **Typing Indicators**: Secure typing status with participant-only access

**Additional Security Considerations**:

- Configure Firebase App Check for additional security
- Monitor Firestore usage and set up alerts
- Regular security audits and rule reviews
- Implement rate limiting for API endpoints

For detailed security guidelines, see `docs/SECURITY.md` and `firestore.rules`.
