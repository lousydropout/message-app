# Epic 3.2: Data Management & Sync + Memory Optimization

## Problem Summary

Current messaging system has critical architectural issues:

1. **Broken Sync**: `syncQueuedMessages()` doesn't properly send queued messages to Firestore
2. **Dual-Path Complexity**: Separate online/offline logic creates maintenance burden
3. **No Idempotency**: Messages can be duplicated during sync (no UUID-based deduplication)
4. **Memory Bloat**: 200 messages × N conversations held in Zustand memory
5. **Inefficient Reconnection**: Unnecessary SQLite queries reload all messages on reconnect

## Solution Architecture

Implement unified queue-first architecture with three-tier data flow:

```
Firestore (Authoritative Truth - Expensive)
    ↓ (Real-time subscription + Incremental sync)
SQLite (Persistent Cache - ALL messages)
    ↓ (Load most recent 100 on conversation open)
Zustand (In-Memory Window - Last 100 messages per conversation)
```

## Key Architectural Decisions

1. **Unified Queue-First**: ALL messages go through queue regardless of online/offline status
2. **UUID-Based Idempotency**: Generate UUID upfront, use same ID throughout lifecycle
3. **Three-Tier Data**: Firestore (authority) → SQLite (persistence) → Zustand (performance)
4. **Windowed Memory**: Reduce from 200→100 messages per conversation in Zustand
5. **Incremental Sync**: Use `lastSyncedAt` to fetch only new messages
6. **Rename tempId→messageId**: Improve code clarity (it was never temporary)

## Implementation Steps

### Step 1: Add UUID Dependency & Schema Migration

**File**: `package.json`

- Add `uuid` package for UUID generation

**File**: `types/Message.ts`

- Update comments to document UUID usage for `id` field
- Clarify that `id` is UUID-based and used for idempotency

**File**: `services/sqliteService.ts`

- Rename `tempId` column to `messageId` in queued_messages table
- Add schema migration with `ALTER TABLE RENAME COLUMN` (fallback to table recreation)
- Update all SQL queries to use `messageId` instead of `tempId`

### Step 2: Implement UUID Generation

**File**: `stores/messagesStore.ts`

- Import `uuid` package
- Replace timestamp-based ID generation (`temp_${Date.now()}`) with `uuidv4()`
- Update `sendMessage` function to generate UUID for all messages
- Ensure same UUID used throughout message lifecycle

### Step 3: Implement Unified Queue-First Flow

**File**: `stores/messagesStore.ts`

- **Eliminate dual paths**: Remove separate online/offline logic in `sendMessage`
- **Single code path**: ALL messages queue to SQLite first, process immediately if online
- Update `sendMessage` to:

  1. Add message to Zustand (optimistic update)
  2. Queue to SQLite with status 'pending'
  3. Call `processQueue()` if online

- Remove direct Firestore writes from `sendMessage`

**File**: `services/messageService.ts`

- Add `messageId` parameter to `sendMessage` function
- Use provided UUID instead of generating new ID
- Add idempotency check before creating Firestore document

### Step 4: Add SQLite Message Cache Operations

**File**: `services/sqliteService.ts`

- Add `loadRecentMessages(conversationId, limit=100)` function
- Add `saveMessageToCache(message)` function (distinct from queued messages)
- Add `getLastSyncedAt(conversationId)` function
- Add `updateLastSyncedAt(conversationId, timestamp)` function
- Create `message_cache` table for SQLite persistent storage
- Add indexes for efficient queries: `(conversation_id, timestamp DESC)`

### Step 5: Add Duplicate Detection

**File**: `stores/messagesStore.ts`

- In Firestore subscription handler, check for duplicates using UUID
- Before adding message to Zustand, check if `messages[conversationId]` already contains message with same `id`
- Skip adding if duplicate found (idempotency in action)
- Log duplicate detection for debugging

### Step 6: Add Incremental Sync Mechanism

**File**: `firestore.indexes.json`

- Add composite index: `(conversationId ASC, updatedAt DESC)`

**File**: `services/messageService.ts`

- Add `getMessagesSince(conversationId, lastSyncedAt)` function
- Query Firestore for messages where `conversationId = X AND updatedAt > lastSyncedAt`
- Order by `updatedAt DESC`, limit pagination support
- Return only new messages since last sync

**File**: `stores/messagesStore.ts`

- Add `syncMissedMessages()` function:

  1. Get `lastSyncedAt` from SQLite for each active conversation
  2. Call `getMessagesSince()` to fetch new messages
  3. Add new messages to SQLite cache
  4. Add new messages to Zustand (only if conversation is loaded)
  5. Update `lastSyncedAt` timestamp

### Step 7: Create Unified Queue Processor

**File**: `stores/messagesStore.ts`

- Rewrite `processQueue()` function:

  1. Add mutex/lock to prevent concurrent processing
  2. Fetch all pending messages from SQLite queue
  3. For each message:

     - Send to Firestore using UUID as document ID (idempotency)
     - Update queue status to 'sent' on success
     - Increment retry count on failure (max 3 retries)
     - Save to SQLite message cache on success

  4. Remove successfully sent messages from queue
  5. Update sync status in connectionStore

**File**: `stores/connectionStore.ts`

- Update network reconnect handler to call both:

  1. `processQueue()` - send queued messages
  2. `syncMissedMessages()` - fetch new messages

- Add mutex to prevent concurrent sync operations

### Step 8: Add Conversation Lifecycle Management

**File**: `stores/messagesStore.ts`

- Add `MAX_MESSAGES_IN_MEMORY = 100` constant (reduced from 200)
- Add `loadConversationMessages(conversationId)` function:

  1. Load recent 100 messages from SQLite cache
  2. Add to Zustand messages state
  3. Initialize Firestore real-time subscription
  4. Mark conversation as "loaded" in state

- Add `unloadConversationMessages(conversationId)` function:

  1. Remove messages from Zustand
  2. Unsubscribe Firestore listener
  3. Mark conversation as "unloaded"

- Call `loadConversationMessages()` when user opens conversation
- Call `unloadConversationMessages()` when user closes conversation

### Step 9: Fix Unnecessary SQLite Queries

**File**: `stores/messagesStore.ts`

- Modify `syncMissedMessages()` to only add NEW messages to Zustand
- Remove redundant `loadRecentMessages()` calls during sync
- Keep existing Zustand state, only append new messages
- Only query SQLite if conversation is not already loaded

### Step 10: Update Queue Processor Calls

**File**: `stores/messagesStore.ts`

- Update all `processQueue()` calls to pass UUIDs
- Add mutex checks before processing
- Ensure idempotency throughout

**File**: `stores/connectionStore.ts`

- Update reconnection handler with proper sequencing:

  1. Wait for Firebase connection
  2. Call `processQueue()` with mutex
  3. Call `syncMissedMessages()` with mutex
  4. Update sync status appropriately

### Step 11: Comprehensive Testing

**Test Scenarios**:

1. ✅ Offline → send message → online → verify single message in Firestore
2. ✅ Send duplicate UUID → verify only one message appears
3. ✅ Go offline → receive messages → come online → verify sync
4. ✅ Load conversation → verify only 100 messages in Zustand
5. ✅ Close conversation → verify messages cleared from Zustand
6. ✅ Open 20 conversations → verify memory stays bounded
7. ✅ Network reconnect → verify no unnecessary SQLite queries
8. ✅ Failed message → verify retry logic with count

## Files to Modify

1. `package.json` - Add uuid dependency
2. `types/Message.ts` - Add UUID documentation
3. `firestore.indexes.json` - Add composite index (conversationId, updatedAt)
4. `services/sqliteService.ts` - Schema migration, cache operations, sync metadata
5. `services/messageService.ts` - Add messageId param, idempotency, getMessagesSince
6. `stores/messagesStore.ts` - Unified flow, queue processor, lifecycle management
7. `stores/connectionStore.ts` - Update reconnection logic with mutex

## Expected Outcomes

- ✅ Single unified code path (no dual online/offline logic)
- ✅ UUID-based idempotency prevents duplicates
- ✅ SQLite caches ALL messages persistently
- ✅ Zustand holds max 100 messages per conversation
- ✅ Incremental sync fetches only new messages
- ✅ Queue processes automatically when online
- ✅ Memory usage stays bounded with conversation lifecycle
- ✅ No unnecessary SQLite queries on reconnection
- ✅ Failed messages retry with proper counting
- ✅ Clean, maintainable architecture

## Success Criteria

- `tempId` renamed to `messageId` throughout codebase
- All messages use UUID from creation
- Single code path for online and offline
- Incremental sync fetches only new messages
- SQLite caches ALL messages (persistent)
- Zustand holds windowed view (100 messages max per conversation)
- Duplicate detection prevents double messages
- Queue processes automatically when online
- Missed messages sync automatically on reconnection
- Failed messages remain in queue with retry count
- Memory usage stays bounded (windowed Zustand)
- No unnecessary SQLite queries on reconnect
- Clean, maintainable codebase
