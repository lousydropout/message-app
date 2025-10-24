# System Patterns: MessageAI Architecture & Design Decisions

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Components │    │   Zustand       │    │   Firebase      │
│   (React Native)│◄──►│   Stores        │◄──►│   Services      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Expo Router   │    │   Real-time     │    │   SQLite        │
│   Navigation    │    │   Firestore     │    │   Offline Queue │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Key Design Patterns

### 1. Real-time Messaging Pattern (Subcollection Architecture)

**Firestore Subcollection Real-time Listeners:**

- Messages stored as `/conversations/{conversationId}/messages/{messageId}` subcollections
- Firestore onSnapshot for instant message delivery (<200ms)
- Messages inherit conversation access patterns naturally
- Real-time typing indicators via `/conversations/{conversationId}/typing/{userId}` subcollections
- Read receipts tracking via Firestore document updates
- **50% reduction in Firestore operations** compared to top-level message collection

**Architecture Benefits:**

- Simplified security rules (no cross-document `get()` calls)
- Better performance (inherited conversation access)
- Cleaner code paths (conversation-specific message references)
- Reduced Firestore costs (fewer read operations)
- Real-time read receipt behavior (immediate feedback to other users)

### 2. Friends & Presence Management Pattern

**Scalable Friend System:**

- Friends stored as `/users/{uId}/friends/{friendId}` subcollections for O(1) lookups
- Friend documents contain minimal data: `{id: string, addedAt: Timestamp}`
- Full user profiles cached in SQLite for performance
- friendRequests collection preserved for complete audit trail
- Bidirectional friendship maintenance (both users have friend documents)

**Online Presence System:**

- User documents include `online: boolean` and `heartbeat: Timestamp` fields
- 30-second heartbeat mechanism with 40-second timeout for crash detection
- App lifecycle integration (background/foreground presence management)
- Presence service singleton with comprehensive error handling and logging
- Real-time online status updates for all friends

**Data Structure Design:**

```typescript
// User documents with presence tracking
interface User {
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

**Architecture Benefits:**

- **O(1) Friend Lookups**: Subcollection queries instead of O(n) collection scans
- **Minimal Storage**: Friend documents store only essential data
- **Audit Trail**: friendRequests collection preserved for compliance
- **Real-time Presence**: 30-second heartbeat with 40-second timeout
- **Scalable**: Works efficiently with millions of users

### 3. State Management Pattern

**Zustand Stores** for complex messaging state:

- `authStore`: User authentication, email/password login, profiles, and presence management
- `messagesStore`: Real-time message management with conversations and typing status
- `contactsStore`: Contact and friend management with subcollection-based friend queries
- `presenceService`: Online status and heartbeat management (singleton service)
- `connectionStore`: Network connection status
- `loggerStore`: Comprehensive logging system with SQLite persistence

### 4. Hybrid Storage Pattern

**SQLite + AsyncStorage + Firestore:**

- **Firestore**: Authoritative source for real-time data
- **SQLite**: Local cache for offline support and message queuing
- **AsyncStorage**: User preferences and auth state persistence
- **Zustand**: In-memory state management with conversation lifecycle

**Three-tier Data Flow:**

1. **Firestore** (Authoritative) → Real-time subscriptions and authoritative data
2. **SQLite** (Cache) → Offline message queuing and local persistence
3. **Zustand** (Memory) → Windowed conversation state (100 messages max)

### 5. Unified Queue-First Architecture

**Message Processing Flow:**

- All messages flow through queue regardless of online/offline status
- UUID generation with `Crypto.randomUUID()` for idempotency
- Mutex-protected queue processing with retry logic
- Exponential backoff for failed operations
- Incremental sync with `getMessagesSince()` using Firestore composite indexes

**Memory Management:**

- Conversation lifecycle with load/unload patterns
- MAX_MESSAGES_IN_MEMORY = 100 per conversation
- Subscription management with proper cleanup
- Windowed message loading for performance

### 6. Error Handling & Logging Pattern

**Comprehensive Logging System:**

- SQLite-based log persistence with structured logging
- Console integration for development debugging
- Error tracking with context and stack traces
- Performance monitoring and metrics collection
- Service layer error propagation with proper UI handling

**Error Boundaries:**

- Service layer: Re-throw errors for UI handling
- Store layer: Enhanced error logging with context
- UI layer: User-friendly error messages and loading states
- Network layer: Automatic retry with exponential backoff

## Security Patterns

### Firestore Security Rules

- **Users**: Read access for all authenticated users, write access only for own profile
- **Friends**: Users can read/write their own friends subcollection
- **Conversations**: Only participants can access conversation data
- **Messages**: Inherit conversation access patterns
- **Friend Requests**: Users can read their own requests, create/update as appropriate

### Data Privacy

- User search with email/display name only (no profile data exposure)
- Friend status indicators without exposing full profiles
- Blocked users properly excluded from all queries
- Audit trail preservation for compliance

## Performance Patterns

### Optimization Strategies

- **Subcollection Architecture**: 50% reduction in Firestore operations
- **O(1) Friend Lookups**: Constant time instead of linear scans
- **Memory Management**: Windowed conversation loading
- **Incremental Sync**: Only fetch new messages since last sync
- **SQLite Caching**: Local persistence for offline support
- **Real-time Subscriptions**: Efficient Firestore listeners with proper cleanup

### Scalability Considerations

- **Friend System**: Subcollections scale to millions of users
- **Message System**: Conversation-based partitioning
- **Presence System**: Heartbeat mechanism with timeout handling
- **Offline Support**: Queue-first architecture handles network issues
- **Memory Usage**: Bounded to 100 messages per conversation
