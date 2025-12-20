# Development Backlog

**Purpose:** Long-term and future enhancement tasks
**Last Updated:** December 20, 2025 (Session 26)

---

## RECENTLY COMPLETED (Moved from Backlog)

### Session Logging (Sessions 25-26)
- `--stdout` auto-logs to `.autonoma/logs/session-{timestamp}.log` → **DONE**
- `--log` flag for TUI mode → **DONE**
- Log format `[MM:SS] [AGENT/STATUS] message` → **DONE**
- User guidance captured in logs → **DONE**
- Race condition bug fix in `flushLog()` → **DONE**

### Indefinite Autonomous Run Mode (Session 22)
- `--indefinite` CLI flag → **DONE**
- Context window monitoring (50/60/70/80%) → **DONE**
- XML handoff block parsing → **DONE**
- Agent replacement with handoff injection → **DONE**
- Health monitoring (exit, timeout, errors) → **DONE**
- Watchdog system → **DONE**
- Browser project detection for E2E → **DONE**
- Pause keybinding (`p`) → **DONE**

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

### Indefinite Mode: Core Testing Complete
**Priority:** HIGH
**Status:** Core Flow Verified Working (Session 24)

**Completed Wiring (Session 23):**
- [x] Connect IndefiniteLoopController.run() to orchestrator phases
- [x] Add `runInitialPhases()` and `runOneCycle()` to orchestrator
- [x] Wire controller execution in index.ts (TUI + Stdout)
- [x] TypeScript compiles with no errors

**Testing Completed (Session 24):**
- [x] Test with simple project (Hello Autonoma) - PASSED
- [x] Loop iteration messages verified: `[INDEFINITE/LOOP] Iteration 1`
- [x] Parallel developer execution verified (work-stealing queue)
- [x] Complexity-aware allocation verified

**User Guidance System (Session 24):**
- [x] Implement user input capture when paused (textbox overlay)
- [x] CEO processes user guidance and adjusts plan

**Session Logging (Session 25-26):**
- [x] Implemented `--stdout` auto-logging
- [x] Implemented `--log` flag for TUI mode
- [x] Fixed race condition in `flushLog()` causing duplicates
- [x] Tested user guidance capture in logs

**Remaining Tasks:**
- [ ] Test TUI mode (status bar, pause keybinding, textbox overlay)
- [ ] Test with medium complexity project
- [ ] Add E2E agent spawning when browser project detected

---

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

**Last Review:** December 20, 2025 (Session 26)

