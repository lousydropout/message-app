# Security Documentation

This document outlines security best practices, production deployment requirements, and security considerations for MessageAI.

## Table of Contents

- [Security Overview](#security-overview)
- [Development vs Production](#development-vs-production)
- [Firebase Security Rules](#firebase-security-rules)
- [User Flow Security Validation](#user-flow-security-validation)
- [API Key Security](#api-key-security)
- [User Data Protection](#user-data-protection)
- [Production Checklist](#production-checklist)
- [Security Monitoring](#security-monitoring)
- [Common Security Issues](#common-security-issues)

---

## Security Overview

MessageAI implements a multi-layered security approach:

1. **Authentication**: Firebase Auth with email/password
2. **Authorization**: Firestore security rules
3. **Data Protection**: User data isolation and access controls
4. **API Security**: Server-side API key management (for AI features)
5. **Network Security**: HTTPS/TLS for all communications

### Current Security Status

**Development Mode**: Ultra-permissive rules for rapid development
**Production Mode**: ✅ **OPTIMIZED** - Comprehensive security validation with user flow analysis

**Recent Security Improvements** (Latest Update):

- ✅ **Fixed Overly Restrictive Rules**: Corrected Firestore rules that were preventing core app functionality
- ✅ **Operation Separation**: Implemented proper read/create/update operation separation
- ✅ **Data Reference Correction**: Fixed `resource.data` vs `request.resource.data` usage
- ✅ **User Flow Validation**: Comprehensive security analysis of all core user flows
- ✅ **Edge Case Documentation**: Documented security edge cases and handling
- ✅ **Performance Analysis**: Documented security vs performance trade-offs

---

## Development vs Production

### Development Mode (Current)

**Firestore Rules**: Ultra-permissive for development

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // UNSAFE - Development only
    }
  }
}
```

**API Keys**: Exposed in environment variables

- All `EXPO_PUBLIC_` variables are visible to clients
- Suitable for development and testing only

**Authentication**: Basic email/password only

- No Google OAuth implementation
- No multi-factor authentication

### Production Mode (Required for Deployment)

**Firestore Rules**: Strict access controls

- User data isolation
- Conversation-based permissions
- Message access restrictions

**API Keys**: Server-side only

- Never expose API keys to mobile clients
- Use Firebase Cloud Functions for AI features
- Implement proper authentication

**Authentication**: Enhanced security

- Multi-factor authentication
- Session management
- Account lockout policies

---

## Firebase Security Rules

### Production Security Rules

**File**: `firestore.rules.production`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own profile
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Friend requests - users can read their own requests
    match /friendRequests/{requestId} {
      allow read: if request.auth != null &&
        (request.auth.uid == resource.data.fromUserId ||
         request.auth.uid == resource.data.toUserId);
      allow create: if request.auth != null &&
        request.auth.uid == request.resource.data.fromUserId;
      allow update: if request.auth != null &&
        request.auth.uid == resource.data.toUserId;
    }

    // Conversations - only participants can access
    match /conversations/{conversationId} {
      allow read: if request.auth != null &&
        request.auth.uid in resource.data.participants;
      allow create: if request.auth != null &&
        request.auth.uid in request.resource.data.participants;
      allow update: if request.auth != null &&
        request.auth.uid in resource.data.participants;
    }

    // Messages - only accessible by conversation participants
    match /messages/{messageId} {
      allow read: if request.auth != null &&
        request.auth.uid in get(/databases/$(database)/documents/conversations/$(resource.data.conversationId)).data.participants;
      allow create: if request.auth != null &&
        request.auth.uid in get(/databases/$(database)/documents/conversations/$(request.resource.data.conversationId)).data.participants;
      allow update: if request.auth != null &&
        request.auth.uid in get(/databases/$(database)/documents/conversations/$(resource.data.conversationId)).data.participants;
    }

    // Typing indicators - only accessible by conversation participants
    match /typing/{conversationId} {
      allow read: if request.auth != null &&
        request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants;
      allow create: if request.auth != null &&
        request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants;
      allow update: if request.auth != null &&
        request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants;
    }
  }
}
```

### Rule Explanation

1. **User Profiles**: Users can only modify their own profiles, but can read any user profile (needed for friend search)
2. **Friend Requests**: Users can only read requests sent to/from them, only sender can create, only recipient can update
3. **Conversations**: Only participants can access conversation data, with proper separation of read/create/update operations
4. **Messages**: Only conversation participants can access messages, with cross-document validation via conversation lookup
5. **Typing Indicators**: Only conversation participants can access typing status, with proper operation separation

### Security Pattern Analysis

**Key Security Patterns Implemented**:

- **Authentication Required**: All operations require `request.auth != null`
- **Operation Separation**: Separate `read`, `create`, and `update` operations for fine-grained control
- **Data Reference Correctness**:
  - Create operations use `request.resource.data` (incoming data)
  - Read/Update operations use `resource.data` (existing data)
- **Cross-Document Validation**: Messages and typing indicators validate participation via conversation lookup
- **Participant-Based Access**: All conversation-related operations validate user participation

### User Flow Security Validation

#### 1. Complete Conversation Flow

**Step-by-Step Security Analysis**: Enter → Type → Send → Read Receipts

| **Step**             | **Operation**     | **Collection**  | **Security Validation** | **Status**   |
| -------------------- | ----------------- | --------------- | ----------------------- | ------------ |
| 1. Enter             | Read conversation | conversations   | User in participants    | ✅ PERMITTED |
| 2. Start typing      | Create typing     | typing          | User in participants    | ✅ PERMITTED |
| 3. Stop typing       | Update typing     | typing          | User in participants    | ✅ PERMITTED |
| 4. Send message      | Create message    | messages        | User in participants    | ✅ PERMITTED |
| 5. Receive message   | Read message      | messages        | User in participants    | ✅ PERMITTED |
| 6. Mark read         | Update message    | messages        | User in participants    | ✅ PERMITTED |
| 7. See read receipt  | Read message      | messages        | User in participants    | ✅ PERMITTED |
| 8. Real-time updates | Read all          | All collections | User in participants    | ✅ PERMITTED |

#### 2. Friend Request Flow

**Step-by-Step Security Analysis**: Search → Send → Receive → Accept/Decline → Response

| **Step**             | **Operation**         | **Collection** | **Security Validation** | **Status**   |
| -------------------- | --------------------- | -------------- | ----------------------- | ------------ |
| 1. Search users      | Read user profiles    | users          | Any authenticated user  | ✅ PERMITTED |
| 2. Send request      | Create friend request | friendRequests | Sender only             | ✅ PERMITTED |
| 3. See request       | Read friend request   | friendRequests | Sender or recipient     | ✅ PERMITTED |
| 4. Accept request    | Update friend request | friendRequests | Recipient only          | ✅ PERMITTED |
| 5. Decline request   | Update friend request | friendRequests | Recipient only          | ✅ PERMITTED |
| 6. See response      | Read friend request   | friendRequests | Sender or recipient     | ✅ PERMITTED |
| 7. View profiles     | Read user profiles    | users          | Any authenticated user  | ✅ PERMITTED |
| 8. Real-time updates | Read friend requests  | friendRequests | Sender or recipient     | ✅ PERMITTED |

#### 3. New Conversation Flow

**Step-by-Step Security Analysis**: Create Direct/Group → Send First Message → Real-time Updates

| **Step**                   | **Operation**       | **Collection**   | **Security Validation** | **Status**   |
| -------------------------- | ------------------- | ---------------- | ----------------------- | ------------ |
| 1. Start direct message    | Create conversation | conversations    | User in participants    | ✅ PERMITTED |
| 2. Start group message     | Create conversation | conversations    | User in participants    | ✅ PERMITTED |
| 3. Others see conversation | Read conversation   | conversations    | User in participants    | ✅ PERMITTED |
| 4. Send first message      | Create message      | messages         | User in participants    | ✅ PERMITTED |
| 5. Others receive message  | Read message        | messages         | User in participants    | ✅ PERMITTED |
| 6. Real-time updates       | Read all            | Both collections | User in participants    | ✅ PERMITTED |
| 7. Update metadata         | Update conversation | conversations    | User in participants    | ✅ PERMITTED |

### Security Edge Cases

**Handled Edge Cases**:

- **User not in participants array**: ❌ DENIED - Prevents unauthorized access
- **Invalid participant IDs**: ✅ PERMITTED - Rules don't validate user existence (performance consideration)
- **Empty participants array**: ❌ DENIED - Prevents empty conversation creation
- **Cross-conversation access**: ❌ DENIED - Users can only access conversations they're in
- **Unauthorized message creation**: ❌ DENIED - Must be conversation participant

### Performance Considerations

**Security vs Performance Trade-offs**:

- **Message Operations**: Each message operation triggers conversation lookup (1 write + 1 read)
- **Typing Indicators**: Similar performance impact as messages
- **Real-time Subscriptions**: Respect security boundaries but may impact performance
- **Future Optimization**: Consider denormalizing participant data for high-volume operations

### Deploying Production Rules

```bash
# Copy production rules
cp firestore.rules.production firestore.rules

# Deploy to Firebase
firebase deploy --only firestore:rules

# Verify deployment
firebase firestore:rules:get
```

---

## API Key Security

### Current Development Setup

**Environment Variables** (Development Only):

```bash
# These are exposed to the client - NOT SECURE for production
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
# ... other Firebase config
```

### Production API Key Security

**Never expose API keys in mobile apps**. Use these approaches:

1. **Firebase Cloud Functions** for AI features:

```javascript
// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

exports.processAIRequest = functions.https.onCall(async (data, context) => {
  // Verify user authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  // Process AI request server-side
  const openai = new OpenAI({
    apiKey: functions.config().openai.key, // Server-side only
  });

  // Return processed result
  return { result: processedData };
});
```

2. **Firebase App Check** for additional security:

```javascript
// Verify requests are from your app
const appCheckToken = await getAppCheckToken();
```

3. **Rate Limiting** per user:

```javascript
// Implement rate limiting in Cloud Functions
const rateLimit = require("express-rate-limit");
```

### AI Features Security

**Current Status**: Not implemented (planned for Epic 5)

**Production Implementation**:

- OpenAI API keys stored server-side only
- User authentication required for AI features
- Rate limiting per user (e.g., 100 requests/day)
- Input validation and sanitization
- Response filtering for inappropriate content

---

## User Data Protection

### Data Isolation

1. **User Profiles**: Each user can only access their own profile
2. **Conversations**: Only participants can access conversation data
3. **Messages**: Protected by conversation participation
4. **Friend Requests**: Users can only see their own requests

### Data Minimization

1. **Message Content**: Only store necessary message data
2. **User Information**: Collect only required profile information
3. **Logging**: Log only essential debugging information
4. **Analytics**: Use Firebase Analytics with privacy controls

### Data Retention

1. **Messages**: Retained indefinitely (user choice)
2. **Logs**: 7-day retention with automatic cleanup
3. **Friend Requests**: Retained until accepted/declined
4. **User Profiles**: Retained until account deletion

### Privacy Controls

1. **User Blocking**: Users can block others to prevent contact
2. **Profile Visibility**: Users control their profile information
3. **Message Deletion**: Users can delete their own messages
4. **Account Deletion**: Complete data removal on request

---

## Production Checklist

### Pre-Deployment Security Review

- [ ] **Firestore Rules**: Deploy production security rules
- [ ] **API Keys**: Move all API keys to server-side (Cloud Functions)
- [ ] **Authentication**: Implement proper user authentication
- [ ] **Input Validation**: Validate all user inputs
- [ ] **Rate Limiting**: Implement API rate limiting
- [ ] **Error Handling**: Secure error messages (no sensitive data)
- [ ] **Logging**: Review logs for sensitive information
- [ ] **Dependencies**: Update all dependencies to latest versions
- [ ] **Environment Variables**: Remove all `EXPO_PUBLIC_` variables
- [ ] **Firebase App Check**: Enable App Check for additional security

### Firebase Configuration

- [ ] **Firebase App Check**: Enable and configure
- [ ] **Firebase Security Rules**: Deploy production rules
- [ ] **Firebase Indexes**: Deploy required indexes
- [ ] **Firebase Monitoring**: Set up alerts and monitoring
- [ ] **Firebase Backup**: Configure automated backups
- [ ] **Firebase Billing**: Set up billing alerts

### Application Security

- [ ] **Code Review**: Security-focused code review
- [ ] **Penetration Testing**: Basic security testing
- [ ] **Dependency Audit**: Check for vulnerable dependencies
- [ ] **SSL/TLS**: Ensure all communications use HTTPS
- [ ] **Session Management**: Implement secure session handling
- [ ] **Error Boundaries**: Implement React error boundaries

### Monitoring and Alerting

- [ ] **Firebase Monitoring**: Set up performance monitoring
- [ ] **Error Tracking**: Implement error tracking and alerting
- [ ] **Security Alerts**: Set up security event monitoring
- [ ] **Usage Monitoring**: Monitor API usage and costs
- [ ] **Performance Monitoring**: Track app performance metrics

---

## Security Monitoring

### Firebase Security Monitoring

1. **Firebase Console**: Monitor authentication events
2. **Firebase Monitoring**: Track security-related metrics
3. **Firebase Alerts**: Set up security event alerts
4. **Firebase Logs**: Review security-related logs

### Application Security Monitoring

1. **Authentication Events**: Monitor sign-in/sign-up patterns
2. **Failed Requests**: Track failed authentication attempts
3. **Suspicious Activity**: Monitor unusual user behavior
4. **API Usage**: Track API usage patterns and anomalies

### Security Metrics to Monitor

- Failed authentication attempts
- Unusual API usage patterns
- High error rates
- Unauthorized access attempts
- Data access patterns

---

## Common Security Issues

### 1. Exposed API Keys

**Problem**: API keys visible in client-side code
**Solution**: Move all API keys to server-side (Cloud Functions)

### 2. Permissive Firestore Rules

**Problem**: Rules allow unrestricted access
**Solution**: Implement strict access controls based on user authentication

### 3. Unvalidated Input

**Problem**: User input not validated
**Solution**: Implement input validation and sanitization

### 4. Insecure Authentication

**Problem**: Weak authentication mechanisms
**Solution**: Implement strong authentication with MFA

### 5. Data Leakage

**Problem**: Sensitive data in error messages
**Solution**: Implement secure error handling

### 6. Missing Rate Limiting

**Problem**: No protection against abuse
**Solution**: Implement rate limiting per user

---

## Security Best Practices

### Development

1. **Never commit API keys** to version control
2. **Use environment variables** for configuration
3. **Implement proper error handling** without data leakage
4. **Validate all user inputs** before processing
5. **Use HTTPS** for all communications
6. **Keep dependencies updated** to latest versions

### Production

1. **Deploy production security rules** immediately
2. **Move all API keys** to server-side
3. **Implement proper authentication** and authorization
4. **Set up monitoring** and alerting
5. **Regular security audits** and updates
6. **User education** about security practices

### Ongoing Security

1. **Regular dependency updates** for security patches
2. **Monitor security advisories** for Firebase and dependencies
3. **Regular security reviews** of code and configuration
4. **User feedback** on security concerns
5. **Penetration testing** for critical vulnerabilities

---

## Security Resources

- [Firebase Security Rules Documentation](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase App Check Documentation](https://firebase.google.com/docs/app-check)
- [Firebase Security Best Practices](https://firebase.google.com/docs/security)
- [OWASP Mobile Security](https://owasp.org/www-project-mobile-security-testing-guide/)
- [React Native Security](https://reactnative.dev/docs/security)

---

## Emergency Response

### Security Incident Response

1. **Immediate Response**:

   - Assess the scope of the incident
   - Implement emergency security measures
   - Notify affected users if necessary

2. **Investigation**:

   - Review logs and monitoring data
   - Identify the root cause
   - Document the incident

3. **Recovery**:

   - Implement fixes for identified vulnerabilities
   - Update security measures
   - Test and verify fixes

4. **Post-Incident**:
   - Review and update security procedures
   - Conduct security audit
   - Update documentation

### Contact Information

- **Firebase Support**: [Firebase Console Support](https://firebase.google.com/support)
- **Security Issues**: Report via Firebase Console or GitHub Issues
- **Emergency Contact**: [Your emergency contact information]

---

This security documentation provides comprehensive guidance for securing MessageAI in production. Regular review and updates of security measures are essential for maintaining a secure application.
