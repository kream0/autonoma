# Development Backlog

**Purpose:** Long-term and future enhancement tasks
**Last Updated:** December 16, 2025 (Session 4)

---

## RECENTLY COMPLETED (Moved from Backlog)

### Session Persistence ✅
- Save session state on exit → **DONE**
- Resume from saved state → **DONE**
- Adopt existing projects → **DONE**

### Parallel Execution ✅
- Multiple developer agents → **DONE** (3 by default)
- Batched task execution → **DONE**
- Promise.all for parallel work → **DONE**

---

## FUTURE ENHANCEMENTS

### CLI Configuration
**Priority:** HIGH

**Tasks:**
- `--max-developers N` flag to set developer count
- `--model <model-id>` flag to change Claude model
- `--no-tui` flag for headless operation

---

### Retry Failed Tasks
**Priority:** HIGH

**Tasks:**
- Auto-retry failed tasks (max 3 attempts)
- Exponential backoff between retries
- Mark as permanently failed after max retries
- QA can request task re-execution

---

### Better TUI Layout
**Priority:** MEDIUM

**Tasks:**
- Dynamic tile sizing based on agent count
- Horizontal/vertical split options
- Collapsible tiles for inactive agents
- Full-screen focus mode improvements

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
- Session cost tracking (token usage)
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
1. **Priority level** (LOW/MEDIUM/HIGH)
2. **Task list** (concrete steps)
3. **Why it matters** (user benefit)

### Moving Tasks to TODO
Items move from BACKLOG to TODO when:
- They become critical for user experience
- Core functionality depends on them
- User demand increases

---

**Last Review:** December 16, 2025
