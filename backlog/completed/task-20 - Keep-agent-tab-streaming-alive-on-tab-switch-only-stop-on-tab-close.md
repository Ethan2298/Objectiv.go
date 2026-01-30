---
id: task-20
title: 'Keep agent tab streaming alive on tab switch, only stop on tab close'
status: Done
assignee: []
created_date: '2026-01-30 19:33'
updated_date: '2026-01-30 19:57'
labels:
  - agent-panel
  - chat-tabs
  - streaming
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Currently, switching tabs in the agent panel stops the active streaming response. The expected behavior is that streams should continue running in the background when switching away from a tab, and only be stopped/aborted when the tab is explicitly closed. This allows users to kick off a request in one tab, switch to another tab to start a new conversation or review context, and come back to find the response completed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Switching away from a tab with an active stream does not abort the stream
- [ ] #2 The stream continues to append messages to the tab's conversation history in the background
- [ ] #3 Switching back to the tab shows the updated conversation with any messages received while away
- [ ] #4 Closing a tab aborts any active stream for that tab
- [ ] #5 No duplicate or lost messages when switching back to a streaming tab
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Investigation Findings

All streaming state is **global singletons** — one `currentAbortController`, one `currentParser`, one `isStreaming` flag, and one `messages` array. Tab switching unconditionally aborts the stream and saves partial text.

### Key Code Locations

- `switchToTab()` — `agent-panel.js:428-453` — aborts stream, saves messages, loads new tab
- `abortAndSavePartialResponse()` — `agent-panel.js:996-1045` — captures partial DOM text, aborts fetch, ends parser
- Stream start (Agent) — `agent-panel.js:1087-1161` — creates AbortController, SSE stream, writes chunks
- Stream start (Ask) — `agent-panel.js:1304-1336` — same pattern via anthropic-service.js
- Global streaming state — `agent-panel.js:40-58` — `isStreaming`, `currentAbortController`, `currentParser`, `messages`
- Tab close — `agent-panel.js:459-485` — removes tab, switches to adjacent (triggers abort)
- Cancel button — `agent-panel.js:980-990` — user-initiated abort

### Root Cause

Streaming state is not per-tab. There's no way to keep a background stream writing to a non-active tab's message list.

## Implementation Plan

1. **Move streaming state to per-tab storage** — Each tab in `chatTabs` gets its own `abortController`, `parser`, `isStreaming`, and `accumulatedText` fields
2. **Refactor `switchToTab()`** — Remove the `abortAndSavePartialResponse()` call on switch. Instead, save current DOM state and load target tab's messages. If the target tab is still streaming, re-attach its parser output to the DOM.
3. **Refactor stream write path** — `writeStreamingChunk()` and callbacks should write to the originating tab's state, not globals. If that tab is active, also update DOM. If not, just accumulate in memory.
4. **Refactor `closeChatTab()`** — When closing a tab, abort that tab's stream (if any) before removing it.
5. **Refactor cancel button** — Cancel should abort the *active tab's* stream specifically.
6. **Handle re-rendering on switch-back** — When switching to a tab that was streaming in the background, render its full accumulated content and re-attach live streaming if still in progress.
<!-- SECTION:PLAN:END -->
