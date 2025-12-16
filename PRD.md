# Autonoma - Product Requirements Document

## Executive Summary

**Autonoma** is a CLI tool that orchestrates multiple Claude Code instances with a hierarchical agent organization, displayed in a split-tile terminal interface. It enables users to develop ideas from start to finish faster than a single agent could.

## Core Value Proposition

> "A tool to orchestrate multiple Claude Code instances with a clear hierarchical organization of agents, allowing the user to develop an idea from the beginning to the end at a faster rate than one agent would."

## Goals

1. **Simple** - Direct CLI subprocess management, no complex SDKs
2. **Fast** - Bun runtime for instant startup
3. **Visual** - Split-tile TUI showing all agents simultaneously
4. **Intuitive** - Keyboard navigation like a video call interface

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Bun | Fast startup, native subprocess |
| Language | TypeScript | Type safety, single language |
| TUI | blessed | Battle-tested, split panes |
| Process | Bun.spawn() | Simple CLI subprocess management |

## Architecture

```
autonoma/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── types.ts          # Type definitions
│   ├── session.ts        # Claude Code session wrapper
│   ├── orchestrator.ts   # Agent hierarchy management
│   └── tui/
│       ├── screen.ts     # Main blessed screen
│       ├── tiles.ts      # Split-tile layout
│       └── views/
│           ├── tasks.ts  # Task list view
│           ├── stats.ts  # Stats view
│           └── dashboard.ts
├── package.json
└── tsconfig.json
```

## Agent Hierarchy

### Level 1: CEO Agent
- **Role:** Ingests requirements, creates high-level plan
- **Tile Size:** Largest (40%)

### Level 2: Staff Engineer Agent
- **Role:** Breaks plan into technical tasks, organizes batches
- **Tile Size:** Medium (30%)

### Level 3: Developer Agents
- **Role:** Execute tasks, write code (3 agents by default, work in parallel)
- **Tile Size:** Small (multiple, 15% each)

### Level 4: QA Agent
- **Role:** Review code, run tests
- **Tile Size:** Small (15%)

## User Interface

### Primary View: Split Tiles

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

- Tiles are proportional to agent importance
- Selected tile has highlighted border
- Each tile streams Claude Code output

### Navigation

| Key | Action |
|-----|--------|
| Arrow keys / hjkl | Navigate between tiles |
| Enter | Focus (maximize) selected tile |
| Escape | Return to split view |
| t | Task list view |
| s | Stats view |
| d | Dashboard view |
| q | Quit |

### Focus Mode
Like Teams/Zoom meeting spotlight:
- Selected tile expands to full screen
- Other tiles hidden
- Escape returns to split view

### Special Views

1. **Task List (t)**
   - Shows all tasks across all batches
   - Status: pending, running, complete, failed
   - Title shows progress: "Tasks N/TOTAL"

2. **Stats (s)**
   - Session duration
   - Token usage per agent
   - Overall progress

3. **Dashboard (d)**
   - Overview of all agents
   - Token usage and cost breakdown
   - Quick status summary

## CLI Commands

### Start New Project
```bash
autonoma start <requirements.md>
```
Begin fresh orchestration with requirements file.

### Resume Project
```bash
autonoma resume <project-dir>
```
Continue from last checkpoint. Skips completed phases.

### Adopt Existing Project
```bash
autonoma adopt <requirements.md> [--context file1,file2,...]
```
Analyze existing project, create plan for remaining work.

**Context Files:** For large codebases, provide context files (folder structure, architecture docs) to save tokens by avoiding redundant exploration.

### Demo Mode
```bash
autonoma demo
```
Run demo with mock agents.

## User Flow

1. **Start:** `autonoma start <requirements.md>`
2. **Watch:** Split-tile view shows all agents working
3. **Navigate:** Arrow keys to move between tiles
4. **Focus:** Enter to maximize a tile
5. **Monitor:** Use t/s/d for special views
6. **Complete:** All agents finish, code is ready

## State Persistence

State saved to `<project>/.autonoma/state.json`:
- Requirements path (not content)
- Plan from CEO
- Task batches from Staff Engineer
- Current batch index
- Completed phases

Logs saved to `<project>/.autonoma/logs/`

## Parallel Execution

Staff Engineer organizes tasks into batches:
- **Sequential batches:** Tasks run one at a time (dependencies)
- **Parallel batches:** Tasks run simultaneously (different files)

3 developer agents work in parallel by default.

## Non-Goals

- No API/SDK integration (CLI subprocess only)
- No complex state persistence (in-memory + checkpoint only)
- No desktop GUI (TUI only)
- No rate limit handling (not needed)

## Success Metrics

1. User can see all agents simultaneously
2. Navigation feels instant and intuitive
3. Focus mode works like video call spotlight
4. Session starts in under 1 second
5. Code completion is faster than single-agent

---

**Version:** 3.0 (December 16, 2025)
**Previous Versions:**
- 2.0: Initial TypeScript/Bun rewrite
- 1.0: Python-based with Electrobun desktop (deprecated)
