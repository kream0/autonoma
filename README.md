# Autonoma

A CLI tool that orchestrates multiple Claude Code instances with a hierarchical agent organization, displayed in a split-tile terminal interface.

## Overview

Autonoma enables faster development by running multiple Claude Code agents in parallel:

- **CEO Agent** - Creates high-level plan from requirements
- **Staff Engineer** - Breaks plan into batched tasks with complexity analysis
- **Developer Agents** (up to 6) - Execute tasks in parallel
- **QA Agent** - Reviews completed work

All agents are visible simultaneously in a split-tile TUI, with keyboard navigation similar to a video call interface.

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

Optionally limit parallel developers:

```bash
bun run dev start requirements.md --max-developers 4
```

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
| `q` | Quit |

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

## Complexity-Aware Allocation

The Staff Engineer analyzes task complexity and recommends optimal parallelism:

| Complexity | Description | Guidance |
|------------|-------------|----------|
| `simple` | Single file, ~5-50 lines | Full parallelism (6 devs) |
| `moderate` | 1-3 files, ~50-200 lines | Full parallelism |
| `complex` | Multiple files, ~200-500 lines | Reduced (3-4 devs) |
| `very_complex` | Architectural, extensive context | Minimal (1-2 devs) |

Each task also receives a `context` field with task-specific guidance for developers, and batches with complex tasks use `maxParallelTasks` to prevent context overflow.

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
├── index.ts          # CLI entry point
├── types.ts          # Type definitions
├── session.ts        # Claude Code subprocess wrapper
├── orchestrator.ts   # Agent hierarchy & execution
└── tui/
    ├── screen.ts     # Blessed screen + keybindings
    ├── tiles.ts      # Split-tile layout
    └── views/
        ├── tasks.ts      # Task list
        ├── stats.ts      # Statistics
        └── dashboard.ts  # Agent overview
```

## License

MIT
