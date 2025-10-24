# Friends Subcollection & Online Presence Implementation

## Phase 1: Schema & Type Updates

### 1.1 Update User Interface

**File**: `types/User.ts`

Add new fields to User interface:

```typescript
export interface User {
  // ... existing fields
  online: boolean;
  heartbeat: Timestamp;
}
```

### 1.2 Create Friend Type

**File**: `types/Friend.ts` (NEW)

Create minimal friend document type:

```typescript
export interface Friend {
  id: string; // Friend's user ID
  addedAt: Timestamp;
}
```

## Phase 2: Service Layer Updates

### 2.1 Update User Service

**File**: `services/userService.ts`

Update `createUserProfile()` to initialize new fields:

```typescript
online: false,
heartbeat: now as Timestamp,
```

### 2.2 Update Friend Service

**File**: `services/friendService.ts`

**Key Changes**:

1. Update `acceptFriendRequest()` to create friend subcollection documents:

```typescript
async acceptFriendRequest(requestId: string): Promise<void> {
  // Get request data
  const requestRef = doc(db, "friendRequests", requestId);
  const requestDoc = await getDoc(requestRef);
  const data = requestDoc.data();

  // Update request status (keep for audit)
  await updateDoc(requestRef, {
    status: "accepted",
    updatedAt: serverTimestamp(),
  });

  // Create friend documents in both users' subcollections
  await Promise.all([
    setDoc(doc(db, "users", data.fromUserId, "friends", data.toUserId), {
      id: data.toUserId,
      addedAt: serverTimestamp(),
    }),
    setDoc(doc(db, "users", data.toUserId, "friends", data.fromUserId), {
      id: data.fromUserId,
      addedAt: serverTimestamp(),
    })
  ]);
}
```

2. Update `getFriends()` to use subcollection:

```typescript
async getFriends(userId: string): Promise<string[]> {
  const friendsRef = collection(db, "users", userId, "friends");
  const snapshot = await getDocs(friendsRef);
  return snapshot.docs.map(doc => doc.id);
}
```

3. Update `areFriends()` to use subcollection:

```typescript
async areFriends(userId1: string, userId2: string): Promise<boolean> {
  const friendDoc = await getDoc(doc(db, "users", userId1, "friends", userId2));
  return friendDoc.exists();
}
```

4. Add `removeFriend()` method for blocking:

```typescript
async removeFriend(userId: string, friendId: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, "users", userId, "friends", friendId)),
    deleteDoc(doc(db, "users", friendId, "friends", userId))
  ]);
}
```

### 2.3 Create Presence Service

**File**: `services/presenceService.ts` (NEW)

```typescript
class PresenceService {
  private heartbeatInterval: NodeJS.Timeout | null = null;

  async setOnlineStatus(userId: string, online: boolean): Promise<void> {
    await updateDoc(doc(db, "users", userId), {
      online,
      heartbeat: serverTimestamp(),
    });
  }

  async updateHeartbeat(userId: string): Promise<void> {
    await updateDoc(doc(db, "users", userId), {
      heartbeat: serverTimestamp(),
    });
  }

  startHeartbeat(userId: string): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat(userId).catch(console.error);
    }, 30000); // 30 seconds
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
```

## Phase 3: Store Updates

### 3.1 Update Contacts Store

**File**: `stores/contactsStore.ts`

Update `loadFriends()` to use new service:

```typescript
async loadFriends(userId: string) {
  set({ loading: true });
  try {
    const friendIds = await friendService.getFriends(userId);
    const friends = await userService.getUsersByIds(friendIds);
    set({ friends, loading: false });
  } catch (error) {
    console.error("Error loading friends:", error);
    set({ loading: false });
    throw error;
  }
}
```

Update `blockUser()` to remove from friends subcollection:

```typescript
async blockUser(userId: string, blockedUserId: string) {
  await userService.blockUser(userId, blockedUserId);
  await friendService.removeFriend(userId, blockedUserId);
  // ... update local state
}
```

### 3.2 Update Auth Store

**File**: `stores/authStore.ts`

Update `signIn()` to set online status and start heartbeat:

```typescript
async signIn(email: string, password: string) {
  // ... existing sign in logic

  // Set online status
  await presenceService.setOnlineStatus(authResult.user.uid, true);
  presenceService.startHeartbeat(authResult.user.uid);

  // ... rest of logic
}
```

Update `logout()` to set offline and stop heartbeat:

```typescript
async logout() {
  const currentUser = get().user;
  if (currentUser) {
    await presenceService.setOnlineStatus(currentUser.uid, false);
    presenceService.stopHeartbeat();
  }
  // ... rest of logout logic
}
```

## Phase 4: App Lifecycle Integration

### 4.1 Update Root Layout

**File**: `app/_layout.tsx`

Add app state listener for background/foreground:

```typescript
import { AppState } from "react-native";

useEffect(() => {
  const subscription = AppState.addEventListener("change", (nextAppState) => {
    const { user } = useAuthStore.getState();
    if (!user) return;

    if (nextAppState === "active") {
      presenceService.setOnlineStatus(user.uid, true);
      presenceService.startHeartbeat(user.uid);
    } else if (nextAppState === "background" || nextAppState === "inactive") {
      presenceService.setOnlineStatus(user.uid, false);
      presenceService.stopHeartbeat();
    }
  });

  return () => subscription.remove();
}, []);
```

## Phase 5: Firestore Security Rules

### 5.1 Update Security Rules

**File**: `firestore.rules`

Add friends subcollection rules:

```javascript
match /users/{userId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == userId;

  // Friends subcollection - users can read their own friends
  match /friends/{friendId} {
    allow read: if request.auth != null && request.auth.uid == userId;
    allow write: if request.auth != null && request.auth.uid == userId;
  }
}
```

## Testing Checklist

1. Create new user accounts (fresh start)
2. Send friend request between users
3. Accept friend request - verify friend documents created in both subcollections
4. Verify online status set to true on login
5. Verify heartbeat updates every 30 seconds
6. Verify online status set to false on logout
7. Test app backgrounding - verify online status set to false
8. Test app foregrounding - verify online status set to true
9. Block user - verify friend documents removed from both subcollections
10. Verify friendRequests collection still contains all requests for audit

## Files to Modify

1. `types/User.ts` - Add online, heartbeat fields
2. `types/Friend.ts` - NEW - Friend interface
3. `services/userService.ts` - Initialize new fields
4. `services/friendService.ts` - Update all methods to use subcollection
5. `services/presenceService.ts` - NEW - Presence management
6. `stores/contactsStore.ts` - Update friend loading logic
7. `stores/authStore.ts` - Add presence on login/logout
8. `app/_layout.tsx` - Add app lifecycle handling
9. `firestore.rules` - Add friends subcollection rules

## Notes

- friendRequests collection kept for audit trail (all statuses preserved)
- Friend documents only store ID and timestamp (profiles cached in SQLite)
- Heartbeat runs every 30 seconds when app is active
- Online status considers heartbeat age (40s timeout = 30s interval + 10s buffer)
- No indexing required for subcollection queries
