---
id: task-13
title: Next step suggestion with regenerate
status: To Do
assignee: []
created_date: '2026-01-10'
labels:
  - feature
  - llm
priority: medium
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an LLM-powered "Suggest next step" feature that generates actionable next step ideas based on the current objective, priorities, and recent steps logged.

**Core behavior:**
- Button appears below the steps list: "→ Suggest next step"
- Clicking sends context (objective name, priorities, recent steps) to the 8B LLM
- Returns a short, specific, actionable suggestion (under 10 words)
- User can click "regenerate" repeatedly to get new suggestions until one resonates
- "Accept" adds the suggestion as a logged step

**Prompt structure:**
```
Objective: [name]
Priorities:
- [priority 1]
- [priority 2]

Recent steps:
#N - [step]
#N-1 - [step]

Suggest ONE specific, actionable next step (under 10 words).
```

**UI considerations:**
- Regenerate should feel instant (queue multiple suggestions?)
- Show suggestion inline, not in a modal
- Clear accept/reject/regenerate actions
<!-- SECTION:DESCRIPTION:END -->
