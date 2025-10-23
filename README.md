# MessageAI

A React Native messaging smart phone application. Built with Firebase, Zustand, and SQLite for robust offline-first messaging.

## ✨ Features

### Core Messaging Infrastructure

- **Real-time Messaging**: Message delivery with Firestore onSnapshot listeners
- **User Authentication**: Email/password authentication with Firebase Auth and profile management
- **Contact Management**: Friend requests, user search, contact lists, and blocking functionality
- **Group Messaging**: Support for 3+ users in conversations with participant management
- **Message Features**: Read receipts, typing indicators, message attribution, and unread counts
- **Offline Support**: SQLite message queuing with automatic sync on reconnection
- **Network Visibility**: Discreet status indicator with detailed information modal and manual controls
- **Cross-platform**: Works consistently on iOS and Android
- **Performance**: FlashList optimization for smooth scrolling through 1000+ messages
- **Android Compatibility**: Comprehensive fix for text cutoff issues

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
   - **Enable Realtime Database** (required for Firestore real-time listeners to work properly)
   - Copy `.env.template` to `.env.local` and fill in your Firebase config:

   ```bash
   cp .env.template .env.local
   ```

   Then edit `.env.local` with your Firebase project details:

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

### Technology Stack

- **Frontend**: React Native 0.81.4 + Expo ~54.0.13
- **Backend**: Firebase (Firestore, Auth, Cloud Functions)
- **State Management**: Zustand 5.0.8
- **Local Database**: SQLite (expo-sqlite) + AsyncStorage
- **Navigation**: Expo Router ~6.0.12 (file-based routing)
- **Real-time**: Firestore onSnapshot listeners
- **AI Integration**: OpenAI API (via Firebase Functions)
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
├── friendService.ts         # Friend request operations
├── userService.ts          # User profile operations
└── sqliteService.ts        # Local database operations

types/                        # TypeScript interfaces
├── Message.ts               # Message interface
├── Conversation.ts          # Conversation interface
├── User.ts                  # User interface
└── FriendRequest.ts         # Friend request interface
```

## 📱 Current Status

- ✅ **Core Messaging Infrastructure**
- 🚧 **Mobile App Quality**
- 🚧 **Technical Implementation**
- 🚧 **Documentation & Deployment**
- 🚧 **AI Features Implementation**

### Completed Epics

- ✅ **Epic 1.1**: Authentication & User Management
- ✅ **Epic 1.2**: Contact Management & Social Features
- ✅ **Epic 1.3**: Profile Management & Navigation
- ✅ **Epic 1.4**: Real-time Messaging Core
- ✅ **Epic 1.5**: Message Features & Status
- ✅ **Epic 1.6**: Offline Support & Persistence
- ✅ **Epic 1.7**: Network Connectivity Visibility

### Completed: Epic 3.2 Data Management & Sync

**Status**: ✅ **COMPLETE** - Offline-first conversation loading implemented

**Major Achievements**:

- **Performance**: Fixed offline conversation loading (6,900ms → 18ms, 99.7% improvement)
- **Architecture**: Implemented offline-first conversation loading using SQLite cache
- **Bug Fixes**: Eliminated double loading issue (746ms → 27ms, 96% improvement)
- **Total Impact**: Conversation screen load time reduced from 7,000ms+ to ~45ms

**Technical Implementation**:

- ✅ Replaced Firestore `getDoc()` with SQLite `getConversation()` for initial load
- ✅ Added conversation caching to subscription callback for offline access
- ✅ Fixed double loading by removing unnecessary useEffect dependency
- ✅ Maintained real-time updates via Firestore subscriptions
- ✅ Complete offline-first messaging experience

## 🔧 Development

### Script

```bash
npx expo start --clear          # Start Expo development server
```

### Environment Variables

Copy the template file and fill in your Firebase configuration:

```bash
cp .env.template .env.local
```

Then edit `.env.local` with your Firebase project details:

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

1. **Firestore Security Rules** (current configuration):

⚠️ **Note**: The following rules are extremely permissive and UNSAFE. Only use for development purposes. Production deployment will require proper security rules.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Ultra permissive rules for development - allow everything
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

2. **Firestore Indexes** (current deployed indexes):

```json
{
  "indexes": [
    {
      "collectionGroup": "notes",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "userId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "updatedAt",
          "order": "DESCENDING"
        },
        {
          "fieldPath": "__name__",
          "order": "DESCENDING"
        }
      ],
      "density": "SPARSE_ALL"
    },
    {
      "collectionGroup": "conversations",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "participants",
          "arrayConfig": "CONTAINS"
        },
        {
          "fieldPath": "updatedAt",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "conversationId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "updatedAt",
          "order": "ASCENDING"
        }
      ]
    },
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "conversationId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "updatedAt",
          "order": "DESCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
```

3. **Realtime Database Setup**:

   - **Important**: Enable Realtime Database in your Firebase project
   - Go to Firebase Console → Realtime Database → Create Database
   - Choose "Start in test mode" for development
   - This is required for Firestore real-time listeners to work properly
