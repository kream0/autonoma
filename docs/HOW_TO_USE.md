# How to Use Autonoma

Autonoma orchestrates multiple Claude Code instances to develop projects faster than a single agent. It uses a hierarchical agent organization with a CEO, Staff Engineer, Developers, and QA.

## Installation

```bash
# Clone or download autonoma
git clone https://github.com/your-org/autonoma.git
cd autonoma

# Run the installer
chmod +x install.sh
./install.sh
```

**Requirements:**
- [Bun](https://bun.sh) runtime
- [Claude Code CLI](https://claude.ai/claude-code) installed and authenticated

## Quick Start

```bash
# Navigate to your project
cd my-project

# Create a requirements file
echo "# My Project\nBuild a REST API with user authentication" > requirements.md

# Start Autonoma
autonoma start requirements.md
```

## Commands

### `autonoma start <requirements.md>`

Begin new orchestration from a requirements file.

```bash
autonoma start requirements.md
autonoma start requirements.md --stdout
autonoma start requirements.md --indefinite --max-developers 3
```

### `autonoma resume <project-dir>`

Continue from a saved checkpoint. Useful after interruptions or when restarting.

```bash
autonoma resume ./my-project
autonoma resume ./my-project --stdout
```

### `autonoma adopt <requirements.md>`

Adopt an existing project. Autonoma will analyze what's already built and plan only the remaining work.

```bash
# Basic adoption
autonoma adopt requirements.md

# With context files (saves tokens on large codebases)
autonoma adopt requirements.md --context ARCHITECTURE.md,src/README.md
```

### `autonoma demo`

Run a demonstration with mock agents to see the TUI in action.

```bash
autonoma demo
```

### `autonoma status <project-dir>`

Check the status of a running Autonoma instance.

```bash
autonoma status ./my-project
```

### `autonoma guide <project-dir> "message"`

Send guidance to the CEO of a running instance.

```bash
autonoma guide ./my-project "Focus on authentication first"
```

## Command-Line Options

| Option | Description |
|--------|-------------|
| `--stdout` | Plain-text output mode (no TUI). Best for CI/CD, logging, or low-bandwidth terminals. Auto-saves session logs. |
| `--log` | Save session transcript to `.autonoma/logs/` (TUI mode only, stdout auto-logs) |
| `--indefinite` | Run continuously until project is 100% complete. Includes auto-respawn, context management, and E2E testing. |
| `--max-developers N` | Set maximum parallel developers (1-10, default: 6) |
| `--context file1,...` | (adopt only) Provide context files for faster analysis |

## Output Modes

### TUI Mode (Default)

Split-tile terminal interface showing all agents simultaneously.

```
+------------------+------------+-----+
|                  |            | Dev |
|      CEO         |   Staff    |     |
|     (40%)        |   (30%)    +-----+
|                  |            | QA  |
+------------------+------------+-----+
```

**Keyboard Shortcuts:**

| Key | Action |
|-----|--------|
| `↑↓←→` | Navigate between tiles |
| `Enter` | Focus (maximize) selected tile |
| `Escape` | Return to split view / Close overlay |
| `t` | Task list view |
| `s` | Stats view |
| `d` | Dashboard view |
| `p` | Pause (indefinite mode) - provide guidance |
| `q` | Quit |

### Stdout Mode (`--stdout`)

Clean, parseable text output. Best for:
- Remote sessions over SSH
- Logging and monitoring
- CI/CD pipelines
- Low-bandwidth connections

```bash
autonoma start requirements.md --stdout
```

Output format:
```
[00:00] [CEO/RUNNING] Status changed to running
[00:05] [CEO/OUT] Analyzing requirements...
[01:30] [PHASE/CHANGE] ═══════════════ TASK-BREAKDOWN ═══════════════
```

## Indefinite Mode

Run Autonoma until the project is complete:

```bash
autonoma start requirements.md --indefinite
```

**Features:**
- Agents are automatically replaced before hitting context limits
- Handoff blocks preserve knowledge between agent replacements
- Health monitoring detects and recovers from stuck agents
- E2E testing runs automatically for browser projects
- Press `p` to pause and provide guidance to the CEO

**Stdout with Indefinite:**
```bash
autonoma start requirements.md --indefinite --stdout

# Type guidance and press Enter to send to CEO
# Or just press Enter to skip
```

## Agent Hierarchy

| Level | Agent | Role |
|-------|-------|------|
| 1 | **CEO** | Analyzes requirements, creates high-level plan with milestones |
| 2 | **Staff Engineer** | Breaks milestones into technical tasks, organizes into batches |
| 3 | **Developers** (1-10) | Execute tasks in parallel, write code |
| 4 | **QA** | Runs tests, reviews code, reports issues |

## Workflow Phases

1. **PLANNING** - CEO analyzes requirements and existing code, creates milestones
2. **TASK-BREAKDOWN** - Staff Engineer creates batched tasks for developers
3. **DEVELOPMENT** - Developers work in parallel on assigned tasks
4. **TESTING** - QA runs automated tests
5. **REVIEW** - QA reviews implementation against requirements
6. **CEO-APPROVAL** - CEO evaluates if project is complete (indefinite mode loops back if not)

## Project Structure

Autonoma creates a `.autonoma/` directory in your project:

```
my-project/
├── .autonoma/
│   ├── state.json      # Current phase, tasks, progress
│   ├── autonoma.db     # SQLite database for persistence
│   └── logs/           # Session transcripts
├── requirements.md
└── ... your code ...
```

## Writing Good Requirements

A good `requirements.md` helps Autonoma understand your project:

```markdown
# Project Name

## Overview
Brief description of what you're building.

## Features
1. User authentication with email/password
2. Dashboard showing user stats
3. API endpoints for CRUD operations

## Technical Requirements
- Framework: Next.js
- Database: PostgreSQL
- Language: TypeScript

## Constraints
- Must be mobile-responsive
- API rate limiting required
- No external auth providers
```

**Tips:**
- Be specific about technologies and frameworks
- List features in priority order
- Include constraints and non-goals
- Reference existing code patterns if adopting

## Examples

### New Project
```bash
# Simple project
autonoma start requirements.md

# With 3 parallel developers
autonoma start requirements.md --max-developers 3

# Run until complete
autonoma start requirements.md --indefinite --stdout
```

### Existing Project
```bash
# Analyze and continue development
autonoma adopt requirements.md

# With architecture context
autonoma adopt requirements.md --context docs/ARCHITECTURE.md
```

### Long-Running Sessions
```bash
# Use tmux/screen for persistence
tmux new -s autonoma
autonoma start requirements.md --indefinite --stdout

# Detach with Ctrl+B, D
# Reattach with: tmux attach -t autonoma
```

## Control API

Monitor and control a running Autonoma instance from another terminal or automation tool.

### `autonoma status <project-dir>`

Check the current status of a running Autonoma instance:

```bash
autonoma status ./my-project
```

**Output:**
```
═══════════════════════════════════════
  AUTONOMA STATUS
═══════════════════════════════════════

Phase: DEVELOPMENT
Iteration: 2

Agents:
  CEO          idle
  Staff        idle
  Developer 1  running
  Developer 2  running
  QA           idle

Tasks: 5/12 completed
```

### `autonoma guide <project-dir> "message"`

Send guidance to the CEO agent:

```bash
autonoma guide ./my-project "Focus on the authentication module first"
autonoma guide ./my-project "Skip the dashboard for now, prioritize API endpoints"
```

The guidance is injected into the CEO's next decision cycle. Use this to:
- Reprioritize work mid-session
- Provide clarifications without stopping
- Steer the project direction remotely

### Automation Example

Control Autonoma from another Claude Code instance or script:

```bash
# Start Autonoma in the background
autonoma start requirements.md --indefinite --stdout &

# Monitor progress
watch -n 10 autonoma status ./my-project

# Send guidance based on conditions
if grep -q "error" ./my-project/.autonoma/logs/*.log; then
  autonoma guide ./my-project "There are errors in the logs, please investigate"
fi
```

### Status File Format

The status is written to `.autonoma/status.json`:

```json
{
  "phase": "DEVELOPMENT",
  "iteration": 2,
  "agents": {
    "ceo": "idle",
    "staff": "idle",
    "developers": ["running", "running", "idle"],
    "qa": "idle"
  },
  "tasks": {
    "total": 12,
    "completed": 5,
    "running": 2,
    "pending": 5
  },
  "updatedAt": "2025-12-29T10:30:00Z"
}
```

---

## Troubleshooting

### "claude command not found"

Install Claude Code CLI:
```bash
# Follow instructions at https://claude.ai/claude-code
```

### "autonoma command not found"

Add Bun's bin to your PATH:
```bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Agents getting stuck

In indefinite mode, stuck agents are automatically respawned. In normal mode:
1. Press `q` to quit
2. Resume with: `autonoma resume ./project-dir`

### High token usage

- Use `--max-developers 1` or `2` for smaller projects
- Provide `--context` files when adopting large codebases
- Use `--stdout` mode (slightly more token-efficient)

## Tips

1. **Start small** - Use `--max-developers 1` for your first project
2. **Use stdout for monitoring** - Easier to grep/search logs
3. **Provide context** - Good requirements = better results
4. **Use indefinite mode** - For hands-off operation
5. **Check task view** - Press `t` to see all tasks and progress

## Uninstalling

```bash
cd /path/to/autonoma
./install.sh uninstall
```
