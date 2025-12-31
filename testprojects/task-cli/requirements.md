# Task Manager CLI - Requirements

## Overview
Build a command-line task manager application using TypeScript and Bun that allows users to create, manage, and track tasks with persistence.

## Tech Stack
- **Runtime:** Bun
- **Language:** TypeScript (strict mode)
- **Persistence:** JSON file storage
- **CLI Parsing:** Commander.js

## Core Features

### 1. Task Management Commands
```bash
# Add a new task
task add "Buy groceries" --priority high --tags shopping,errands --due 2025-12-25

# List all tasks
task list

# List with filters
task list --status pending --priority high --tag shopping

# Mark task as complete
task complete <id>

# Delete a task
task delete <id>

# Update a task
task update <id> --title "New title" --priority low
```

### 2. Task Data Model
Each task should have:
- `id`: Unique identifier (UUID)
- `title`: Task description (required)
- `status`: pending | in_progress | completed
- `priority`: low | medium | high
- `tags`: Array of strings
- `createdAt`: ISO timestamp
- `updatedAt`: ISO timestamp
- `dueDate`: Optional ISO date
- `completedAt`: Optional ISO timestamp

### 3. Storage
- Store tasks in `~/.task-cli/tasks.json`
- Auto-create directory and file if not exists
- Pretty-print JSON for human readability

### 4. Display Features
- Colorized output (green=complete, yellow=in_progress, red=high priority)
- Table format for list view
- Task count summary after list command
- Human-readable dates ("2 days ago", "in 3 days")

### 5. Additional Commands
```bash
# Show task details
task show <id>

# Search tasks by keyword
task search "grocery"

# Show statistics
task stats
# Output: Total: 15, Pending: 8, In Progress: 2, Completed: 5

# Clear completed tasks
task clear --completed

# Export to markdown
task export > tasks.md
```

## Quality Requirements

### Testing
- Unit tests for core task operations (add, complete, delete)
- Test file I/O operations
- Use Bun's built-in test runner

### Error Handling
- Graceful error messages for invalid commands
- Validation for required fields
- Handle missing task IDs gracefully

### Code Organization
```
task-cli/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── commands/
│   │   ├── add.ts
│   │   ├── list.ts
│   │   ├── complete.ts
│   │   ├── delete.ts
│   │   ├── update.ts
│   │   ├── show.ts
│   │   ├── search.ts
│   │   ├── stats.ts
│   │   └── export.ts
│   ├── models/
│   │   └── task.ts       # Task type definitions
│   ├── storage/
│   │   └── file.ts       # JSON file operations
│   └── utils/
│       ├── colors.ts     # Terminal colors
│       ├── dates.ts      # Date formatting
│       └── table.ts      # Table formatting
├── tests/
│   ├── task.test.ts
│   └── storage.test.ts
├── package.json
└── tsconfig.json
```

## Success Criteria
1. All commands work as documented
2. Data persists between CLI invocations
3. Tests pass with `bun test`
4. TypeScript compiles with no errors
5. User-friendly colored output
