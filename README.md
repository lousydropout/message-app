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

### Three-Tier Data Architecture

```
Firestore (Authoritative Truth - Expensive)
    ↓ Real-time subscription + Incremental sync
SQLite (Persistent Cache - ALL messages)
    ↓ Load most recent 200 on conversation open
Zustand (In-Memory Window - Last 200 messages)
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

### Next Phase: Epic 3.2 Data Management & Sync

**Status**: Planning Complete, Ready for Implementation

The team has designed a unified queue-first architecture to fix current offline sync issues:

- **Problem**: `syncQueuedMessages()` doesn't work properly, creating dual-path complexity
- **Solution**: Unified queue-first flow with UUID-based idempotency
- **Implementation**: 11-step plan ready for execution

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

1. **Firestore Security Rules** (already configured):

Note: The following rule is incredible permissive and UNSAFE. Only use for development purposes. Will need to be updated in the future.

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

2. **Firestore Indexes** (deployed indexes - view with `firebase firestore:indexes`):

```json
{
  "indexes": [
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
        },
        {
          "fieldPath": "__name__",
          "order": "DESCENDING"
        }
      ],
      "density": "SPARSE_ALL"
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
          "fieldPath": "timestamp",
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
        },
        {
          "fieldPath": "__name__",
          "order": "ASCENDING"
        }
      ],
      "density": "SPARSE_ALL"
    },
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
    }
  ]
}
```
