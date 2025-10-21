# Active Context: MessageAI Project Pivot & Current Work

## Current Status

**MAJOR PIVOT**: Transforming from notetaking app to MessageAI - an AI-powered messaging platform targeting International Communicators. Goal: Achieve 70-80 points on the MessageAI Rubric.

## Immediate Goal: AI Version

**Priority**: Build a functional messaging app with AI features for the International Communicator persona.

### Required AI Features (5 for International Communicator)

1. **Real-time Translation**: Accurate, natural translation between languages
2. **Language Detection**: Automatic detection of message language
3. **Cultural Context Hints**: Suggestions for appropriate cultural responses
4. **Formality Adjustment**: Tone adjustment based on conversation context
5. **Slang/Idiom Explanations**: Clear explanations of informal language

### Advanced AI Capability

**Multi-Step Agent**: Executes complex workflows like:

- Analyzing conversation context across multiple messages
- Suggesting appropriate responses based on cultural norms
- Learning user communication patterns and preferences
- Handling complex translation scenarios with context preservation

## Recent Accomplishments (From Notetaking App)

- ✅ Firebase project setup with secure rules
- ✅ Anonymous authentication working
- ✅ CRUD operations for notes
- ✅ Real-time synchronization via Firestore
- ✅ Basic UI with navigation
- ✅ Zustand state management patterns
- ✅ TypeScript interfaces and type safety

## Current Work Focus

**Architecture Transformation**: Converting notetaking architecture to messaging platform:

### 1. Data Model Transformation

**From Notes to Messages**:

```typescript
// Old: Note interface
interface Note {
  id: string;
  title: string;
  content: string;
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// New: Message interface
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

### 2. Real-time Communication Setup

**WebSocket Integration**:

- Native WebSocket API for instant messaging (<200ms delivery)
- Firestore as persistence layer and offline sync
- Message queuing for offline scenarios
- Connection health monitoring

### 3. AI Service Architecture

**Server-side AI Processing**:

- Firebase Cloud Functions for OpenAI API integration
- Function calling for structured AI responses
- RAG pipeline for conversation context
- Rate limiting and API key security

## Active Decisions

### 1. Persona Selection

- **Decision**: International Communicator
- **Reason**: Clear pain points around language barriers and cultural context
- **AI Features**: Translation, cultural hints, formality adjustment, slang explanations, language detection
- **Authentication**: Google social login for easy user onboarding

### 2. Technical Architecture

- **Decision**: WebSocket + Firestore hybrid
- **Reason**: WebSocket for speed, Firestore for persistence and offline sync
- **Implementation**: Optimistic updates with server confirmation

### 3. AI Integration Strategy

- **Decision**: Server-side processing through Firebase Functions
- **Reason**: API key security and rate limiting
- **Pattern**: Client requests → Cloud Function → OpenAI API → Response

### 4. Mobile Lifecycle Handling

- **Decision**: Background message queuing with foreground sync
- **Reason**: Mobile users frequently experience network issues
- **Implementation**: SQLite for message history + AsyncStorage for simple queuing
- **Privacy**: User data protection without encryption complexity

## Current Challenges

### 1. WebSocket Implementation

- **Challenge**: Setting up reliable WebSocket connections
- **Approach**: Native WebSocket API with reconnection logic
- **Fallback**: Firestore real-time listeners as backup

### 2. AI Feature Integration

- **Challenge**: Seamless AI feature integration in messaging flow
- **Approach**: Contextual AI suggestions and automatic processing
- **UI Pattern**: Inline AI responses and suggestion overlays

### 3. Offline Message Handling

- **Challenge**: Queue messages locally and sync when online
- **Approach**: SQLite with FTS5 for full-text search + AsyncStorage for preferences
- **Sync Strategy**: Timestamp-based ordering and deduplication

### 4. Performance Optimization

- **Challenge**: Handle 1000+ messages smoothly
- **Approach**: SQLite pagination and virtual scrolling
- **Target**: 60 FPS scrolling, <2s app launch

## Next Steps

### Immediate (Next Session)

1. **WebSocket Setup**: Implement basic WebSocket connection management
2. **Google Auth**: Set up Firebase Auth with Google OAuth integration
3. **Message Components**: Create MessageBubble and ConversationView components
4. **Basic Messaging**: Two-user chat with real-time delivery

### Short Term (Phase 1)

1. **Contact Management**: Implement user search and friend system
2. **Group Chat**: Multi-user conversations with read receipts
3. **Offline Support**: Message queuing and sync
4. **Mobile Lifecycle**: Background/foreground handling

### Medium Term (Phase 2)

1. **Performance**: Optimize for 1000+ messages
2. **Polish**: Professional UI/UX and animations
3. **Testing**: Real device testing for demo video
4. **Documentation**: Comprehensive README and setup

### Long Term (Phase 5)

1. **AI Features**: Implement all 5 required AI features
2. **Advanced AI**: Multi-Step Agent implementation
3. **Demo Video**: 5-7 minute demonstration video
4. **Social Post**: LinkedIn/X post with @GauntletAI

## Active Files (To Be Created/Modified)

### New Components Needed

- `ConversationView.tsx` - Main chat interface
- `MessageBubble.tsx` - Individual message component
- `ContactsList.tsx` - Contact/friend list management
- `UserSearch.tsx` - Search for users by email/name
- `FriendRequest.tsx` - Friend request management
- `AIFeatures.tsx` - AI feature integration
- `TypingIndicator.tsx` - Real-time typing status
- `ConnectionStatus.tsx` - Network status indicator

### New Stores Needed

- `messagesStore.ts` - Real-time message management
- `contactsStore.ts` - Contact and friend management
- `aiStore.ts` - AI feature state and responses
- `connectionStore.ts` - WebSocket connection status

### New Services Needed

- `websocket.ts` - WebSocket connection management
- `aiService.ts` - AI API integration
- `notificationService.ts` - Push notification handling
- `sqliteService.ts` - SQLite database operations

## Development Environment

- **Status**: Ready for MessageAI development
- **Testing**: Real device testing required for demo video
- **Platform**: Cross-platform (iOS/Android/Web)
- **AI Integration**: OpenAI API through Firebase Functions

## Success Metrics (70-80 Points Target)

### Core Messaging Infrastructure (35 points)

- Real-time message delivery <200ms
- Offline queuing and sync
- Group chat with 3+ users
- Read receipts and typing indicators

### Mobile App Quality (20 points)

- Proper background/foreground handling
- <2s app launch, 60 FPS scrolling
- Optimistic UI updates
- Professional layout and transitions

### Technical Implementation (10 points)

- Clean architecture with secured API keys
- Function calling/tool use implemented
- RAG pipeline for conversation context
- Rate limiting and response streaming

### Documentation & Deployment (5 points)

- Comprehensive README and setup
- Demo video (5-7 minutes)
- Persona Brainlift document
- Social post with @GauntletAI

### AI Features Implementation (30 points)

- All 5 required AI features working excellently
- Advanced AI capability (Multi-Step Agent)
- 90%+ command accuracy
- <2s response times for simple commands
