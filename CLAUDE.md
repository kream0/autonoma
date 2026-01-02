# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## AGENT MANDATE & SESSION INITIALIZATION

**At the beginning of EVERY session, you MUST read the following files to establish full context:**

1. **`PRD.md`**: The Product Requirements Document - the "why" and "what" of the product.
2. **`LAST_SESSION.md`**: Summary of the previous work session for continuity.
3. **`TODO.md`**: Current task list and immediate priorities.
4. **`BACKLOG.md`**: Long-term tasks and future enhancements.

This step is non-negotiable for maintaining project continuity.

## SESSION END PROTOCOL

**CRITICAL: ALWAYS RESERVE 15K TOKENS FOR HANDOFF**

Monitor context usage throughout the session. When approaching 15k tokens remaining:
1. **STOP** - Do not start new tasks
2. **UPDATE** - Update all tracking files for the next agent
3. **HANDOFF** - Ensure continuity for the next session

**Context Management Rules:**
- Check `/context` regularly during long sessions
- If a task will exceed available context → stop BEFORE starting it
- Never let context run out mid-task
- 15k tokens minimum reserved for documentation updates

**Stopping is ONLY allowed when ALL THREE conditions are met:**

1. **Current task is FULLY COMPLETE** - 100% done and working
2. **The code doesn't break** - No errors, everything runs
3. **At least 15k tokens remaining** - Enough to update tracking files

**When stopping, update:**

1. **`LAST_SESSION.md`** - Session summary with:
   - Date and session focus
   - What was accomplished
   - Files modified
   - Next immediate action

2. **`TODO.md`** - Update with current progress

3. **`BACKLOG.md`** - Move completed items, add new discoveries

4. **`COMPLETED_TASKS.md`** - Archive significant accomplishments

---

## Project Overview

**Autonoma** is a CLI tool that orchestrates multiple Claude Code instances with a hierarchical agent organization, displayed in a split-tile terminal interface.

### Key Goal
> "Orchestrate multiple Claude Code instances with clear hierarchical organization, allowing faster development than a single agent."

### Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Language | TypeScript |
| TUI | blessed |
| Process | Bun.spawn() |

### Architecture

```
autonoma/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── session.ts        # Claude Code session wrapper
│   ├── orchestrator.ts   # Agent hierarchy management
│   └── tui/
│       ├── screen.ts     # Main blessed screen
│       ├── tiles.ts      # Split-tile layout
│       └── views/
│           ├── tasks.ts
│           ├── stats.ts
│           └── dashboard.ts
├── package.json
├── tsconfig.json
└── bunfig.toml
```

---

## Development Commands

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Build
bun run build

# Run production
bun run start

# Type check
bun run typecheck
```

---

## Agent Hierarchy

| Level | Agent | Tile Size | Role |
|-------|-------|-----------|------|
| 1 | CEO | 40% | Planning, high-level decisions |
| 2 | Staff Engineer | 30% | Technical decomposition |
| 3 | Developers | 15% each | Code execution |
| 4 | QA | 15% | Review, testing |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Arrow keys | Navigate between tiles |
| Enter | Focus (maximize) tile |
| Escape | Return to split view |
| t | Task list view |
| s | Stats view |
| d | Dashboard view |
| q | Quit |

---

## Code Quality Standards

### Mandatory
- **TypeScript strict mode** - No `any` types
- **Clear naming** - Self-documenting code
- **Simple and fast** - No over-engineering

### Prohibited
- Complex abstractions without need
- SDK/API dependencies (use CLI only)
- State persistence (keep in-memory)
- Half-implemented features

---

## Git Workflow

### Commit Guidelines
- Use conventional commits: `feat:`, `fix:`, `refactor:`
- Keep commits atomic and focused

### DEPLOYMENT RESTRICTION
- **NEVER** push to remote automatically
- **ALWAYS** stop after commits for user review

---

## Design Principles

1. **Simple** - Direct subprocess management
2. **Fast** - Instant startup, responsive UI
3. **Visual** - All agents visible simultaneously
4. **Intuitive** - Video call-like navigation

---

## What NOT to Do

- ❌ Add anthropic SDK
- ❌ Add complex state management
- ❌ Add token/cost tracking
- ❌ Add rate limit handling
- ❌ Create desktop GUI
- ❌ Over-engineer anything

---

---

## Memory Protocol

**Save memories proactively** as you work. Don't wait for session end.

### When to Save

- **Architectural decision**: Why you chose X over Y
- **Gotcha or caveat**: Non-obvious behavior, edge cases
- **Pattern discovered**: Reusable approach that worked well
- **Error with non-obvious fix**: Save the solution
- **Codebase insight**: Structure, conventions, relationships

### How to Save

```bash
memorai save [category] "[Title]" --content "[specific insight]" --importance [1-10]
```

### Categories

- `architecture` - Design patterns, system structure
- `decisions` - Technical choices with rationale
- `notes` - Gotchas, tips, observations
- `structure` - File organization, naming conventions

### What NOT to Save

- Session summaries (use tracking files instead)
- Obvious facts anyone could figure out
- Temporary state or WIP notes

---

**Version:** 2.2 (December 31, 2025)
