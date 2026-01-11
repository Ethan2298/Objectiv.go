/**
 * Folder Explorer Component
 *
 * A file/folder tree browser that integrates with the side list.
 * Allows exploring directories and selecting files.
 */

// ========================================
// State
// ========================================

const state = {
  rootPath: null,           // Root folder being explored
  expanded: new Set(),      // Set of expanded folder paths
  selectedPath: null,       // Currently selected file/folder path
  collapsed: false,         // Whether the entire explorer section is collapsed
  loading: false,           // Loading state
  cache: new Map(),         // Cache of directory contents: path -> items[]
  demoMode: false           // Force dummy data even in Electron
};

// ========================================
// State Getters
// ========================================

export function getRootPath() {
  return state.rootPath;
}

export function isExpanded(path) {
  return state.expanded.has(path);
}

export function getSelectedPath() {
  return state.selectedPath;
}

export function isSectionCollapsed() {
  return state.collapsed;
}

export function isLoading() {
  return state.loading;
}

// ========================================
// State Actions
// ========================================

export function setRootPath(path) {
  state.rootPath = path;
  state.expanded.clear();
  state.cache.clear();
  state.selectedPath = null;
  // Auto-expand root
  if (path) {
    state.expanded.add(path);
  }
  saveState();
}

export function toggleExpanded(path) {
  if (state.expanded.has(path)) {
    state.expanded.delete(path);
  } else {
    state.expanded.add(path);
  }
  saveState();
}

export function setSelected(path) {
  state.selectedPath = path;
}

export function toggleSectionCollapsed() {
  state.collapsed = !state.collapsed;
  saveState();
}

export function setLoading(value) {
  state.loading = value;
}

// ========================================
// Cache Management
// ========================================

export function getCachedDir(path) {
  return state.cache.get(path);
}

export function setCachedDir(path, items) {
  state.cache.set(path, items);
}

export function clearCache() {
  state.cache.clear();
}

// ========================================
// Persistence
// ========================================

const STORAGE_KEY = 'objectiv-folder-explorer';

export function saveState() {
  try {
    const data = {
      rootPath: state.rootPath,
      expanded: Array.from(state.expanded),
      collapsed: state.collapsed
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save folder explorer state:', e);
  }
}

export function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      state.rootPath = data.rootPath || null;
      state.expanded = new Set(data.expanded || []);
      state.collapsed = data.collapsed || false;
    }
  } catch (e) {
    console.warn('Failed to load folder explorer state:', e);
  }
}

// ========================================
// Directory Loading
// ========================================

// ========================================
// Dummy Folder Structure for Browser Mode
// ========================================

const DUMMY_FOLDER_STRUCTURE = {
  '/notes': [
    { name: 'inbox', isDirectory: true, path: '/notes/inbox' },
    { name: 'projects', isDirectory: true, path: '/notes/projects' },
    { name: 'journal', isDirectory: true, path: '/notes/journal' },
    { name: 'references', isDirectory: true, path: '/notes/references' },
    { name: 'README.md', isDirectory: false, path: '/notes/README.md' }
  ],
  '/notes/inbox': [
    { name: 'quick-capture.md', isDirectory: false, path: '/notes/inbox/quick-capture.md' },
    { name: 'meeting-notes-jan9.md', isDirectory: false, path: '/notes/inbox/meeting-notes-jan9.md' },
    { name: 'book-recommendations.md', isDirectory: false, path: '/notes/inbox/book-recommendations.md' }
  ],
  '/notes/projects': [
    { name: 'rust-learning', isDirectory: true, path: '/notes/projects/rust-learning' },
    { name: 'fitness-tracker', isDirectory: true, path: '/notes/projects/fitness-tracker' },
    { name: 'side-project-ideas.md', isDirectory: false, path: '/notes/projects/side-project-ideas.md' }
  ],
  '/notes/projects/rust-learning': [
    { name: 'ownership-notes.md', isDirectory: false, path: '/notes/projects/rust-learning/ownership-notes.md' },
    { name: 'borrowing-examples.md', isDirectory: false, path: '/notes/projects/rust-learning/borrowing-examples.md' },
    { name: 'cli-tool-plan.md', isDirectory: false, path: '/notes/projects/rust-learning/cli-tool-plan.md' },
    { name: 'resources.md', isDirectory: false, path: '/notes/projects/rust-learning/resources.md' }
  ],
  '/notes/projects/fitness-tracker': [
    { name: 'workout-log.md', isDirectory: false, path: '/notes/projects/fitness-tracker/workout-log.md' },
    { name: 'nutrition-plan.md', isDirectory: false, path: '/notes/projects/fitness-tracker/nutrition-plan.md' },
    { name: 'progress-photos.md', isDirectory: false, path: '/notes/projects/fitness-tracker/progress-photos.md' }
  ],
  '/notes/journal': [
    { name: '2025-01', isDirectory: true, path: '/notes/journal/2025-01' },
    { name: 'weekly-reviews', isDirectory: true, path: '/notes/journal/weekly-reviews' }
  ],
  '/notes/journal/2025-01': [
    { name: '2025-01-08.md', isDirectory: false, path: '/notes/journal/2025-01/2025-01-08.md' },
    { name: '2025-01-09.md', isDirectory: false, path: '/notes/journal/2025-01/2025-01-09.md' },
    { name: '2025-01-10.md', isDirectory: false, path: '/notes/journal/2025-01/2025-01-10.md' }
  ],
  '/notes/journal/weekly-reviews': [
    { name: 'week-01-review.md', isDirectory: false, path: '/notes/journal/weekly-reviews/week-01-review.md' },
    { name: 'week-02-review.md', isDirectory: false, path: '/notes/journal/weekly-reviews/week-02-review.md' }
  ],
  '/notes/references': [
    { name: 'programming', isDirectory: true, path: '/notes/references/programming' },
    { name: 'productivity', isDirectory: true, path: '/notes/references/productivity' },
    { name: 'bookmarks.md', isDirectory: false, path: '/notes/references/bookmarks.md' }
  ],
  '/notes/references/programming': [
    { name: 'rust-cheatsheet.md', isDirectory: false, path: '/notes/references/programming/rust-cheatsheet.md' },
    { name: 'git-commands.md', isDirectory: false, path: '/notes/references/programming/git-commands.md' },
    { name: 'vim-shortcuts.md', isDirectory: false, path: '/notes/references/programming/vim-shortcuts.md' }
  ],
  '/notes/references/productivity': [
    { name: 'pomodoro-guide.md', isDirectory: false, path: '/notes/references/productivity/pomodoro-guide.md' },
    { name: 'gtd-workflow.md', isDirectory: false, path: '/notes/references/productivity/gtd-workflow.md' }
  ]
};

// Dummy file contents for browser mode
const DUMMY_FILE_CONTENTS = {
  '/notes/README.md': `# Personal Notes

Welcome to my notes folder. This is where I keep all my thoughts, plans, and references organized.

## Structure

- **inbox/** - Quick captures and unprocessed notes
- **projects/** - Active project documentation
- **journal/** - Daily and weekly reflections
- **references/** - Long-term reference materials

## Tips

1. Capture quickly, organize later
2. Review weekly
3. Keep it simple`,

  '/notes/inbox/quick-capture.md': `# Quick Capture

## Ideas
- Try out the new Rust async features
- Research home gym equipment
- Look into note-taking apps with vim bindings

## Todo
- [ ] Reply to John's email about the project
- [ ] Schedule dentist appointment
- [ ] Order new headphones`,

  '/notes/inbox/meeting-notes-jan9.md': `# Meeting Notes - January 9, 2025

## Attendees
- Sarah, Mike, Alex

## Discussion Points
- Q1 roadmap review
- Resource allocation for new features
- Timeline for v2.0 release

## Action Items
- [ ] Sarah: Draft technical spec by Friday
- [ ] Mike: Set up dev environment for new team members
- [ ] Alex: Review budget proposal`,

  '/notes/projects/rust-learning/ownership-notes.md': `# Rust Ownership Notes

## Key Concepts

### Ownership Rules
1. Each value has an owner
2. Only one owner at a time
3. Value dropped when owner goes out of scope

### Move Semantics
\`\`\`rust
let s1 = String::from("hello");
let s2 = s1; // s1 is moved to s2
// s1 is no longer valid here
\`\`\`

### Clone
\`\`\`rust
let s1 = String::from("hello");
let s2 = s1.clone(); // deep copy
// both s1 and s2 are valid
\`\`\`

## Questions to Research
- When does Rust use Copy vs Clone?
- How does ownership work with structs?`,

  '/notes/projects/rust-learning/cli-tool-plan.md': `# CLI Tool Project Plan

## Goal
Build a simple CLI tool to practice Rust fundamentals.

## Ideas
1. **File organizer** - Sort files by extension
2. **Todo CLI** - Simple task manager
3. **Markdown previewer** - Render md in terminal

## Tech Stack
- clap for argument parsing
- serde for config files
- colored for terminal output

## Milestones
- [ ] Set up project structure
- [ ] Implement basic argument parsing
- [ ] Add core functionality
- [ ] Write tests
- [ ] Add documentation`,

  '/notes/projects/fitness-tracker/workout-log.md': `# Workout Log

## Week of Jan 6, 2025

### Monday - Upper Body
- Bench Press: 3x8 @ 135lbs
- Rows: 3x10 @ 95lbs
- Shoulder Press: 3x10 @ 65lbs
- Curls: 3x12 @ 30lbs

### Wednesday - Lower Body
- Squats: 4x6 @ 185lbs
- Romanian Deadlifts: 3x10 @ 135lbs
- Leg Press: 3x12 @ 270lbs
- Calf Raises: 4x15

### Friday - Full Body
- Deadlifts: 3x5 @ 225lbs
- Pull-ups: 3x8
- Dips: 3x10
- Planks: 3x60s

## Notes
- Feeling stronger on squats
- Need to work on pull-up form
- Sleep has been inconsistent - prioritize rest`,

  '/notes/journal/2025-01/2025-01-10.md': `# Friday, January 10, 2025

## Morning Thoughts
Woke up early feeling refreshed. Good sleep last night - the new routine is helping.

## Today's Focus
1. Complete the Rust chapter on error handling
2. Gym session - leg day
3. Weekly planning session

## Wins
- Finished Chapter 4 of the Rust Book
- Had a productive meeting with the team
- 2 mile run in the morning

## Reflections
Making good progress on the learning objectives. Need to be more consistent with daily journaling.

## Tomorrow
- Weekend project: Start building the CLI tool
- Meal prep for the week
- Call parents`,

  '/notes/references/programming/rust-cheatsheet.md': `# Rust Cheatsheet

## Variables
\`\`\`rust
let x = 5;           // immutable
let mut y = 5;       // mutable
const MAX: u32 = 100; // constant
\`\`\`

## Functions
\`\`\`rust
fn add(a: i32, b: i32) -> i32 {
    a + b  // implicit return
}
\`\`\`

## Control Flow
\`\`\`rust
if condition { } else { }
loop { break; }
while condition { }
for item in collection { }
\`\`\`

## Common Types
- i32, u32, i64, u64 - integers
- f32, f64 - floats
- bool - boolean
- char - character
- String, &str - strings
- Vec<T> - vector
- Option<T> - optional
- Result<T, E> - result`,

  '/notes/references/productivity/gtd-workflow.md': `# Getting Things Done (GTD) Workflow

## The 5 Steps

### 1. Capture
- Write down everything
- Don't filter or organize yet
- Use a single inbox

### 2. Clarify
- Is it actionable?
- What's the next action?
- Is it a project (2+ actions)?

### 3. Organize
- **Next Actions** - Do ASAP
- **Projects** - Multi-step outcomes
- **Waiting For** - Delegated items
- **Someday/Maybe** - Future possibilities
- **Reference** - Info to keep

### 4. Reflect
- Weekly review
- Update lists
- Clear inbox to zero

### 5. Engage
- Choose by context
- Choose by time available
- Choose by energy
- Choose by priority`,

  '/notes/inbox/book-recommendations.md': `# Book Recommendations

## Currently Reading
- **Deep Work** by Cal Newport - On focused work and productivity

## To Read
- [ ] "The Pragmatic Programmer" - Software craft fundamentals
- [ ] "Designing Data-Intensive Applications" - Systems design
- [ ] "The Art of Learning" - Josh Waitzkin on mastery
- [ ] "Meditations" - Marcus Aurelius

## Completed (2024-2025)
- [x] "Atomic Habits" by James Clear - Small changes, remarkable results
- [x] "Zero to One" by Peter Thiel - Startup philosophy
- [x] "The Rust Programming Language" - Language fundamentals

## Recommendations from Friends
- Sarah: "Thinking, Fast and Slow"
- Mike: "Staff Engineer" by Will Larson
- Alex: "The Phoenix Project"`,

  '/notes/projects/side-project-ideas.md': `# Side Project Ideas

## Active Consideration

### 1. Personal Finance Dashboard
**Problem:** Tracking spending across multiple accounts is tedious
**Solution:** Aggregator with categorization and insights
**Tech:** Rust backend, React frontend, Plaid API
**Status:** Researching APIs

### 2. Reading Tracker
**Problem:** Forget what I read and key takeaways
**Solution:** Simple app to log books with notes and highlights
**Tech:** Could be CLI or mobile app
**Status:** Sketching requirements

### 3. Home Automation Hub
**Problem:** Too many apps for smart home devices
**Solution:** Unified dashboard with automation rules
**Tech:** Raspberry Pi, Home Assistant
**Status:** On hold - need more research

## Parked Ideas
- Recipe manager with meal planning
- Workout tracker with progression graphs
- Daily journaling app with prompts

## Evaluation Criteria
1. Does it solve my own problem?
2. Can I build an MVP in a weekend?
3. Will I actually use it?`,

  '/notes/projects/rust-learning/borrowing-examples.md': `# Rust Borrowing Examples

## Immutable Borrowing

You can have multiple immutable borrows:

\`\`\`rust
fn main() {
    let s = String::from("hello");

    let r1 = &s; // OK
    let r2 = &s; // OK - multiple immutable borrows allowed

    println!("{} and {}", r1, r2);
}
\`\`\`

## Mutable Borrowing

Only one mutable borrow at a time:

\`\`\`rust
fn main() {
    let mut s = String::from("hello");

    let r1 = &mut s;
    // let r2 = &mut s; // ERROR - cannot borrow twice

    r1.push_str(" world");
    println!("{}", r1);
}
\`\`\`

## Cannot Mix Mutable and Immutable

\`\`\`rust
fn main() {
    let mut s = String::from("hello");

    let r1 = &s; // immutable borrow
    // let r2 = &mut s; // ERROR - cannot borrow mutably while immutably borrowed

    println!("{}", r1);
}
\`\`\`

## Borrow Scope Rules

Borrows end when last used (NLL - Non-Lexical Lifetimes):

\`\`\`rust
fn main() {
    let mut s = String::from("hello");

    let r1 = &s;
    println!("{}", r1); // r1 goes out of scope here

    let r2 = &mut s; // OK - r1 is done being used
    r2.push_str(" world");
}
\`\`\``,

  '/notes/projects/rust-learning/resources.md': `# Rust Learning Resources

## Official Resources
- [The Rust Book](https://doc.rust-lang.org/book/) - Must read
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
- [Rustlings](https://github.com/rust-lang/rustlings) - Interactive exercises
- [Rust Reference](https://doc.rust-lang.org/reference/)

## Video Courses
- [ ] Jon Gjengset's Crust of Rust series (YouTube)
- [ ] Ryan Levick's Rust intro series
- [ ] Tim McNamara's Rust in Action

## Books
- [x] "The Rust Programming Language" (official)
- [ ] "Rust in Action" by Tim McNamara
- [ ] "Programming Rust" by Blandy & Orendorff

## Practice Platforms
- [Exercism Rust Track](https://exercism.io/tracks/rust)
- [Advent of Code](https://adventofcode.com/) - in Rust
- [LeetCode](https://leetcode.com/) - for algorithms

## Communities
- r/rust on Reddit
- Rust Discord
- This Week in Rust newsletter

## Project Ideas for Practice
1. Command-line TODO app
2. Simple HTTP server
3. Markdown parser
4. File organizer utility`,

  '/notes/projects/fitness-tracker/nutrition-plan.md': `# Nutrition Plan

## Daily Targets
- **Calories:** 2,200-2,400 kcal
- **Protein:** 150-170g (1g per lb body weight)
- **Carbs:** 200-250g
- **Fat:** 70-80g

## Meal Template

### Breakfast (7:00 AM)
- 3 eggs scrambled
- 2 slices whole wheat toast
- 1 banana
- Black coffee

### Mid-Morning (10:00 AM)
- Greek yogurt (200g)
- Handful of almonds
- Protein shake if needed

### Lunch (12:30 PM)
- Grilled chicken breast (6oz)
- Rice (1 cup cooked)
- Mixed vegetables
- Olive oil dressing

### Afternoon (3:30 PM)
- Apple with peanut butter
- Protein bar

### Dinner (7:00 PM)
- Salmon or lean beef (6oz)
- Sweet potato
- Broccoli or asparagus
- Mixed salad

### Evening (optional)
- Cottage cheese
- Casein protein shake

## Weekly Prep
- [ ] Sunday: Cook 6 chicken breasts
- [ ] Sunday: Prep rice for the week
- [ ] Wednesday: Restock vegetables
- [ ] Check protein powder supply`,

  '/notes/projects/fitness-tracker/progress-photos.md': `# Progress Photos Log

## Guidelines
- Same lighting, same time of day
- Front, side, and back poses
- Take every 2 weeks on Sunday morning

## Progress Timeline

### Week 0 (Starting Point)
- Date: December 15, 2024
- Weight: 175 lbs
- Notes: Beginning of fitness journey

### Week 2
- Date: December 29, 2024
- Weight: 174 lbs
- Notes: Slight water weight loss, getting into routine

### Week 4
- Date: January 12, 2025
- Weight: 173 lbs
- Notes: Starting to see definition in shoulders

## Measurements
| Area | Week 0 | Week 2 | Week 4 |
|------|--------|--------|--------|
| Chest | 40" | 40" | 40.5" |
| Waist | 34" | 33.5" | 33" |
| Arms | 14" | 14" | 14.5" |
| Thighs | 23" | 23" | 23.5" |

## Notes
- Upper body responding well
- Core definition improving
- Need to focus more on legs`,

  '/notes/journal/2025-01/2025-01-08.md': `# Wednesday, January 8, 2025

## Morning Routine
- 6:30 AM wake up
- Meditation: 10 minutes
- Morning pages: Done

## Work
- Finished the API integration for the dashboard
- Code review for Sarah's PR
- Sprint planning meeting (1.5 hours)

## Learning
- Rust Book: Chapter 6 - Enums and Pattern Matching
- Key insight: Option<T> is much better than null

## Exercise
- Rest day (sore from Monday's workout)
- 20-minute walk at lunch

## Mood
Productive day overall. Feeling good about progress on the project.

## Tomorrow
- Deploy the API changes to staging
- Start on the user authentication feature`,

  '/notes/journal/2025-01/2025-01-09.md': `# Thursday, January 9, 2025

## Wins
- Successfully deployed to staging
- Fixed three bugs from QA
- Rust ownership concepts finally clicking

## Challenges
- Authentication feature more complex than expected
- Need to research OAuth 2.0 implementation

## Gratitude
- Great weather for a run this morning
- Team was helpful during debugging
- Had a good lunch conversation with Mike

## Ideas Captured
- Could we use Rust for the CLI tool at work?
- Book idea: "The Art of Learning"

## Evening
- Gym: Leg day
- Dinner: Made stir fry
- Reading: Deep Work (chapter 3)

## Tomorrow's Priorities
1. Finish OAuth research
2. Weekly review session
3. Morning run`,

  '/notes/journal/weekly-reviews/week-01-review.md': `# Week 1 Review (Jan 1-5, 2025)

## Accomplishments
- [x] Set up 2025 goals document
- [x] Started Rust learning plan
- [x] First gym session of the year
- [x] Completed sprint deliverables

## Challenges
- Struggled with motivation early in the week
- Too many meetings on Tuesday
- Sleep schedule still off from holidays

## Lessons Learned
- Starting the day with the hardest task works better
- Need to block off focus time more aggressively
- Writing down ideas immediately prevents losing them

## Next Week Focus
1. Finish Rust Book chapters 4-6
2. Maintain 4x gym sessions
3. Start side project research

## Habits Tracker
| Habit | M | T | W | T | F | S | S |
|-------|---|---|---|---|---|---|---|
| Wake 6:30 | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Meditate | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Exercise | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Read 30m | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |

## Score: 7/10
Good start to the year, room to improve on consistency.`,

  '/notes/journal/weekly-reviews/week-02-review.md': `# Week 2 Review (Jan 6-12, 2025)

## Accomplishments
- [x] Completed Rust chapters 4, 5, 6
- [x] Deployed dashboard API to production
- [x] 4 gym sessions achieved
- [x] Weekly meal prep working well

## Challenges
- OAuth implementation took longer than expected
- One late night to meet deadline
- Skipped meditation twice

## Lessons Learned
- Time estimates for new tech should include learning curve
- The pomodoro technique helps with focus
- Meal prep saves significant daily decision fatigue

## Next Week Focus
1. Start CLI tool project
2. Rust chapters 7-9
3. Improve sleep consistency

## Key Metrics
- Rust learning: On track
- Fitness: 4/4 sessions (100%)
- Reading: Finished "Deep Work"
- Code commits: 23

## Reflection
Feeling more settled into the routine. The systems are starting to work. Need to protect morning time more carefully.

## Score: 8/10
Better than last week. Momentum building.`,

  '/notes/references/programming/git-commands.md': `# Git Commands Reference

## Daily Commands
\`\`\`bash
git status              # Check current state
git add .               # Stage all changes
git commit -m "msg"     # Commit with message
git push                # Push to remote
git pull                # Pull from remote
\`\`\`

## Branching
\`\`\`bash
git branch              # List branches
git branch feature      # Create branch
git checkout feature    # Switch to branch
git checkout -b feature # Create and switch
git merge feature       # Merge into current
git branch -d feature   # Delete branch
\`\`\`

## Viewing History
\`\`\`bash
git log                 # Full log
git log --oneline       # Compact log
git log --graph         # Visual branch graph
git diff                # Unstaged changes
git diff --staged       # Staged changes
\`\`\`

## Undoing Things
\`\`\`bash
git checkout -- file    # Discard changes
git reset HEAD file     # Unstage file
git reset --soft HEAD~1 # Undo last commit (keep changes)
git reset --hard HEAD~1 # Undo last commit (discard)
git revert <commit>     # Create opposite commit
\`\`\`

## Stashing
\`\`\`bash
git stash               # Stash changes
git stash list          # List stashes
git stash pop           # Apply and remove
git stash apply         # Apply, keep stash
git stash drop          # Remove stash
\`\`\`

## Remote Operations
\`\`\`bash
git remote -v           # List remotes
git fetch               # Download changes
git pull --rebase       # Pull with rebase
git push -u origin main # Set upstream
\`\`\``,

  '/notes/references/programming/vim-shortcuts.md': `# Vim Shortcuts Reference

## Modes
- \`i\` - Insert mode (before cursor)
- \`a\` - Insert mode (after cursor)
- \`v\` - Visual mode
- \`V\` - Visual line mode
- \`Esc\` - Normal mode
- \`:\` - Command mode

## Navigation
- \`h j k l\` - Left, down, up, right
- \`w\` - Next word
- \`b\` - Previous word
- \`0\` - Start of line
- \`$\` - End of line
- \`gg\` - First line
- \`G\` - Last line
- \`{num}G\` - Go to line number

## Editing
- \`x\` - Delete character
- \`dd\` - Delete line
- \`yy\` - Yank (copy) line
- \`p\` - Paste after
- \`P\` - Paste before
- \`u\` - Undo
- \`Ctrl+r\` - Redo
- \`.\` - Repeat last command

## Search & Replace
- \`/pattern\` - Search forward
- \`?pattern\` - Search backward
- \`n\` - Next match
- \`N\` - Previous match
- \`:%s/old/new/g\` - Replace all

## Window Management
- \`:sp\` - Horizontal split
- \`:vsp\` - Vertical split
- \`Ctrl+w w\` - Switch windows
- \`Ctrl+w q\` - Close window

## Files
- \`:w\` - Save
- \`:q\` - Quit
- \`:wq\` - Save and quit
- \`:q!\` - Quit without saving
- \`:e file\` - Open file

## Pro Tips
- \`ciw\` - Change inner word
- \`ci"\` - Change inside quotes
- \`di(\` - Delete inside parens
- \`=G\` - Indent to end of file`,

  '/notes/references/productivity/pomodoro-guide.md': `# Pomodoro Technique Guide

## The Basics
1. Choose a task
2. Set timer for 25 minutes
3. Work until timer rings
4. Take a 5-minute break
5. After 4 pomodoros, take a 15-30 minute break

## Why It Works
- Creates urgency through time pressure
- Prevents burnout with regular breaks
- Makes progress visible and measurable
- Reduces decision fatigue

## Best Practices

### Starting a Pomodoro
- Clear your workspace
- Close unnecessary tabs/apps
- Put phone on silent
- Have water nearby
- Know exactly what you'll work on

### During the Pomodoro
- If distracted, note it and return to work
- Don't stop for "quick" tasks
- If you finish early, review or improve

### During Breaks
- Stand up and stretch
- Look away from screen (20-20-20 rule)
- Get water or snack
- Don't start new tasks

## Tracking Template
| Task | Pomodoros Estimated | Actual |
|------|---------------------|--------|
| Code review | 2 | 3 |
| Write docs | 1 | 1 |
| Fix bug | 2 | 2 |

## Common Mistakes
- Not taking breaks seriously
- Interrupting yourself for "urgent" things
- Not planning tasks before starting
- Using pomodoros for meetings

## Tools
- Physical timer (best for focus)
- Forest app
- Pomofocus.io
- Built-in phone timer`,

  '/notes/references/bookmarks.md': `# Bookmarks

## Development
- [Rust Playground](https://play.rust-lang.org/)
- [GitHub](https://github.com)
- [Stack Overflow](https://stackoverflow.com)
- [MDN Web Docs](https://developer.mozilla.org)
- [Can I Use](https://caniuse.com)

## Learning
- [Exercism](https://exercism.io)
- [Coursera](https://coursera.org)
- [Khan Academy](https://khanacademy.org)

## Tools
- [Excalidraw](https://excalidraw.com) - Quick diagrams
- [JSON Formatter](https://jsonformatter.org)
- [Regex101](https://regex101.com)
- [Carbon](https://carbon.now.sh) - Code screenshots

## Reading
- [Hacker News](https://news.ycombinator.com)
- [Lobsters](https://lobste.rs)
- [This Week in Rust](https://this-week-in-rust.org)

## Productivity
- [Todoist](https://todoist.com)
- [Notion](https://notion.so)
- [Obsidian](https://obsidian.md)

## Design
- [Dribbble](https://dribbble.com)
- [Coolors](https://coolors.co)
- [Unsplash](https://unsplash.com)`
};

export async function loadDirectory(dirPath) {
  // Check cache first
  const cached = state.cache.get(dirPath);
  if (cached) {
    return cached;
  }

  // Demo mode: use dummy folder structure
  if (isDummyMode()) {
    const dummyContents = DUMMY_FOLDER_STRUCTURE[dirPath];
    if (dummyContents) {
      state.cache.set(dirPath, dummyContents);
      return dummyContents;
    }
    return [];
  }

  // Electron mode: use real filesystem
  const result = await window.electronAPI.folderExplorer.readDir(dirPath);
  if (result.success) {
    state.cache.set(dirPath, result.items);
    return result.items;
  } else {
    console.error('Failed to load directory:', result.error);
    return [];
  }
}

/**
 * Read file contents (with dummy data fallback for demo mode)
 */
export async function readFile(filePath) {
  // Demo mode: use dummy file contents
  if (isDummyMode()) {
    const content = DUMMY_FILE_CONTENTS[filePath];
    if (content !== undefined) {
      return { success: true, content };
    }
    return { success: false, error: 'File not found' };
  }

  // Electron mode: use real filesystem
  if (!window.electronAPI?.folderExplorer?.readFile) {
    return { success: false, error: 'File reading not available' };
  }
  return await window.electronAPI.folderExplorer.readFile(filePath);
}

// ========================================
// Folder Picker
// ========================================

export async function pickFolder() {
  if (!window.electronAPI?.folderExplorer) {
    console.warn('Folder explorer not available in browser mode');
    return null;
  }

  const folderPath = await window.electronAPI.folderExplorer.pickFolder();
  if (folderPath) {
    setRootPath(folderPath);
  }
  return folderPath;
}

// ========================================
// Rendering
// ========================================

/**
 * Render the folder explorer section
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} options - Rendering options
 * @param {Function} options.onFileSelect - Callback when file is selected
 * @param {Function} options.onFolderSelect - Callback when folder is selected
 */
export async function render(container, options = {}) {
  const { onFileSelect, onFolderSelect } = options;

  // Clear container
  container.innerHTML = '';

  // Section header with collapse toggle
  const header = document.createElement('div');
  header.className = 'folder-explorer-header';
  header.innerHTML = `
    <span class="folder-explorer-toggle">${state.collapsed ? '>' : 'v'}</span>
    <span class="folder-explorer-title">FILES</span>
    ${state.rootPath ? `<span class="folder-explorer-path" title="${state.rootPath}">${getShortPath(state.rootPath)}</span>` : ''}
  `;
  header.onclick = (e) => {
    if (e.target.classList.contains('folder-explorer-title') || e.target.classList.contains('folder-explorer-toggle')) {
      toggleSectionCollapsed();
      render(container, options);
    }
  };
  container.appendChild(header);

  // If collapsed, stop here
  if (state.collapsed) {
    return;
  }

  // Content area
  const content = document.createElement('div');
  content.className = 'folder-explorer-content';
  container.appendChild(content);

  // No root folder set
  if (!state.rootPath) {
    const setFolderBtn = document.createElement('div');
    setFolderBtn.className = 'folder-explorer-empty';
    setFolderBtn.innerHTML = '<span class="folder-explorer-action">+ Set folder</span>';
    setFolderBtn.onclick = async () => {
      await pickFolder();
      render(container, options);
    };
    content.appendChild(setFolderBtn);
    return;
  }

  // Render tree starting from root
  await renderTree(content, state.rootPath, 0, { onFileSelect, onFolderSelect, container, options });
}

/**
 * Recursively render a directory tree
 */
async function renderTree(container, dirPath, depth, ctx) {
  const items = await loadDirectory(dirPath);

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'folder-explorer-item';
    if (state.selectedPath === item.path) {
      row.classList.add('selected');
    }
    row.style.paddingLeft = `${8 + depth * 12}px`;
    row.dataset.path = item.path;

    if (item.isDirectory) {
      const isExp = state.expanded.has(item.path);
      row.innerHTML = `
        <span class="folder-explorer-icon folder">${isExp ? 'v' : '>'}</span>
        <span class="folder-explorer-name">${item.name}</span>
      `;
      row.onclick = async (e) => {
        e.stopPropagation();
        toggleExpanded(item.path);
        if (ctx.onFolderSelect) {
          ctx.onFolderSelect(item);
        }
        setSelected(item.path);
        render(ctx.container, ctx.options);
      };
      container.appendChild(row);

      // Render children if expanded
      if (isExp) {
        await renderTree(container, item.path, depth + 1, ctx);
      }
    } else {
      row.innerHTML = `
        <span class="folder-explorer-icon file">&nbsp;</span>
        <span class="folder-explorer-name">${item.name}</span>
      `;
      row.onclick = (e) => {
        e.stopPropagation();
        setSelected(item.path);
        if (ctx.onFileSelect) {
          ctx.onFileSelect(item);
        }
        // Update selection visually
        container.querySelectorAll('.folder-explorer-item.selected').forEach(el => el.classList.remove('selected'));
        row.classList.add('selected');
      };
      container.appendChild(row);
    }
  }
}

// ========================================
// Utilities
// ========================================

function getShortPath(fullPath) {
  if (!fullPath) return '';
  const parts = fullPath.split('/').filter(Boolean);
  if (parts.length <= 2) return fullPath;
  return '.../' + parts.slice(-2).join('/');
}

export function getFileName(filePath) {
  if (!filePath) return '';
  const parts = filePath.split('/');
  return parts[parts.length - 1];
}

export function getExtension(filePath) {
  const name = getFileName(filePath);
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
}

// ========================================
// Initialization
// ========================================

export function init() {
  loadState();
}

// ========================================
// Default Export
// ========================================

// Get dummy file contents (for browser mode)
export function getDummyFileContent(filePath) {
  return DUMMY_FILE_CONTENTS[filePath];
}

// Check if running in demo mode (browser or forced demo)
export function isDummyMode() {
  return state.demoMode || !window.electronAPI?.folderExplorer;
}

// Enable/disable demo mode (for using dummy data in Electron)
export function setDemoMode(enabled) {
  state.demoMode = enabled;
  if (enabled) {
    clearCache();
  }
}

// Get the default dummy root path
export function getDummyRootPath() {
  return '/notes';
}

export default {
  // Getters
  getRootPath,
  isExpanded,
  getSelectedPath,
  isSectionCollapsed,
  isLoading,

  // Actions
  setRootPath,
  toggleExpanded,
  setSelected,
  toggleSectionCollapsed,
  setLoading,

  // Cache
  getCachedDir,
  setCachedDir,
  clearCache,

  // Persistence
  saveState,
  loadState,

  // Operations
  loadDirectory,
  pickFolder,
  readFile,

  // Rendering
  render,

  // Utils
  getFileName,
  getExtension,
  getDummyFileContent,
  isDummyMode,
  setDemoMode,
  getDummyRootPath,

  // Init
  init
};
