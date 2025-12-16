# TODO - Development Priorities

**Last Updated:** December 16, 2025 (Session 7)
**Current Focus:** XML Prompt Structuring & Project Doc Detection
**Project Status:** Production Ready
**Stack:** TypeScript, Bun, blessed (TUI)

---

## COMPLETED THIS SESSION

| Task | Status |
|------|--------|
| Refactor all agent prompts to use XML tags for better structure | DONE |
| Add project documentation detection (PRD.md, TODO.md, etc.) | DONE |
| Include detected docs in agent prompts with XML structure | DONE |
| Update buildContextSection to use XML format | DONE |
| Update loadContextFiles to use XML format | DONE |
| Add permission mode support (plan vs full) | DONE |
| CEO and Staff use --permission-mode plan (read-only) | DONE |
| Developer and QA use --dangerously-skip-permissions (full access) | DONE |

---

## HOW TO USE

```bash
# From autonoma directory:
cd /mnt/c/Users/Karim/Documents/work/_tools/AI/autonoma

# Fresh start - new project
bun run dev start /path/to/project/requirements.md

# Adopt existing project (analyze what exists, plan remaining work)
bun run dev adopt /path/to/project/requirements.md

# Adopt with context files (saves tokens on large codebases)
bun run dev adopt /path/to/project/requirements.md --context structure.md,architecture.md

# Resume from checkpoint (after quit or crash)
bun run dev resume /path/to/project

# Run demo mode
bun run dev demo

# Show help
bun run dev --help
```

---

## STATE FORMAT (v3)

State saved to `<project>/.autonoma/state.json`:
- `requirementsPath` - Path to requirements file (not content)
- `hasProjectContext` - Whether CLAUDE.md exists (not content)
- `batches` - Tasks organized into parallel/sequential batches
- `currentBatchIndex` - Which batch we're on
- `currentTasksInProgress` - Tasks currently running

Logs saved to `<project>/.autonoma/logs/`

---

## PARALLEL EXECUTION

Staff Engineer outputs batched tasks:
```json
{
  "batches": [
    {"batchId": 1, "parallel": false, "tasks": [...]},
    {"batchId": 2, "parallel": true, "tasks": [...]}
  ]
}
```

- 3 developer agents by default
- Parallel batches run tasks simultaneously
- Sequential batches run one task at a time
- Resume-aware: picks up from exact batch/task

---

## FUTURE ENHANCEMENTS

### Priority 1: Stability
| Task | Status |
|------|--------|
| Retry failed tasks | Pending |
| Better error messages | Pending |
| Graceful shutdown (SIGINT handling) | Pending |

### Priority 2: TUI Improvements
| Task | Status |
|------|--------|
| Text selection in tiles | Pending |
| Progress bar for batches | Pending |
| Better tile sizing for many developers | Pending |

### Priority 3: Configuration
| Task | Status |
|------|--------|
| `--max-developers N` CLI flag | Pending |
| Config file support (.autonomarc) | Pending |
| Custom agent prompts | Pending |

---

## ARCHITECTURE

```
src/
├── index.ts          # CLI entry point (start/resume/adopt/demo)
├── types.ts          # Type definitions (TokenUsage, DevTask, TaskBatch, PersistedState)
├── session.ts        # Claude Code subprocess wrapper (stream-json, token tracking)
├── orchestrator.ts   # Agent hierarchy, parallel execution, state persistence
└── tui/
    ├── screen.ts     # Blessed screen + keybindings
    ├── tiles.ts      # Split-tile layout
    └── views/
        ├── tasks.ts  # Task list view (with progress in title)
        ├── stats.ts  # Stats view (with token counts)
        └── dashboard.ts  # Dashboard (all devs + tokens/cost)
```

---

## KEYBOARD SHORTCUTS

| Key | Action |
|-----|--------|
| ↑↓←→ or hjkl | Navigate tiles |
| Enter | Focus tile |
| Escape | Return to tiles |
| t | Task list |
| s | Stats |
| d | Dashboard |
| q | Quit |
