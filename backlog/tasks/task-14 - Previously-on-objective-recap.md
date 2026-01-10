---
id: task-14
title: Previously on - objective state recap
status: To Do
assignee: []
created_date: '2026-01-10'
labels:
  - feature
  - llm
priority: medium
dependencies:
  - task-15
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a "Previously on..." feature that generates a one-sentence recap of the current state of an objective based on its priorities and recent steps.

**Core behavior:**
- Displays as a subtle line in the content header or below the objective title
- Automatically generated/refreshed when selecting an objective (or after new steps)
- One sentence that captures: what's been done recently, current phase, momentum

**Example outputs:**
- "Set up the foundation and got first users signed up."
- "Been researching options for two weeks, ready to decide."
- "Shipped the MVP, now iterating on feedback."
- "Stalled after initial setup—no activity in 10 days."

**Prompt structure:**
```
Objective: [name]
Priorities: [list]
Recent steps (newest first):
#5 - [step] (2 days ago)
#4 - [step] (3 days ago)
...

Write ONE sentence summarizing the current state. Be concise and specific.
```

**UI placement:**
- Below objective title in content header
- Styled subtly (gray, smaller text)
- Could include a refresh icon to regenerate
<!-- SECTION:DESCRIPTION:END -->
