# Thread Mute Functionality - Code Locations

This document lists all locations where thread mute functionality was added to `wiki-talk-page-script.js`.

## Core Functions (Lines ~221-330)

### Thread ID Generation
- **Location**: Lines ~221-284
- **Function**: `getThreadIdForWidget(widgetEl)`
- **Purpose**: Generates unique thread identifiers by combining URL section, DOM position, and content hash
- **Key Features**:
  - Combines multiple factors for uniqueness
  - Handles edge cases (no context, no hash, etc.)
  - Returns format: `thread_{section}_{dompath}_{contentHash}`

### Mute State Management
- **Location**: Lines ~286-330
- **Functions**:
  - `getMutedThreads()` - Retrieves muted thread IDs from localStorage
  - `saveMutedThreads(threadSet)` - Saves muted thread IDs to localStorage
  - `isThreadMuted(threadId)` - Checks if a specific thread is muted
  - `toggleThreadMute(threadId)` - Toggles mute state for a thread

### UI Components
- **Location**: Lines ~332-473
- **Functions**:
  - `ensureUnmuteIndicator(widgetEl, threadId, widgetId)` - Creates unmute button when thread is muted
  - `createMuteButton(threadId, widgetId, isMuted)` - Creates mute/unmute button for panel headers

## Integration Points

### Panel Creation
- **Location**: Lines ~550-680 (in `ensurePanels()`)
- **Changes**:
  - Added `threadId` parameter to function signature
  - Checks mute state before creating panels
  - Hides panels if thread is muted
  - Adds mute buttons to panel headers
  - Shows unmute indicator when muted

### Panel Updates
- **Location**: Lines ~700-860 (in `updateContextPanel()` and `updateReplyPanel()`)
- **Changes**:
  - Checks mute state before updating panels
  - Skips updates if thread is muted
  - Prevents input background color changes when muted
  - Preserves mute button when updating headers

### Intervention Handling
- **Location**: Lines ~1246-1283 (in `handleIntervention()`)
- **Changes**:
  - Gets thread ID for widget
  - Checks mute state early and returns if muted
  - Shows unmute indicator instead of panels when muted

## Storage

- **Storage Key**: `ConvoWizard:mutedThreads:{USERNAME}`
- **Format**: JSON array of thread ID strings
- **Location**: Browser localStorage (per-user)

## CSS Classes

- `.convowizard-mute-btn` - Mute/unmute button in panel headers
- `.convowizard-unmute-indicator` - Unmute indicator shown when thread is muted

## Data Attributes

- `data-thread-id` - Thread identifier on mute buttons
- `data-widget-id` - Widget identifier on mute buttons

## Key Behaviors

1. **Per-Thread Muting**: Each thread gets a unique ID, so muting one thread doesn't affect others
2. **Persistent State**: Mute state is saved in localStorage and persists across page loads
3. **Visual Feedback**: 
   - Panels are completely hidden when muted
   - Unmute indicator appears when muted
   - Mute button toggles between "Mute thread" and "Unmute thread"
4. **Analysis Continuity**: When unmuting, analysis is re-triggered to refresh the display

