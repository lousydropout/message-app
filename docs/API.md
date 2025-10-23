# API Documentation

This document provides comprehensive API documentation for MessageAI's service layer and store layer, including data models, function signatures, and usage examples.

## Table of Contents

- [Service Layer APIs](#service-layer-apis)
  - [MessageService](#messageservice)
  - [ConversationService](#conversationservice)
  - [FriendService](#friendservice)
  - [UserService](#userservice)
  - [SQLiteService](#sqliteservice)
- [Store Layer APIs](#store-layer-apis)
  - [MessagesStore](#messagesstore)
  - [AuthStore](#authstore)
  - [ContactsStore](#contactsstore)
  - [ConnectionStore](#connectionstore)
  - [LoggerStore](#loggerstore)
- [Data Models](#data-models)
  - [Message](#message)
  - [Conversation](#conversation)
  - [User](#user)
  - [FriendRequest](#friendrequest)
  - [Log](#log)

---

## Service Layer APIs

### MessageService

Core message operations with Firestore integration and idempotency guarantees.

#### `sendMessage(messageId, conversationId, senderId, text)`

Sends a message to Firestore with idempotency guarantees.

**Parameters:**

- `messageId: string` - UUID generated at message creation (idempotent)
- `conversationId: string` - Target conversation ID
- `senderId: string` - User ID of sender
- `text: string` - Message content

**Returns:** `Promise<Message>` - The created or existing message

**Throws:** `Error` if Firestore operation fails

**Example:**

```typescript
const message = await messageService.sendMessage(
  "msg-uuid-123",
  "conv-456",
  "user-789",
  "Hello, world!"
);
```

#### `getMessages(conversationId, limit?, offset?)`

Retrieves messages for a conversation with pagination.

**Parameters:**

- `conversationId: string` - Target conversation ID
- `limit: number` - Maximum messages to fetch (default: 50)
- `offset: number` - Number of messages to skip (default: 0)

**Returns:** `Promise<Message[]>` - Array of messages

**Example:**

```typescript
const messages = await messageService.getMessages("conv-456", 20, 0);
```

#### `getMessagesSince(conversationId, lastSyncedAt, limitCount?)`

Fetches messages newer than a specific timestamp for incremental sync.

**Parameters:**

- `conversationId: string` - Target conversation ID
- `lastSyncedAt: number` - Timestamp of last successful sync (milliseconds)
- `limitCount: number` - Maximum messages to fetch (default: 100)

**Returns:** `Promise<Message[]>` - Array of new messages since lastSync

**Example:**

```typescript
const newMessages = await messageService.getMessagesSince(
  "conv-456",
  Date.now() - 3600000, // 1 hour ago
  50
);
```

#### `subscribeToMessages(conversationId, callback)`

Sets up real-time subscription for message updates.

**Parameters:**

- `conversationId: string` - Target conversation ID
- `callback: (messages: Message[]) => void` - Callback for message updates

**Returns:** `Unsubscribe` - Function to unsubscribe

**Example:**

```typescript
const unsubscribe = messageService.subscribeToMessages(
  "conv-456",
  (messages) => {
    console.log("New messages:", messages);
  }
);

// Later, unsubscribe
unsubscribe();
```

#### `markAsRead(conversationId, messageId, userId)`

Marks a message as read by a specific user.

**Parameters:**

- `conversationId: string` - Target conversation ID
- `messageId: string` - Message ID to mark as read
- `userId: string` - User ID marking the message as read

**Returns:** `Promise<void>`

**Example:**

```typescript
await messageService.markAsRead("conv-456", "msg-123", "user-789");
```

#### `setTypingStatus(conversationId, userId, isTyping)`

Updates typing status for a user in a conversation.

**Parameters:**

- `conversationId: string` - Target conversation ID
- `userId: string` - User ID
- `isTyping: boolean` - Whether user is typing

**Returns:** `Promise<void>`

**Example:**

```typescript
await messageService.setTypingStatus("conv-456", "user-789", true);
```

---

### ConversationService

Conversation management and participant handling.

#### `createConversation(participants, type?, name?)`

Creates a new conversation.

**Parameters:**

- `participants: string[]` - Array of user IDs
- `type: "direct" | "group"` - Conversation type (default: "direct")
- `name: string` - Conversation name (optional, for groups)

**Returns:** `Promise<Conversation>` - Created conversation

**Example:**

```typescript
const conversation = await conversationService.createConversation(
  ["user-123", "user-456"],
  "direct"
);
```

#### `getConversations(userId)`

Retrieves all conversations for a user.

**Parameters:**

- `userId: string` - User ID

**Returns:** `Promise<Conversation[]>` - Array of conversations

**Example:**

```typescript
const conversations = await conversationService.getConversations("user-123");
```

#### `subscribeToConversations(userId, callback)`

Sets up real-time subscription for conversation updates.

**Parameters:**

- `userId: string` - User ID
- `callback: (conversations: Conversation[]) => void` - Callback for updates

**Returns:** `Unsubscribe` - Function to unsubscribe

**Example:**

```typescript
const unsubscribe = conversationService.subscribeToConversations(
  "user-123",
  (conversations) => {
    console.log("Conversations updated:", conversations);
  }
);
```

---

### FriendService

Friend request operations and friendship management.

#### `sendFriendRequest(fromUserId, toUserId)`

Sends a friend request to another user.

**Parameters:**

- `fromUserId: string` - Sender's user ID
- `toUserId: string` - Recipient's user ID

**Returns:** `Promise<FriendRequest>` - Created friend request

**Example:**

```typescript
const request = await friendService.sendFriendRequest("user-123", "user-456");
```

#### `acceptFriendRequest(requestId, userId)`

Accepts a friend request.

**Parameters:**

- `requestId: string` - Friend request ID
- `userId: string` - User accepting the request

**Returns:** `Promise<void>`

**Example:**

```typescript
await friendService.acceptFriendRequest("req-123", "user-456");
```

#### `declineFriendRequest(requestId, userId)`

Declines a friend request.

**Parameters:**

- `requestId: string` - Friend request ID
- `userId: string` - User declining the request

**Returns:** `Promise<void>`

**Example:**

```typescript
await friendService.declineFriendRequest("req-123", "user-456");
```

#### `getFriendRequests(userId)`

Retrieves friend requests for a user.

**Parameters:**

- `userId: string` - User ID

**Returns:** `Promise<FriendRequest[]>` - Array of friend requests

**Example:**

```typescript
const requests = await friendService.getFriendRequests("user-123");
```

#### `blockUser(userId, blockedUserId)`

Blocks a user to prevent contact.

**Parameters:**

- `userId: string` - User doing the blocking
- `blockedUserId: string` - User being blocked

**Returns:** `Promise<void>`

**Example:**

```typescript
await friendService.blockUser("user-123", "user-456");
```

---

### UserService

User profile operations and search functionality.

#### `createUser(userData)`

Creates a new user profile.

**Parameters:**

- `userData: Partial<User>` - User data to create

**Returns:** `Promise<User>` - Created user

**Example:**

```typescript
const user = await userService.createUser({
  id: "user-123",
  email: "user@example.com",
  displayName: "John Doe",
  languagePreferences: ["en", "es"],
});
```

#### `updateUser(userId, updates)`

Updates a user's profile.

**Parameters:**

- `userId: string` - User ID
- `updates: Partial<User>` - Fields to update

**Returns:** `Promise<User>` - Updated user

**Example:**

```typescript
const updatedUser = await userService.updateUser("user-123", {
  displayName: "John Smith",
  languagePreferences: ["en", "fr"],
});
```

#### `searchUsers(query)`

Searches for users by email or display name.

**Parameters:**

- `query: string` - Search query

**Returns:** `Promise<User[]>` - Array of matching users

**Example:**

```typescript
const users = await userService.searchUsers("john@example.com");
```

---

### SQLiteService

Local database operations for offline-first messaging.

#### `initialize()`

Initializes the SQLite database and creates tables.

**Returns:** `Promise<void>`

**Example:**

```typescript
await sqliteService.initialize();
```

#### `queueMessage(messageId, conversationId, senderId, text)`

Queues a message for offline processing.

**Parameters:**

- `messageId: string` - Message UUID
- `conversationId: string` - Conversation ID
- `senderId: string` - Sender ID
- `text: string` - Message text

**Returns:** `Promise<void>`

**Example:**

```typescript
await sqliteService.queueMessage(
  "msg-uuid-123",
  "conv-456",
  "user-789",
  "Hello, world!"
);
```

#### `getQueuedMessages()`

Retrieves all queued messages for processing.

**Returns:** `Promise<QueuedMessage[]>` - Array of queued messages

**Example:**

```typescript
const queuedMessages = await sqliteService.getQueuedMessages();
```

#### `loadRecentMessages(conversationId, limit?)`

Loads recent messages for a conversation from SQLite cache.

**Parameters:**

- `conversationId: string` - Conversation ID
- `limit: number` - Maximum messages to load (default: 100)

**Returns:** `Promise<Message[]>` - Array of messages

**Example:**

```typescript
const messages = await sqliteService.loadRecentMessages("conv-456", 50);
```

#### `searchMessages(query, conversationId?)`

Searches messages using full-text search.

**Parameters:**

- `query: string` - Search query
- `conversationId: string` - Optional conversation ID to limit search

**Returns:** `Promise<Message[]>` - Array of matching messages

**Example:**

```typescript
const results = await sqliteService.searchMessages("hello", "conv-456");
```

---

## Store Layer APIs

### MessagesStore

Centralized message state management with unified queue-first architecture.

#### State Properties

```typescript
interface MessagesState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  loading: boolean;
  sendingMessage: boolean;
  subscriptions: {
    conversations?: Unsubscribe;
    messages?: Unsubscribe;
    typing?: Unsubscribe;
  };
}
```

#### `loadConversations(userId)`

Loads conversations for a user.

**Parameters:**

- `userId: string` - User ID

**Returns:** `Promise<void>`

**Example:**

```typescript
const { loadConversations } = useMessagesStore();
await loadConversations("user-123");
```

#### `setCurrentConversation(conversationId)`

Sets the currently active conversation.

**Parameters:**

- `conversationId: string | null` - Conversation ID or null

**Example:**

```typescript
const { setCurrentConversation } = useMessagesStore();
setCurrentConversation("conv-456");
```

#### `sendMessage(conversationId, text)`

Sends a message using unified queue-first architecture.

**Parameters:**

- `conversationId: string` - Target conversation ID
- `text: string` - Message content

**Returns:** `Promise<void>`

**Throws:** `Error` if user not authenticated or message sending fails

**Example:**

```typescript
const { sendMessage } = useMessagesStore();
await sendMessage("conv-456", "Hello, world!");
```

#### `loadConversationMessages(conversationId)`

Loads messages for a conversation with memory management.

**Parameters:**

- `conversationId: string` - Conversation ID

**Returns:** `Promise<void>`

**Example:**

```typescript
const { loadConversationMessages } = useMessagesStore();
await loadConversationMessages("conv-456");
```

#### `unloadConversationMessages(conversationId)`

Unloads messages from memory to free up space.

**Parameters:**

- `conversationId: string` - Conversation ID

**Example:**

```typescript
const { unloadConversationMessages } = useMessagesStore();
unloadConversationMessages("conv-456");
```

#### `processQueue()`

Processes queued messages when online.

**Returns:** `Promise<void>`

**Example:**

```typescript
const { processQueue } = useMessagesStore();
await processQueue();
```

#### `syncMissedMessages(conversationId)`

Syncs missed messages for a conversation.

**Parameters:**

- `conversationId: string` - Conversation ID

**Returns:** `Promise<void>`

**Example:**

```typescript
const { syncMissedMessages } = useMessagesStore();
await syncMissedMessages("conv-456");
```

---

### AuthStore

Authentication state management.

#### State Properties

```typescript
interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}
```

#### `signUp(email, password, displayName)`

Creates a new user account.

**Parameters:**

- `email: string` - User email
- `password: string` - User password
- `displayName: string` - User display name

**Returns:** `Promise<void>`

**Example:**

```typescript
const { signUp } = useAuthStore();
await signUp("user@example.com", "password123", "John Doe");
```

#### `signIn(email, password)`

Signs in an existing user.

**Parameters:**

- `email: string` - User email
- `password: string` - User password

**Returns:** `Promise<void>`

**Example:**

```typescript
const { signIn } = useAuthStore();
await signIn("user@example.com", "password123");
```

#### `signOut()`

Signs out the current user.

**Returns:** `Promise<void>`

**Example:**

```typescript
const { signOut } = useAuthStore();
await signOut();
```

---

### ContactsStore

Contact and friend management.

#### State Properties

```typescript
interface ContactsState {
  friends: User[];
  friendRequests: FriendRequest[];
  blockedUsers: User[];
  loading: boolean;
  error: string | null;
}
```

#### `loadFriends(userId)`

Loads friends for a user.

**Parameters:**

- `userId: string` - User ID

**Returns:** `Promise<void>`

**Example:**

```typescript
const { loadFriends } = useContactsStore();
await loadFriends("user-123");
```

#### `sendFriendRequest(toUserId)`

Sends a friend request.

**Parameters:**

- `toUserId: string` - Target user ID

**Returns:** `Promise<void>`

**Example:**

```typescript
const { sendFriendRequest } = useContactsStore();
await sendFriendRequest("user-456");
```

#### `acceptFriendRequest(requestId)`

Accepts a friend request.

**Parameters:**

- `requestId: string` - Friend request ID

**Returns:** `Promise<void>`

**Example:**

```typescript
const { acceptFriendRequest } = useContactsStore();
await acceptFriendRequest("req-123");
```

---

### ConnectionStore

Network state management and auto-sync coordination.

#### State Properties

```typescript
interface ConnectionState {
  isOnline: boolean;
  connectionStatus: ConnectionStatus;
  networkType: string | null;
  syncStatus: SyncStatus;
  isSyncing: boolean;
  lastSyncAt: number | null;
  queuedMessagesCount: number;
  failedMessagesCount: number;
  syncStats: SyncStats;
  lastError: string | null;
  errorCount: number;
}
```

#### `initialize()`

Initializes network monitoring and Firebase connection tracking.

**Returns:** `Promise<void>`

**Example:**

```typescript
const { initialize } = useConnectionStore();
await initialize();
```

#### `manualSync()`

Triggers manual synchronization.

**Returns:** `Promise<void>`

**Example:**

```typescript
const { manualSync } = useConnectionStore();
await manualSync();
```

#### `addNetworkEventCallback(callback)`

Adds a callback for network events.

**Parameters:**

- `callback: NetworkEventCallback` - Callback function

**Returns:** `() => void` - Unsubscribe function

**Example:**

```typescript
const { addNetworkEventCallback } = useConnectionStore();
const unsubscribe = addNetworkEventCallback(async () => {
  console.log("Network event occurred");
});
```

---

### LoggerStore

Comprehensive logging system with SQLite persistence.

#### State Properties

```typescript
interface LoggerState {
  logs: Log[];
  loading: boolean;
}
```

#### `info(category, message, metadata?)`

Logs an info message.

**Parameters:**

- `category: string` - Log category
- `message: string` - Log message
- `metadata?: any` - Optional metadata

**Example:**

```typescript
const { info } = useLoggerStore();
info("messages", "Message sent successfully", { messageId: "msg-123" });
```

#### `error(category, message, metadata?)`

Logs an error message.

**Parameters:**

- `category: string` - Log category
- `message: string` - Log message
- `metadata?: any` - Optional metadata

**Example:**

```typescript
const { error } = useLoggerStore();
error("network", "Connection failed", { error: "timeout" });
```

#### `warning(category, message, metadata?)`

Logs a warning message.

**Parameters:**

- `category: string` - Log category
- `message: string` - Log message
- `metadata?: any` - Optional metadata

**Example:**

```typescript
const { warning } = useLoggerStore();
warning("sync", "Sync took longer than expected", { duration: 5000 });
```

#### `debug(category, message, metadata?)`

Logs a debug message.

**Parameters:**

- `category: string` - Log category
- `message: string` - Log message
- `metadata?: any` - Optional metadata

**Example:**

```typescript
const { debug } = useLoggerStore();
debug("sqlite", "Query executed", { query: "SELECT * FROM messages" });
```

---

## Data Models

### Message

```typescript
interface Message {
  id: string; // UUID for idempotency
  conversationId: string; // Target conversation
  senderId: string; // Sender's user ID
  text: string; // Message content
  timestamp: Timestamp; // Firestore timestamp
  readBy: { [userId: string]: Timestamp }; // Read receipts
  aiFeatures?: {
    // AI features (future)
    translation?: string;
    culturalHints?: string[];
    formalityLevel?: "formal" | "informal" | "casual";
  };
}
```

### Conversation

```typescript
interface Conversation {
  id: string; // Conversation UUID
  type: "direct" | "group"; // Conversation type
  participants: string[]; // Array of user IDs
  name?: string; // Conversation name (for groups)
  createdAt: Timestamp; // Creation timestamp
  updatedAt: Timestamp; // Last update timestamp
  lastMessage?: {
    // Last message metadata
    text: string;
    senderId: string;
    timestamp: Timestamp;
  };
}
```

### User

```typescript
interface User {
  id: string; // User UUID
  email: string; // User email
  displayName: string; // Display name
  avatar?: string; // Avatar URL
  googleId?: string; // Google OAuth ID
  languagePreferences: string[]; // Preferred languages
  aiSettings: {
    // AI feature settings
    autoTranslate: boolean;
    culturalHints: boolean;
    formalityAdjustment: boolean;
  };
  blockedUsers: string[]; // Array of blocked user IDs
  createdAt: Timestamp; // Account creation timestamp
  lastSeen: Timestamp; // Last seen timestamp
}
```

### FriendRequest

```typescript
interface FriendRequest {
  id: string; // Request UUID
  fromUserId: string; // Sender's user ID
  toUserId: string; // Recipient's user ID
  status: "pending" | "accepted" | "declined"; // Request status
  createdAt: Timestamp; // Request creation timestamp
  respondedAt?: Timestamp; // Response timestamp
}
```

### Log

```typescript
interface Log {
  id: string; // Log UUID
  timestamp: number; // Log timestamp (milliseconds)
  level: LogLevel; // Log level
  category: string; // Log category
  message: string; // Log message
  metadata?: any; // Optional metadata
  created_at: number; // Creation timestamp
}

type LogLevel = "debug" | "info" | "warning" | "error";
```

---

## Usage Examples

### Basic Message Flow

```typescript
// 1. Load conversations
const { loadConversations } = useMessagesStore();
await loadConversations("user-123");

// 2. Set current conversation
const { setCurrentConversation } = useMessagesStore();
setCurrentConversation("conv-456");

// 3. Load messages for conversation
const { loadConversationMessages } = useMessagesStore();
await loadConversationMessages("conv-456");

// 4. Send a message
const { sendMessage } = useMessagesStore();
await sendMessage("conv-456", "Hello, world!");

// 5. Mark message as read
const { markAsRead } = useMessagesStore();
await markAsRead("conv-456", "user-123");
```

### Offline Message Handling

```typescript
// 1. Check connection status
const { isOnline } = useConnectionStore();

// 2. Send message (works offline)
const { sendMessage } = useMessagesStore();
await sendMessage("conv-456", "This will queue if offline");

// 3. Process queue when online
if (isOnline) {
  const { processQueue } = useMessagesStore();
  await processQueue();
}

// 4. Sync missed messages
const { syncMissedMessages } = useMessagesStore();
await syncMissedMessages("conv-456");
```

### Friend Management

```typescript
// 1. Search for users
const users = await userService.searchUsers("john@example.com");

// 2. Send friend request
const { sendFriendRequest } = useContactsStore();
await sendFriendRequest("user-456");

// 3. Accept friend request
const { acceptFriendRequest } = useContactsStore();
await acceptFriendRequest("req-123");

// 4. Load friends
const { loadFriends } = useContactsStore();
await loadFriends("user-123");
```

### Logging and Debugging

```typescript
// 1. Log application events
const { info, error, warning, debug } = useLoggerStore();

info("messages", "Message sent successfully");
error("network", "Connection failed", { error: "timeout" });
warning("sync", "Sync took longer than expected");
debug("sqlite", "Query executed", { query: "SELECT * FROM messages" });

// 2. Access logs for debugging
const { logs } = useLoggerStore();
console.log("Recent logs:", logs);
```

This API documentation provides comprehensive coverage of all major operations in MessageAI. For more detailed implementation examples, refer to the source code and inline documentation.
