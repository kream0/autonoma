# TODO - Development Priorities

**Last Updated:** December 16, 2025 (Session 8)
**Current Focus:** Intelligent Developer Allocation
**Project Status:** Production Ready
**Stack:** TypeScript, Bun, blessed (TUI)

---

## COMPLETED THIS SESSION

| Task | Status |
|------|--------|
| Change DEFAULT_MAX_DEVELOPERS from 3 to 6 | DONE |
| Add TaskComplexity type and extend DevTask/TaskBatch | DONE |
| Update Staff Engineer prompt with complexity analysis | DONE |
| Parse recommendedDevelopers from Staff output | DONE |
| Apply advisory recommendation (capped by user max) | DONE |
| Add per-batch maxParallelTasks support | DONE |
| Update developer prompts to include complexity and context | DONE |
| Add --max-developers N CLI flag | DONE |

---

## HOW TO USE

```bash
# From autonoma directory:
cd /mnt/c/Users/Karim/Documents/work/_tools/AI/autonoma

# Fresh start - new project (default 6 developers)
bun run dev start /path/to/project/requirements.md

# Fresh start with custom developer limit
bun run dev start /path/to/project/requirements.md --max-developers 4

# Adopt existing project
bun run dev adopt /path/to/project/requirements.md

# Adopt with context files and custom developer limit
bun run dev adopt /path/to/project/requirements.md --context structure.md --max-developers 3

# Resume from checkpoint
bun run dev resume /path/to/project

# Run demo mode
bun run dev demo

# Show help
bun run dev --help
```

---

## COMPLEXITY-AWARE DEVELOPER ALLOCATION

The Staff Engineer now analyzes task complexity and recommends parallel developer count:

| Complexity | Guidance |
|------------|----------|
| simple | Single file, ~5-50 lines |
| moderate | 1-3 files, ~50-200 lines |
| complex | Multiple files, ~200-500 lines |
| very_complex | Architectural, extensive context |

| Task Mix | Recommended Developers |
|----------|----------------------|
| All simple/moderate | Up to 6 (full parallelism) |
| Mix with complex | 3-4 developers |
| Mostly complex/very_complex | 1-2 developers |

---

## STATE FORMAT (v3)

State saved to `<project>/.autonoma/state.json`:
- `requirementsPath` - Path to requirements file (not content)
- `hasProjectContext` - Whether CLAUDE.md exists (not content)
- `batches` - Tasks with complexity and context fields
- `currentBatchIndex` - Which batch we're on
- `currentTasksInProgress` - Tasks currently running
- `maxDevelopers` - Current developer limit (may be reduced by Staff)

Logs saved to `<project>/.autonoma/logs/`

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
| Better tile sizing for 6 developers | Pending |

### Priority 3: Configuration
| Task | Status |
|------|--------|
| Config file support (.autonomarc) | Pending |
| Custom agent prompts | Pending |

---

## ARCHITECTURE

```
src/
├── index.ts          # CLI entry point (start/resume/adopt/demo, --max-developers)
├── types.ts          # Type definitions (TaskComplexity, DevTask, TaskBatch)
├── session.ts        # Claude Code subprocess wrapper
├── orchestrator.ts   # Agent hierarchy, complexity analysis, parallel execution
└── tui/
    ├── screen.ts     # Blessed screen + keybindings
    ├── tiles.ts      # Split-tile layout
    └── views/
        ├── tasks.ts  # Task list view
        ├── stats.ts  # Stats view
        └── dashboard.ts
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
