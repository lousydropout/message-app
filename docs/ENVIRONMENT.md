# Environment Setup Guide

This guide provides detailed instructions for setting up the MessageAI development environment, including Firebase configuration, security rules, and common troubleshooting.

## Prerequisites

- Node.js 22 or later
- npm or yarn package manager
- Firebase CLI (`npm install -g firebase-tools`)
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator (macOS) or Android Studio (for Android emulator)
- Physical device with Expo Go app installed

## Firebase Project Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a project" or "Add project"
3. Enter project name: `messageai-[your-name]` (e.g., `messageai-john`)
4. Enable Google Analytics (optional for development)
5. Choose Analytics account or create new one
6. Click "Create project"

### 2. Enable Required Services

#### Authentication

1. In Firebase Console, go to "Authentication" → "Sign-in method"
2. Enable "Email/Password" provider
3. Click "Save"

#### Firestore Database

1. Go to "Firestore Database" → "Create database"
2. Choose "Start in test mode" (for development)
3. Select a location close to your users
4. Click "Done"

#### Realtime Database (Required for Firestore listeners)

1. Go to "Realtime Database" → "Create Database"
2. Choose "Start in test mode"
3. Select same location as Firestore
4. Click "Done"

### 3. Get Firebase Configuration

1. Go to Project Settings (gear icon) → "General" tab
2. Scroll down to "Your apps" section
3. Click "Add app" → Web app icon (`</>`)
4. Register app with nickname: `messageai-web`
5. Copy the Firebase configuration object

## Environment Variables Setup

### 1. Copy Environment Template

```bash
cp env.template .env.local
```

### 2. Configure Firebase Variables

Edit `.env.local` with your Firebase project details:

```bash
# Firebase Configuration (Required)
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key-here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

**Where to find each value:**

- `API_KEY`: Firebase Console → Project Settings → General → Web apps → Config
- `AUTH_DOMAIN`: Usually `your-project-id.firebaseapp.com`
- `PROJECT_ID`: Your Firebase project ID
- `STORAGE_BUCKET`: Usually `your-project-id.appspot.com`
- `MESSAGING_SENDER_ID`: Firebase Console → Project Settings → Cloud Messaging
- `APP_ID`: Firebase Console → Project Settings → General → Web apps → Config
- `MEASUREMENT_ID`: Firebase Console → Project Settings → General → Web apps → Config

### 3. Google OAuth Configuration (Optional)

For future Google OAuth implementation:

```bash
# Google OAuth Configuration (Optional - for future implementation)
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-google-web-client-id
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=your-google-ios-client-id
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=your-google-android-client-id
```

## Firebase CLI Setup

### 1. Install Firebase CLI

```bash
npm install -g firebase-tools
```

### 2. Login to Firebase

```bash
firebase login
```

### 3. Initialize Firebase Project

```bash
firebase init
```

Select the following options:

- ✅ Firestore: Configure security rules and indexes files
- ✅ Hosting: Configure files for Firebase Hosting (optional)

### 4. Link to Firebase Project

```bash
firebase use --add
```

Select your Firebase project from the list.

## Deploy Firebase Configuration

### 1. Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

**Note**: Current rules are ultra-permissive for development. See `docs/SECURITY.md` for production rules.

### 2. Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

This deploys the composite indexes required for efficient queries:

- Messages: `(conversationId, updatedAt)`
- Conversations: `(participants, updatedAt)`
- Notes: `(userId, updatedAt)`

### 3. Verify Deployment

Check Firebase Console → Firestore Database → Rules and Indexes to confirm deployment.

## Development Environment

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npx expo start --clear
```

### 3. Open on Device

- **iOS**: Scan QR code with Camera app or Expo Go
- **Android**: Scan QR code with Expo Go app
- **Simulator**: Press `i` for iOS simulator or `a` for Android emulator

### 4. Development Commands

```bash
# Start with tunnel (for network issues)
npx expo start --tunnel

# Start with specific platform
npx expo start --ios
npx expo start --android

# Clear cache and restart
npx expo start --clear

# Refresh all connected devices
# Press 'r' in terminal
```

## Testing Environment Setup

### 1. Create Test Users

1. Open the app and go to Login screen
2. Create test accounts with different email addresses
3. Use format: `test1@example.com`, `test2@example.com`, etc.

### 2. Test Message Flow

1. Create accounts on different devices/simulators
2. Send friend requests between accounts
3. Start conversations and send messages
4. Test offline/online scenarios

### 3. Monitor with Diagnostics

1. Go to Diagnostics tab in the app
2. Monitor logs for errors or issues
3. Check SQLite database state
4. Verify network status and sync operations

## Common Configuration Issues

### Firebase Connection Issues

**Problem**: "Firebase: No Firebase App '[DEFAULT]' has been created"
**Solution**:

- Verify all environment variables are set correctly
- Check that `.env.local` file exists and is not empty
- Restart development server with `npx expo start --clear`

**Problem**: "Firestore: Missing or insufficient permissions"
**Solution**:

- Deploy security rules: `firebase deploy --only firestore:rules`
- Check Firebase Console → Firestore → Rules
- Verify user is authenticated before accessing Firestore

### Authentication Issues

**Problem**: "Firebase: Error (auth/user-not-found)"
**Solution**:

- Ensure Authentication is enabled in Firebase Console
- Check that Email/Password provider is enabled
- Verify user exists in Firebase Console → Authentication → Users

**Problem**: "Firebase: Error (auth/invalid-email)"
**Solution**:

- Use valid email format: `user@domain.com`
- Check email validation in the app

### Network Issues

**Problem**: Expo Go can't connect to development server
**Solution**:

- Ensure device and computer are on same network
- Try tunnel mode: `npx expo start --tunnel`
- Check firewall settings
- Restart Expo Go app

**Problem**: Messages not syncing
**Solution**:

- Check network status indicator (top-right corner)
- Use Diagnostics tab to view detailed logs
- Force sync by tapping refresh button
- Verify Firestore indexes are deployed

### Database Issues

**Problem**: "Firestore: The query requires an index"
**Solution**:

- Deploy indexes: `firebase deploy --only firestore:indexes`
- Check `firestore.indexes.json` for required indexes
- Wait for index creation (can take several minutes)

**Problem**: SQLite errors in Diagnostics
**Solution**:

- Check SQLite database state in Diagnostics tab
- Clear app data and restart if needed
- Verify database schema is correct

## Production Environment Considerations

### Security

- **Never** use development Firestore rules in production
- Use production security rules (see `docs/SECURITY.md`)
- Implement Firebase App Check for additional security
- Review and minimize database permissions

### Performance

- Monitor Firestore usage and costs
- Set up Firebase monitoring and alerts
- Configure backup strategy
- Test on real devices before deployment

### Deployment

- Use Expo Application Services (EAS) for production builds
- Configure proper app signing and certificates
- Set up proper environment variables for production
- Test thoroughly on multiple devices and platforms

## Troubleshooting Resources

- **Firebase Console**: Monitor usage, errors, and performance
- **Expo Dashboard**: View build logs and deployment status
- **Diagnostics Tab**: Real-time app logging and database state
- **Console Logs**: Detailed application logs in development
- **Firebase Documentation**: [firebase.google.com/docs](https://firebase.google.com/docs)

## Support

If you encounter issues not covered in this guide:

1. Check the Diagnostics tab in the app for detailed logs
2. Review Firebase Console for any errors or warnings
3. Check the main README.md troubleshooting section
4. Verify all environment variables are correctly set
5. Ensure all Firebase services are properly configured
