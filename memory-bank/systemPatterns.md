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
│   Expo Router   │    │   WebSocket     │    │   OpenAI API    │
│   Navigation    │    │   Real-time     │    │   AI Features   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Mobile        │    │   Local Storage │    │   Cloud         │
│   Lifecycle     │    │   Offline Queue │    │   Functions     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Key Design Patterns

### 1. Real-time Messaging Pattern

**WebSocket + Firestore Hybrid**:

- WebSocket for instant message delivery (<200ms)
- Firestore for persistence and offline sync
- Optimistic updates for immediate UI feedback
- Message queuing for offline scenarios

### 2. State Management Pattern

**Zustand Stores** for complex messaging state:

- `authStore`: User authentication, Google login, and profiles
- `messagesStore`: Real-time message management
- `contactsStore`: Contact and friend management
- `aiStore`: AI feature state and responses
- `connectionStore`: WebSocket connection status

### 3. Hybrid Storage Pattern

**SQLite + AsyncStorage + Firestore**:

- **SQLite**: Message history, conversations, contacts, full-text search
- **AsyncStorage**: User preferences, auth tokens, simple settings
- **Firestore**: Real-time sync, server-side persistence, conflict resolution

```
User Action → SQLite Save → WebSocket Send → Server Processing → Broadcast
     ↓              ↓              ↓              ↓              ↓
Offline Mode → Queue in SQLite → Reconnect → Sync from Firestore → Update UI
```

### 4. Mobile Lifecycle Pattern

- **Backgrounding**: Maintain WebSocket or queue messages in SQLite
- **Foregrounding**: Instant sync of missed messages from Firestore
- **Push Notifications**: Firebase Cloud Messaging
- **Battery Optimization**: Efficient background processing

### 5. Contact Management Pattern

- **Friend System**: Send/accept/decline friend requests
- **Contact List**: Personal list of accepted friends
- **User Search**: Find users by email/display name
- **Blocking**: Users can block others to prevent contact

### 6. Conversation Pattern

- **1-on-1 Messaging**: Direct conversations (either user can initiate)
- **Group Messaging**: Multi-user conversations (simplified - no add/remove)
- **Message Attribution**: User names/avatars with online status
- **Read Receipts**: Track message read status per user
- **Typing Indicators**: Real-time typing status updates

### 7. AI Integration Pattern

**Function Calling + RAG Pipeline**:

- OpenAI API with function calling for structured responses
- RAG pipeline for conversation context
- Rate limiting and response streaming
- Secure API key management (server-side only)

## AI Feature Patterns

### 1. Real-time Translation

```typescript
// Pattern: Automatic language detection + translation
Message → Language Detection → Translation API → Display Original + Translation
```

### 2. Cultural Context Hints

```typescript
// Pattern: Context analysis + cultural suggestions
Message + Conversation History → Cultural Analysis → Contextual Hints
```

### 3. Formality Adjustment

```typescript
// Pattern: Tone analysis + adjustment suggestions
Message + User Preferences → Formality Analysis → Tone Suggestions
```

### 4. Multi-Step Agent Pattern

```typescript
// Pattern: Complex workflow execution
User Request → Agent Planning → Step Execution → Context Update → Response
```

## Security Patterns

### API Key Security

- **Server-side Only**: API keys never exposed to mobile app
- **Cloud Functions**: OpenAI API calls through Firebase Functions
- **Rate Limiting**: Per-user API call limits
- **Authentication**: Firebase Auth with Google login required for AI features
- **Privacy**: User data protection without encryption complexity

### Message Security

```javascript
// Firebase Security Rules for Messages
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /conversations/{conversationId} {
      allow read, write: if request.auth != null &&
        request.auth.uid in resource.data.members;
    }
    match /messages/{messageId} {
      allow read, write: if request.auth != null &&
        request.auth.uid in get(/databases/$(database)/documents/conversations/$(resource.data.conversationId)).data.members;
    }
  }
}
```

## Performance Patterns

### 1. Message Optimization

- **Pagination**: Load messages in chunks (50-100 per page)
- **Virtual Scrolling**: Handle 1000+ messages smoothly
- **Image Optimization**: Progressive loading with placeholders
- **Message Compression**: Reduce payload size for large messages

### 2. AI Response Optimization

- **Caching**: Cache common translations and responses
- **Streaming**: Stream long AI responses for better UX
- **Debouncing**: Prevent excessive API calls during typing
- **Background Processing**: Queue AI requests for offline processing

### 3. Connection Management

- **WebSocket Pooling**: Reuse connections efficiently
- **Automatic Reconnection**: Handle network drops gracefully
- **Connection Health**: Monitor and report connection status
- **Fallback**: Firestore real-time as WebSocket backup

## Error Handling Patterns

### 1. Network Errors

- **Retry Logic**: Exponential backoff for failed requests
- **Offline Queue**: Store failed messages for retry
- **Connection Status**: Clear UI indicators for network state
- **Graceful Degradation**: Core features work without AI

### 2. AI Service Errors

- **Fallback Responses**: Default behavior when AI fails
- **Error Boundaries**: React error boundaries for AI components
- **User Feedback**: Clear error messages and retry options
- **Service Health**: Monitor AI service availability

### 3. Data Sync Errors

- **Conflict Resolution**: Handle concurrent message edits
- **Version Control**: Message versioning for sync conflicts
- **Rollback**: Ability to revert failed operations
- **Audit Trail**: Log all sync operations for debugging

## Testing Patterns

### 1. Real-time Testing

- **WebSocket Mocking**: Mock WebSocket connections for testing
- **Message Flow**: Test complete message delivery pipeline
- **Offline Scenarios**: Test queuing and sync behavior
- **Performance**: Load testing with multiple concurrent users

### 2. AI Feature Testing

- **Mock AI Responses**: Consistent test data for AI features
- **Accuracy Testing**: Validate AI response quality
- **Performance Testing**: Measure AI response times
- **Edge Case Testing**: Test AI behavior with unusual inputs

### 3. Mobile Testing

- **Device Testing**: Test on real iOS and Android devices
- **Lifecycle Testing**: Background/foreground transitions
- **Network Testing**: Various network conditions
- **Battery Testing**: Monitor battery usage patterns
