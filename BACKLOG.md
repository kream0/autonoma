# Development Backlog

**Purpose:** Long-term and future enhancement tasks
**Last Updated:** December 17, 2025 (Session 9)

---

## RECENTLY COMPLETED (Moved from Backlog)

### Session Persistence
- Save session state on exit → **DONE**
- Resume from saved state → **DONE**
- Adopt existing projects → **DONE**

### Parallel Execution
- Multiple developer agents → **DONE** (up to 6)
- Batched task execution → **DONE**
- Promise.all for parallel work → **DONE**

### Complexity-Aware Allocation (Session 8)
- Task complexity analysis → **DONE**
- Staff Engineer recommendations → **DONE**
- Per-batch parallelism limits → **DONE**
- `--max-developers N` CLI flag → **DONE**

---

## ACTIVE DEVELOPMENT (Next Sessions)

### UX Enhancement: Show Developer Idle Reason
**Priority:** LOW
**Status:** Planned

**Problem:** When developers are idle (e.g., only 1 task pending), the TUI doesn't explain why.

**Tasks:**
- [ ] Show "Idle - No pending tasks" status for unused developers
- [ ] Display batch's `maxParallelTasks` limit in TUI
- [ ] Add tooltip/info for `--max-developers` vs actual concurrency

---

### Optional: Force Parallel Override Flag
**Priority:** LOW
**Status:** Planned

**Problem:** Users may want to override Staff Engineer's `maxParallelTasks` limit.

**Tasks:**
- [ ] Add `--force-parallel` flag to ignore batch `maxParallelTasks`
- [ ] Document risks (may cause context overflow in complex tasks)

---

## RECENTLY COMPLETED (Sessions 11-13)

### P0 Bug Investigation - NOT A BUG (Session 13)
- Investigated "only 1 agent runs" issue
- Determined it's expected behavior: only 1 pending task in current batch
- `--max-developers` sets maximum available, `maxParallelTasks` limits per-batch concurrency

### Token Display Bug Fix - COMPLETE (Session 11)
Removed cost display from dashboard.ts and stats.ts.

### Work-Stealing Queue - COMPLETE (Session 11)
Created `src/queue.ts` with TaskQueue class.

### QA Feedback Loop - COMPLETE (Session 11)
QA → Developer retry loop with max 2 retries.

### --max-developers Flag Fix - COMPLETE (Session 12)
Fixed flag being ignored on resume.

---

## FUTURE ENHANCEMENTS

### Better TUI Layout
**Priority:** MEDIUM

**Tasks:**
- Dynamic tile sizing based on agent count
- Horizontal/vertical split options
- Collapsible tiles for inactive agents
- Full-screen focus mode improvements
- Better layout for 6 developers

---

### Git Integration
**Priority:** MEDIUM

**Tasks:**
- Auto-create branches for agent work
- Git worktree support for parallel work
- Commit summary in dashboard
- PR creation after QA approval

---

### Custom Agent Prompts
**Priority:** MEDIUM

**Tasks:**
- Configurable system prompts per role
- Template variables for prompts
- Prompt library/presets
- Load prompts from project `.autonoma/prompts/`

---

### Configuration File Support
**Priority:** LOW

**Tasks:**
- `.autonomarc` or `autonoma.config.ts`
- Define agent hierarchy
- Custom tile layouts
- Keyboard shortcut remapping
- Default model selection

---

### CLI Enhancements
**Priority:** LOW

**Tasks:**
- `--model <model-id>` flag to change Claude model
- `--no-tui` flag for headless operation
- `--verbose` flag for debug output

---

### Multi-Project Support
**Priority:** LOW

**Tasks:**
- Support multiple simultaneous projects
- Project switching via keyboard shortcut
- Separate agent pools per project

---

### Performance Metrics
**Priority:** LOW

**Tasks:**
- Track task completion times
- Agent efficiency comparison
- Historical stats across sessions

---

### Log Export & Search
**Priority:** LOW

**Tasks:**
- Export session logs to markdown
- Searchable log viewer in TUI
- Filter logs by agent/phase
- Timeline view of all agent activity

---

## ARCHIVED (From Old Python Version)

The following items were part of the old Python implementation and are no longer relevant:

- ~~Electrobun desktop integration~~
- ~~MCP server integration~~
- ~~SQLite state management~~
- ~~anthropic SDK integration~~
- ~~pexpect PTY wrapper~~
- ~~Rate limit handling~~
- ~~Token budget tracking~~

---

## Notes

### Adding New Tasks
When adding new backlog items, include:
1. **Priority level** (LOW/MEDIUM/HIGH/CRITICAL)
2. **Task list** (concrete steps)
3. **Why it matters** (user benefit)

### Moving Tasks to TODO
Items move from BACKLOG to TODO when:
- They become critical for user experience
- Core functionality depends on them
- User demand increases

---

**Last Review:** December 20, 2025

