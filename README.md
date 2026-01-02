# Autonoma

A CLI tool that orchestrates multiple Claude Code instances with a hierarchical agent organization, displayed in a split-tile terminal interface.

## Overview

Autonoma enables faster development by running multiple Claude Code agents in parallel:

- **CEO Agent** - Creates high-level plan from requirements
- **Staff Engineer** - Breaks plan into batched tasks with complexity analysis
- **Developer Agents** - Dynamically spawned per batch for optimal parallelism
- **QA Agent** - Reviews completed work with verification pipeline

All agents are visible simultaneously in a split-tile TUI, with keyboard navigation similar to a video call interface.

## What's New (v4)

- **Dynamic Developer Spawning** - Developers are created per-batch based on task count and complexity (no more fixed limit)
- **Completion Promises** - Agents emit `<promise>TASK_COMPLETE</promise>` blocks to signal completion
- **Recitation Blocks** - End-of-prompt objective reminders keep agents focused on task goals
- **KV-Cache Optimized Prompts** - Static → semi-static → dynamic prompt ordering for better cache hits
- **Verification Pipeline** - Multi-stage verification (typecheck, lint, test) after task completion
- **Observation Store** - Large tool outputs saved to disk to reduce context usage

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/autonoma.git
cd autonoma

# Install dependencies
bun install

# Run
bun run dev <command>
```

Requires:
- [Bun](https://bun.sh) runtime
- [Claude Code CLI](https://claude.ai/claude-code) installed and authenticated

## Usage

### Start New Project

```bash
bun run dev start requirements.md
```

Creates a fresh orchestration from a requirements file. State is saved to `.autonoma/state.json` for resume capability.

Developers are spawned dynamically based on batch size and complexity - no manual configuration needed.

### Resume Project

```bash
bun run dev resume /path/to/project
```

Continue from the last checkpoint. Skips completed phases automatically.

### Adopt Existing Project

```bash
bun run dev adopt requirements.md
```

Analyze an existing codebase, identify what's implemented, and plan remaining work.

For large codebases, provide context files to save tokens:

```bash
bun run dev adopt requirements.md --context STRUCTURE.md,ARCHITECTURE.md
```

Context files can contain folder structure, architecture docs, or implementation status.

### Indefinite Mode

```bash
bun run dev start requirements.md --indefinite
```

Run autonomously until project is 100% complete. Features:
- Continuous dev → test → QA → CEO approval loop
- Context window monitoring with automatic agent handoff
- Health monitoring with crash recovery
- User guidance mid-run (see below)

Combine with stdout mode for headless operation:

```bash
bun run dev start requirements.md --indefinite --stdout
```

### Stdout Mode

```bash
bun run dev start requirements.md --stdout
```

Headless operation with plain-text output instead of TUI. Automatically logs session to `.autonoma/logs/session-{timestamp}.log`. Ideal for:
- Long-running tasks in tmux/screen
- CI/CD pipelines
- Low-bandwidth connections

### Session Logging

```bash
# Stdout mode: automatic logging
bun run dev start requirements.md --stdout

# TUI mode: optional logging
bun run dev start requirements.md --log
```

Logs saved to `.autonoma/logs/session-{timestamp}.log` with format:
```
[MM:SS] [AGENT/STATUS] message
```

### Demo Mode

```bash
bun run dev demo
```

Run with mock agents to test the UI.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑↓←→` or `hjkl` | Navigate between tiles |
| `Enter` | Focus (maximize) selected tile |
| `Escape` | Return to split view / Close overlay |
| `t` | Task list view |
| `s` | Stats view |
| `d` | Dashboard view |
| `p` | Pause & provide guidance (indefinite mode) |
| `q` | Quit |

## User Guidance

In indefinite mode, you can provide guidance to redirect the project:

**TUI Mode:** Press `p` to pause, type guidance, press Enter to submit.

**Stdout Mode:** Type guidance and press Enter at any time. Example:
```bash
# While running, type:
Also add error handling to the API endpoints
```

The CEO will replan based on your guidance and continue execution.

## Views

### Split Tiles (Default)

```
+------------------+------------+-----+
|                  |            |     |
|      CEO         |   Staff    | Dev |
|     (40%)        |   (30%)    |(15%)|
|                  |            +-----+
|                  |            | QA  |
|                  |            |(15%)|
+------------------+------------+-----+
```

### Task List (`t`)

Shows all tasks across batches with status:
- `○` Pending (gray)
- `◐` Running (yellow)
- `●` Complete (green)
- `✗` Failed (red)

Title shows progress: "Tasks 18/86"

### Stats (`s`)

Session duration, token usage per agent, overall progress.

### Dashboard (`d`)

Overview of all agents with token usage and cost breakdown.

## State & Logs

- **State:** `<project>/.autonoma/state.json`
- **Logs:** `<project>/.autonoma/logs/`

State includes:
- Requirements path
- Plan from CEO
- Task batches from Staff Engineer (with complexity and context)
- Current progress and developer count
- Completed phases

## Memorai Integration

Autonoma integrates with [Memorai](https://github.com/yourusername/memorai) for persistent knowledge management:

**For Agents:**
- Developers search relevant memories before starting tasks
- Learnings are automatically stored after successful task completion
- CEO receives architecture/decision memories during planning

**For Development:**
- `.memorai/` stores project knowledge in SQLite
- Claude Code hooks auto-inject context at session start
- Memories include: architecture patterns, gotchas, past bug fixes

```bash
# Check memory status
npx memorai status

# Search memories
npx memorai find "retry system"

# View recent memories
npx memorai recent 10
```

## Complexity-Aware Allocation

The Staff Engineer analyzes task complexity to prevent context overflow:

| Complexity | Description |
|------------|-------------|
| simple | Single file, ~5-50 lines |
| moderate | 1-3 files, ~50-200 lines |
| complex | Multiple files, ~200-500 lines |
| very_complex | Architectural, extensive context |

Based on the task mix, Staff Engineer recommends parallel developers:

| Task Mix | Recommended Developers |
|----------|------------------------|
| All simple/moderate | Up to 6 (full parallelism) |
| Mix with complex | 3-4 developers |
| Mostly complex/very_complex | 1-2 developers |

Each task receives a `context` field with task-specific guidance, and batches with complex tasks use `maxParallelTasks` to limit concurrency.

## Development

```bash
# Type check
bun run typecheck

# Build
bun run build

# Run production build
bun run start
```

## Architecture

```
src/
├── index.ts            # CLI entry point, App classes
├── types.ts            # Type definitions
├── session.ts          # Claude Code subprocess wrapper
├── orchestrator.ts     # Agent hierarchy & coordination
├── indefinite.ts       # IndefiniteLoopController
├── context-monitor.ts  # Context window monitoring
├── handoff.ts          # Agent handoff block parsing
├── queue.ts            # Work-stealing task queue
├── watchdog.ts         # Health monitoring
├── phases/             # Phase execution modules
│   ├── planning.ts       # CEO planning & replan
│   ├── task-breakdown.ts # Staff Engineer batching
│   ├── development.ts    # Parallel/sequential execution
│   ├── testing.ts        # Automated test phase
│   ├── review.ts         # QA review
│   ├── ceo-approval.ts   # Final approval
│   ├── prompts.ts        # Agent system prompts
│   ├── prompt-builder.ts # KV-cache optimized prompt construction
│   ├── recitation.ts     # End-of-prompt objective reminders
│   └── parsers.ts        # Output JSON parsers
├── observation-store.ts  # File-based storage for large observations
├── verification/       # Post-task verification
│   ├── detector.ts       # Project type detection
│   ├── pipeline.ts       # Multi-stage verification runner
│   └── index.ts          # Run typecheck/build/tests
├── human-queue/        # Blocker management
│   ├── store.ts          # SQLite storage
│   └── index.ts          # HumanQueue class
├── retry/              # Retry context injection
│   └── index.ts          # Error context for retries
└── tui/
    ├── screen.ts       # Blessed screen + keybindings
    ├── tiles.ts        # Split-tile layout
    └── views/
        ├── tasks.ts      # Task list
        ├── stats.ts      # Statistics
        └── dashboard.ts  # Agent overview
```

## License

MIT
