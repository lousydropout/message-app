# Android Text Cutoff Layout Bug - Critical Insight

## Context

During Epic 1.4: Real-time Messaging Core implementation, we encountered a platform-specific Android issue where text in message bubbles was getting cut off (last word/character clipped).

## Root Cause

- **Android-specific React Native layout bug**: `Text` components inside flex containers get clipped when React Native can't compute the exact text box height
- **Flex container issues**: Happens with `Text` inside `flex` containers without proper width constraints or wrapping hints
- **Platform difference**: Android's layout engine handles flex containers differently than iOS

## When This Occurs

- Message bubbles in chat interfaces (`MessageBubble.tsx`)
- Text-heavy flex layouts
- Any `Text` component inside complex flex containers
- **Platform-specific**: Only affects Android, not iOS

## Solutions Applied

1. **Platform-specific width constraints**:

   ```tsx
   maxWidth: Platform.OS === "android" ? "90%" : "100%";
   ```

2. **Text wrapping hints**:

   ```tsx
   <Text numberOfLines={0} style={{ flexShrink: 1 }}>
     {message.text}
   </Text>
   ```

3. **Container flex properties**:
   ```tsx
   <View style={{ flex: 1, flexWrap: "wrap" }}>
     <Text>{message.text}</Text>
   </View>
   ```

## Prevention Strategy

Always add proper flex constraints and text wrapping hints when using `Text` components inside flex containers, especially in chat/messaging interfaces.

## Files Affected

- `components/MessageBubble.tsx` - Required platform-specific styling adjustments for Android text rendering

## Technical Details

- **Issue**: Android clips last word/character when text height can't be computed
- **Solution**: Explicit width constraints + text wrapping properties
- **Platform**: Android-only issue, iOS renders correctly
- **Context**: Discovered during Epic 1.4 messaging implementation

## Future Reference

This insight is crucial for future React Native development, particularly when building:

- Chat interfaces
- Message components
- Text-heavy layouts
- Any flex-based UI with text content

**Key Takeaway**: Android requires explicit text layout constraints that iOS handles automatically.
