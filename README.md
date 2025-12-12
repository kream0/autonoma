# Autonoma

**Autonomous Agentic Orchestration for Software Development**

Autonoma is a "software company in a box" that leverages multiple instances of Claude Code (the Anthropic CLI) to autonomously plan, implement, test, and deploy codebases from high-level requirements.

## Features

- **Hierarchical Agent System**: CEO (planning), Staff Engineer (architecture), Developers (implementation), QA (review)
- **Parallel Execution**: Multiple developer agents working on independent tasks simultaneously
- **Git Worktree Integration**: Isolated development environments for each task
- **Smart Retry Logic**: Automatic error recovery with escalation paths
- **Real-time TUI Dashboard**: Rich terminal interface showing progress, logs, and agent status
- **Desktop Application**: Cross-platform GUI via Electrobun (macOS, Windows, Linux)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CEO Agent                           │
│              (Planning & Decomposition)                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Staff Engineer Agent                      │
│            (Technical Architecture & Tasks)                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Developer 1 │   │ Developer 2 │   │ Developer N │
│  (Worker)   │   │  (Worker)   │   │  (Worker)   │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └────────────────┬┴─────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                       QA Agent                              │
│              (Review, Test & Merge)                         │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Python 3.12+
- Claude Code CLI (`claude`)
- Git
- Bun (for desktop build only)

### Install from source

```bash
# Clone the repository
git clone https://github.com/your-org/autonoma.git
cd autonoma

# Install dependencies
pip install -e .

# Or with development dependencies
pip install -e ".[dev]"
```

## Quick Start

### 1. Initialize a project

```bash
cd your-project
autonoma init
```

This creates the `.autonoma/` directory with:
- `CLAUDE.md` - Project standards for all agents
- `state.db` - SQLite database for tracking
- `logs/` - Agent session logs
- `worktrees/` - Git worktrees for parallel development

### 2. Create requirements

Create a `requirements.md` file describing what you want to build:

```markdown
# My API Project

## Overview
Build a REST API for a todo application.

## Features
- User authentication (JWT)
- CRUD operations for todos
- PostgreSQL database
- API documentation

## Tech Stack
- Node.js with Express
- TypeScript
- Jest for testing
```

### 3. Start Autonoma

```bash
# With TUI dashboard (default)
autonoma start requirements.md

# Without TUI
autonoma start requirements.md --no-tui

# With more parallel workers
autonoma start requirements.md --max-workers 8
```

## CLI Commands

```bash
# Initialize Autonoma in a project
autonoma init

# Start autonomous development
autonoma start <requirements.md> [--tui/--no-tui] [--max-workers N]

# Open monitoring dashboard
autonoma dashboard

# Check current status
autonoma status

# View logs
autonoma logs [--agent AGENT_ID] [--limit N]

# Clean up state and worktrees
autonoma clean

# Build desktop application
autonoma build-desktop [--platform darwin|win32|linux|all]
```

## Configuration

Autonoma can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTONOMA_CLAUDE_MODEL` | `claude-opus-4-5-20251101` | Model to use for all agents |
| `AUTONOMA_MAX_WORKERS` | `5` | Maximum parallel developer agents |
| `AUTONOMA_MAX_RETRIES` | `3` | Retry attempts before escalation |
| `AUTONOMA_TASK_TIMEOUT` | `600` | Task timeout in seconds |
| `AUTONOMA_DANGEROUSLY_SKIP_PERMISSIONS` | `false` | Skip Claude Code permissions |

## How It Works

1. **Planning Phase**: The CEO agent analyzes your requirements and creates a `plan.json` with milestones and task breakdowns.

2. **Decomposition Phase**: The Staff Engineer converts milestones into specific technical tasks, identifying dependencies and parallelizable work.

3. **Execution Phase**: Developer agents are spawned to work on tasks in parallel, each in their own git worktree.

4. **Review Phase**: The QA agent reviews completed work, runs tests, and merges approved changes.

5. **Iteration**: Failed tasks are retried with feedback. Blocked tasks are escalated for human review.

## Desktop Application

Build the desktop GUI:

```bash
# Build for all platforms
make desktop

# Or specific platform
make desktop-mac
make desktop-win
make desktop-linux
```

The desktop app provides:
- Visual dashboard for monitoring
- Native system tray integration
- File browser for requirements
- Real-time log streaming

## Development

```bash
# Install dev dependencies
make dev

# Run tests
make test

# Lint code
make lint

# Format code
make format
```

## Project Structure

```
autonoma/
├── autonoma/
│   ├── agents/          # Agent implementations
│   │   ├── base.py      # Base agent class
│   │   ├── ceo.py       # CEO (planning) agent
│   │   ├── developer.py # Developer (worker) agents
│   │   ├── qa.py        # QA (review) agent
│   │   └── staff_engineer.py
│   ├── core/            # Core functionality
│   │   ├── config.py    # Configuration
│   │   ├── orchestrator.py  # Main orchestration
│   │   ├── state.py     # SQLite state management
│   │   └── wrapper.py   # Claude Code PTY wrapper
│   ├── tui/             # Terminal UI
│   │   ├── app.py       # Textual application
│   │   └── dashboard.py # Dashboard widgets
│   ├── desktop/         # Desktop integration
│   │   └── server.py    # WebSocket server
│   └── cli.py           # CLI commands
├── desktop/             # Electrobun desktop app
│   ├── src/
│   ├── public/
│   └── package.json
├── tests/
├── pyproject.toml
└── README.md
```

## Safety & Guardrails

Autonoma incorporates several safety measures:

- **Sandboxed Execution**: Each agent runs in isolated environments
- **No Remote Push**: Agents cannot push to remote repositories
- **Rate Limiting**: Respects Claude API rate limits with exponential backoff
- **Human Escalation**: Blocked or failed tasks require human review
- **Audit Logging**: All agent actions are logged for review

## Troubleshooting

### Common Issues

**"Claude Code not found"**
- Ensure `claude` CLI is installed and in your PATH
- Run `claude --version` to verify

**"Rate limit exceeded"**
- Reduce `--max-workers` to decrease parallel requests
- Check your Claude API subscription limits

**"Task failed after retries"**
- Check logs with `autonoma logs --agent <agent-id>`
- Review the task in `plan.json` for clarity
- Manually complete the task or provide more context

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.
