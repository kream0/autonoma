# Supervising Autonoma with Claude Code

This guide is for Claude Code instances acting as supervisors over Autonoma runs. It covers token-efficient monitoring, when to intervene, and best practices for autonomous supervision.

## Overview

When you launch Autonoma on a project, you can supervise it from your Claude Code session. The key challenge is **avoiding context overflow** while staying informed about progress.

**Golden Rule:** Check status periodically, not continuously. Autonoma is designed to run autonomously.

---

## Quick Reference

```bash
# Start Autonoma (in background or separate terminal)
autonoma start /path/to/project/requirements.md --stdout --max-developers 3

# Check status (low-token method)
cat /path/to/project/.autonoma/status.json

# Send guidance without stopping
autonoma guide /path/to/project "Focus on authentication first"
```

---

## Token-Efficient Monitoring

### DO: Read status.json Directly

The status file is small and structured. Read it directly instead of running commands:

```bash
cat /path/to/project/.autonoma/status.json
```

This returns ~200-400 bytes of JSON with everything you need:
- Current phase
- Agent states
- Task progress (completed/total)
- Last update timestamp

### DON'T: Stream or Tail Logs

Avoid these token-heavy operations:
```bash
# BAD - floods context with output
tail -f /path/to/project/.autonoma/logs/*.log

# BAD - captures too much
cat /path/to/project/.autonoma/logs/*.log
```

If you need log details, read only the last N lines of a specific log file.

### DON'T: Poll Too Frequently

Autonoma phases take time. Checking every 30 seconds wastes tokens.

**Recommended polling intervals:**
| Phase | Check Every |
|-------|-------------|
| PLANNING | 5 minutes |
| TASK-BREAKDOWN | 3 minutes |
| DEVELOPMENT | 5-10 minutes |
| TESTING | 5 minutes |
| REVIEW | 3 minutes |

---

## Monitoring Pattern

### 1. Launch and Note the Path

```bash
# Start Autonoma
autonoma start /path/to/project/requirements.md --stdout --max-developers 3 &

# Record the status file path for later
# /path/to/project/.autonoma/status.json
```

### 2. Periodic Status Checks

After launching, check status periodically:

```bash
cat /path/to/project/.autonoma/status.json
```

Parse the response mentally:
- `phase`: What stage is Autonoma in?
- `tasks.completed` / `tasks.total`: Progress percentage
- `agents`: Who is working?

### 3. Intervene Only When Needed

Send guidance if:
- Progress has stalled (same status for 15+ minutes)
- You notice Autonoma going in the wrong direction
- User provides new requirements or priorities

```bash
autonoma guide /path/to/project "Your guidance message here"
```

### 4. Summarize Before Moving On

When you check status, summarize it briefly in your response to the user. Don't paste the raw JSON—interpret it:

> "Autonoma is in DEVELOPMENT phase, 7/12 tasks complete. Two developers are active. Checking again in 10 minutes."

---

## Status File Schema

```json
{
  "phase": "DEVELOPMENT",
  "iteration": 1,
  "agents": {
    "ceo": "idle",
    "staff": "idle",
    "developers": ["running", "running", "idle"],
    "qa": "idle"
  },
  "tasks": {
    "total": 12,
    "completed": 7,
    "running": 2,
    "pending": 3
  },
  "updatedAt": "2025-12-29T10:30:00Z"
}
```

**Phase values:** `PLANNING`, `TASK-BREAKDOWN`, `DEVELOPMENT`, `TESTING`, `REVIEW`, `CEO-APPROVAL`, `COMPLETE`

**Agent states:** `idle`, `running`, `error`

---

## When to Send Guidance

Use `autonoma guide` sparingly. The CEO agent receives your message and factors it into decisions.

**Good reasons to send guidance:**
- Reprioritize features mid-run
- Clarify ambiguous requirements
- Respond to user feedback
- Redirect after observing wrong approach

**Bad reasons (let Autonoma work):**
- Just checking in
- Minor style preferences
- Impatience with progress

```bash
# Example: User wants to change priority
autonoma guide ./project "User says: Skip the admin panel for now, focus on the public API"

# Example: Observed issue
autonoma guide ./project "The auth module should use JWT, not sessions"
```

---

## Handling Completion

When `phase` is `COMPLETE`:

1. Read final status to confirm
2. Optionally review key output files
3. Report completion to user
4. Clean up any background processes

```bash
# Check completion
cat /path/to/project/.autonoma/status.json | grep '"phase"'

# If complete, summarize for user
# "Autonoma finished. 12/12 tasks complete. Project ready for review."
```

---

## Handling Errors

If an agent shows `error` state or progress stalls:

1. **Check status.json** for error indicators
2. **Read recent log tail** (last 50 lines only):
   ```bash
   tail -50 /path/to/project/.autonoma/logs/session-*.log
   ```
3. **Send guidance** if recoverable:
   ```bash
   autonoma guide ./project "Developer 2 failed on auth. Please reassign or retry."
   ```
4. **Report to user** if intervention needed

---

## Context Budget Guidelines

As a supervisor, allocate your context wisely:

| Activity | Token Cost | Frequency |
|----------|-----------|-----------|
| Read status.json | ~100-200 | Every 5-10 min |
| Send guidance | ~50-100 | As needed |
| Read log tail (50 lines) | ~500-1000 | On errors only |
| Full log read | ~5000+ | Never recommended |

**Target:** Keep Autonoma supervision under 2000 tokens per hour.

---

## Example Supervision Session

```
[You start Autonoma]
> autonoma start ./myproject/requirements.md --stdout &

[After 5 minutes, check status]
> cat ./myproject/.autonoma/status.json
# Phase: PLANNING, CEO running

[After 10 minutes]
> cat ./myproject/.autonoma/status.json
# Phase: TASK-BREAKDOWN, Staff running, 0/8 tasks

[After 20 minutes]
> cat ./myproject/.autonoma/status.json
# Phase: DEVELOPMENT, 3/8 tasks complete, 2 developers running

[User asks to prioritize API]
> autonoma guide ./myproject "Prioritize the REST API endpoints over the frontend"

[After 35 minutes]
> cat ./myproject/.autonoma/status.json
# Phase: TESTING, 8/8 tasks complete, QA running

[After 45 minutes]
> cat ./myproject/.autonoma/status.json
# Phase: COMPLETE

[Report to user]
"Autonoma finished building myproject in 45 minutes. All 8 tasks complete."
```

---

## Summary

1. **Read status.json** — not logs, not continuous output
2. **Poll every 5-10 minutes** — not every 30 seconds
3. **Summarize status** — don't paste raw JSON to users
4. **Guide sparingly** — only when direction change is needed
5. **Stay within token budget** — ~2000 tokens/hour for supervision

Autonoma is designed to work autonomously. Your job as supervisor is to monitor progress and intervene only when necessary.
