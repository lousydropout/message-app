# Technical Context: Technology Stack & Setup

## Core Technologies

### React Native + Expo

- **Version**: React Native 0.81.4, Expo ~54.0.13
- **Development**: Expo Go for real device testing
- **Routing**: Expo Router ~6.0.11 (file-based routing)
- **Platform**: Cross-platform (iOS/Android/Web)

### Firebase

- **Project**: `notetaker-7e81f`
- **Services**: Firestore, Authentication
- **SDK**: Firebase Web SDK (required for Expo Go)
- **Auth**: Anonymous authentication with AsyncStorage persistence
- **Database**: Firestore with composite indexes

### State Management

- **Library**: Zustand ^4.5.4
- **Pattern**: Explicit initialization stores
- **Stores**: `authStore`, `notesStore`

### TypeScript

- **Version**: ~5.9.2
- **Configuration**: `tsconfig.json` with path aliases
- **Types**: Custom interfaces for `Note`, `AuthState`, `NotesState`

## Development Environment

### Dependencies

```json
{
  "firebase": "^12.4.0",
  "zustand": "^4.5.4",
  "@react-native-async-storage/async-storage": "2.2.0",
  "expo-router": "~6.0.11",
  "react-native-gesture-handler": "~2.28.0",
  "react-native-reanimated": "~4.1.1"
}
```

### Development Tools

```json
{
  "jest": "^30.2.0",
  "@testing-library/react-native": "^13.3.3",
  "@testing-library/jest-native": "^5.4.3",
  "eslint": "^9.25.0",
  "eslint-config-expo": "~10.0.0"
}
```

## Project Structure

```
app/
├── _layout.tsx              # Root layout with auth initialization
├── (tabs)/
│   ├── _layout.tsx          # Tab navigation
│   ├── index.tsx            # Home screen (NotesList)
│   └── explore.tsx          # Placeholder tab
├── note/
│   └── [id].tsx             # Dynamic note detail/edit route
└── modal.tsx                # Modal route

components/
├── NotesList.tsx            # Main notes list with FAB
├── NoteForm.tsx             # Reusable note creation/edit form
├── FirebaseTest.tsx         # Manual testing component
└── ui/                      # Shared UI components

stores/
├── authStore.ts             # Authentication state management
└── notesStore.ts            # Notes CRUD and real-time sync

config/
└── firebase.ts              # Firebase configuration and initialization

types/
└── Note.ts                  # Note interface definition
```

## Firebase Configuration

### Project Setup

- **Project ID**: `notetaker-7e81f`
- **Database**: Firestore in production mode
- **Authentication**: Anonymous auth enabled
- **Security Rules**: User-scoped access to notes

### Composite Indexes

- **Collection**: `notes`
- **Fields**: `userId` (ascending), `updatedAt` (descending)
- **Purpose**: Enable ordered queries for user's notes

## Development Scripts

```json
{
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
  "lint": "expo lint"
}
```

## Key Technical Decisions

### 1. Firebase Web SDK

- **Reason**: Required for Expo Go compatibility
- **Trade-off**: Some React Native-specific features unavailable

### 2. Zustand over Context

- **Reason**: Simpler API, better performance, explicit initialization
- **Benefit**: Prevents memory leaks and unnecessary re-renders

### 3. Anonymous Authentication

- **Reason**: Simplifies user onboarding
- **Future**: Can upgrade to email/password later

### 4. Manual Testing Component

- **Reason**: Jest configuration issues with React Native
- **Approach**: Production-ready manual testing within app

### 5. TypeScript Strict Mode

- **Reason**: Type safety and better developer experience
- **Implementation**: Custom interfaces and strict type checking

## Future Technical Considerations

### SQLite Integration

- **Library**: `expo-sqlite` or `react-native-sqlite-storage`
- **Architecture**: Offline-first with Firebase sync
- **Migration**: Minimal refactoring required due to store abstraction

### Testing Strategy

- **Unit Tests**: Jest with React Native Testing Library
- **Integration Tests**: Firebase emulator suite
- **E2E Tests**: Detox or Maestro for mobile testing
