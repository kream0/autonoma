# Development Backlog

**Purpose:** Long-term and future enhancement tasks
**Last Updated:** December 30, 2025 (Session 43)

---

## COMPLETED: Claude Code Control API (Session 39)

**Goal:** Make Autonoma 100% controllable by Claude Code or any automation tool

### Sprint 7: File-Based Control -> DONE

| Task | Status | Description |
|------|--------|-------------|
| Status file writer | DONE | Write `.autonoma/status.json` on state changes |
| Guidance file watcher | DONE | Poll `.autonoma/guidance.txt`, inject to CEO |
| `autonoma status` command | DONE | CLI to read and display status |
| `autonoma guide` command | DONE | CLI to write guidance file |

**Usage:**
```bash
autonoma status ./project          # Check current status
autonoma guide ./project "msg"     # Send guidance to CEO
```

---

## COMPLETED: Memorai Integration & Supervisor Features (Session 43)

**Goal:** Integrate memorai package and add supervisor reliability features

### Phase 3: Supervisor Features -> DONE
| Task | Status | Description |
|------|--------|-------------|
| Verification system | DONE | Auto-run tests/build/typecheck after tasks |
| Human queue | DONE | Queue blockers for human resolution |
| Retry context | DONE | Inject error context into retries |
| 40% context reminder | DONE | Keep developers focused |
| Priority rebalancing | DONE | Boost old/stuck tasks |

### Phase 4: Memorai Integration -> DONE
| Task | Status | Description |
|------|--------|-------------|
| Add memorai dependency | DONE | Linked locally (file:../memorai) |
| Search before phases | DONE | Planning + development get memories |
| Store learnings | DONE | After successful task completion |

### Deferred (Completed in Session 44)
| Task | Status | Notes |
|------|--------|-------|
| Wave 6: Cleanup legacy memory | DONE | Removed src/memory/, memorai is sole memory system |

**Usage:**
```bash
autonoma queue ./project              # View pending blockers
autonoma respond ./project <id> "fix" # Respond to blocker
autonoma pause ./project              # Pause orchestration (Session 44)
autonoma logs ./project [--tail N]    # View logs (Session 44)
```

---

## COMPLETED: Memorai Pattern Refactor (Sessions 33-37)

**Goal:** Adopt best practices from Memorai tool for reliability & learning

### Sprint 1: Foundation -> DONE
- Modular directory structure (types/, protocol/, db/, memory/)
- Split types.ts into focused modules
- Backwards-compatible re-exports

### Sprint 2: Protocols -> DONE
- Daemon protocol types (HEARTBEAT, STATUS, CHECKPOINT, etc.)
- Worker protocol types (TaskBundle, WorkerResult)
- Protocol parser for structured agent output
- SQLite schema with FTS5 for memory

### Sprint 3-5: Integration -> DONE + TESTED
- AutonomaDb initialized in orchestrator
- MemoryStore, MemoryWorkflow, MemoryRetrieval integrated
- ProtocolParser connected to task completion
- Developer prompts updated with daemon protocol
- Memory retrieval before tasks, storage after completion

### Sprint 6: Decompose Orchestrator -> DONE
- Created `src/phases/` directory with 10 modules
- Extracted prompts, parsers, and all phase functions
- PhaseContext interface for dependency injection
- Reduced orchestrator.ts from 2485 to 1132 lines (54%)

---

## FUTURE ENHANCEMENTS

### Performance & Reliability

| Feature | Effort | Notes |
|---------|--------|-------|
| Exploration cache | 2 hr | CEO caches file tree to reduce re-exploration |
| Crash recovery handoff | 2 hr | Synthetic handoff from git diff on restart |
| Iteration counter | 30 min | Show "Attempt 2/3" in developer prompts |

### User Experience

| Feature | Effort | Notes |
|---------|--------|-------|
| Progress bar in TUI | 1 hr | Visual progress indicator |
| Task dependency graph | 2 hr | Show task relationships in task view |
| Cost estimation | 1 hr | Estimate tokens/cost before starting |

### Integration

| Feature | Effort | Notes |
|---------|--------|-------|
| MCP server mode | 4 hr | Run as MCP server for Claude Desktop |
| GitHub Actions | 2 hr | Action to run Autonoma in CI |
| VS Code extension | 8 hr | Sidebar panel for Autonoma control |

---

## ARCHIVED

### QA Wrong Project Fix (Session 32)
- Root cause: Claude Code agents ignore cwd, need explicit path -> IDENTIFIED
- Added `<project_path>` block to `buildContextSection()` -> DONE
- Enhanced QA test/review prompts with explicit path + warnings -> DONE

---

**Archive Policy:** Move completed items after 2 sessions
