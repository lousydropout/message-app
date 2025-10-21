# System Patterns: Architecture & Design Decisions

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Components │    │   Zustand       │    │   Firebase      │
│   (React Native)│◄──►│   Stores        │◄──►│   Services      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Expo Router   │    │   TypeScript    │    │   Firestore     │
│   Navigation    │    │   Types         │    │   Auth          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Key Design Patterns

### 1. State Management Pattern

**Zustand Stores** instead of React Context:

- `authStore`: Authentication state and operations
- `notesStore`: Notes CRUD and real-time subscriptions
- Explicit initialization to prevent memory leaks
- Optimistic updates for better UX

### 2. Data Flow Pattern

```
User Action → Store Method → Firebase API → Store Update → UI Re-render
```

### 3. Authentication Pattern

- **Anonymous Authentication**: No user registration required
- **Persistence**: AsyncStorage for auth state persistence
- **Explicit Initialization**: Manual auth listener setup to prevent leaks

### 4. Real-time Data Pattern

- **Firestore Subscriptions**: `onSnapshot` for real-time updates
- **Client-side Queries**: `where` clauses for security
- **Server-side Rules**: Firebase security rules for data protection

### 5. Navigation Pattern

- **File-based Routing**: Expo Router with `app/` directory
- **Dynamic Routes**: `app/note/[id].tsx` for note details
- **Modal Routes**: `app/modal.tsx` for overlays

### 6. Component Composition Pattern

- **Container Components**: `NotesList`, `NoteDetailScreen`
- **Presentational Components**: `NoteForm`, `FirebaseTest`
- **Reusable Components**: `ui/` directory for shared components

## Security Patterns

### Firebase Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId} {
      allow read, update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
    }
  }
}
```

### Data Validation

- **Client-side**: TypeScript interfaces and runtime validation
- **Server-side**: Firebase security rules
- **Strict Timestamps**: Explicit conversion of Firestore Timestamps to Date objects

## Error Handling Patterns

- **Store-level**: Try-catch blocks with error state management
- **Component-level**: Alert dialogs for user feedback
- **Network-level**: Firebase handles retries and offline scenarios

## Testing Patterns

- **Manual Testing**: `FirebaseTest` component for integration verification
- **Production Focus**: Real-world testing over unit tests initially
- **Jest Setup**: Encountered configuration issues, deferred for later
