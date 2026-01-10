---
id: task-15
title: Step timer tracking flow
status: To Do
assignee: []
created_date: '2026-01-10'
labels:
  - feature
  - core
priority: high
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a time-tracking flow for steps that changes from passive logging ("what did you do?") to active tracking ("what are you doing?" → timer → complete).

**Flow:**
1. Create step - "What are you working on?"
2. Start - Timer begins, step shows as active
3. Working - Timer visible in UI
4. Complete or Pause - Saves elapsed time

**Step model:**
```js
{
  id: "...",
  name: "Write landing page copy",
  status: "pending" | "active" | "paused" | "completed",
  startedAt: "2026-01-10T14:30:00Z",
  completedAt: "2026-01-10T15:45:00Z",
  elapsed: 4500, // seconds (accumulated across pause/resume)
  orderNumber: 5
}
```

**UI:**
- Active step pinned at top with running timer: `▶ Writing landing page copy [0:23:45]`
- Controls: Pause | Complete
- Completed steps show duration: `#4 Jan 9 2:34pm Set up repo 45m`
- Only one step can be active at a time

**Keyboard shortcuts:**
- `s` - Create new step (current behavior, but now starts as pending)
- `Enter` on pending step - Start timer
- `Space` or `p` - Pause/resume active step
- `Enter` on active step - Complete

This is a prerequisite for task-13 (next step suggestions) and task-14 (previously on recap).
<!-- SECTION:DESCRIPTION:END -->
