# Refactor Messages to Subcollection of Conversations

## Overview

Move messages from `/messages/{mId}` to `/conversations/{cId}/messages/{mId}` to simplify security rules, improve performance, and reduce costs.

## Current Structure Issues

- Messages at `/messages/{mId}` require `get()` calls to conversations for security checks
- Each message operation incurs extra Firestore read costs
- Security rules are verbose and error-prone
- Current production rules (lines 45-55) have 3 `get()` calls per operation

## New Structure Benefits

- Messages inherit conversation access naturally
- Cleaner, more maintainable security rules
- 50% reduction in Firestore operations
- Simpler code paths

## Implementation Steps

### 1. Update Firestore Security Rules

**File**: `firestore.rules`

Replace the messages section (lines 47-51) with subcollection rules inside the conversations match block.

### 2. Update Message Service

**File**: `services/messageService.ts`

- Remove `private messagesRef = collection(db, "messages");`
- Update all methods to use conversation-specific message paths
- Change queries to use subcollections instead of top-level collection

### 3. Update Conversation Service

**File**: `services/conversationService.ts`

- Remove unused `private messagesRef` (line 21)

### 4. Update Message Type

**File**: `types/Message.ts`

- Remove `participants: string[];` field (line 7)

### 5. Update Firestore Indexes

**File**: `firestore.indexes.json`

- Remove message indexes that include `conversationId` field

### 6. Data Migration

User will manually:

1. Deploy updated Firestore rules
2. Delete all `/conversations` collection documents
3. Delete all `/messages` collection documents
4. Start fresh with new structure

## Breaking Changes

1. `messageService.markMessageAsRead()` now requires `conversationId` parameter
2. Message type removes `participants` field
3. All message Firestore paths change

## Performance Impact

- 50% reduction in Firestore read operations
- Simpler queries without conversationId filters
- Faster security rule evaluation
