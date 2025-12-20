# TODO - Development Priorities

**Last Updated:** December 20, 2025 (Session 26)
**Current Focus:** Session Logging Verified
**Project Status:** Core Features Complete + Logging Verified

---

## Recently Completed (Session 26)

### Session Logging Bug Fix ✅
- [x] Fixed race condition in `flushLog()` causing duplicate log lines
- [x] Buffer now cleared synchronously before async file write
- [x] Fixed in both `StdoutApp` and `App` classes

### Session Logging Verification ✅
- [x] Tested stdout mode with `--indefinite`
- [x] Verified log file created at `.autonoma/logs/session-{timestamp}.log`
- [x] Verified log format: `[MM:SS] [AGENT/STATUS] message`
- [x] Tested user guidance via stdin mid-execution
- [x] Verified guidance captured in logs: `[USER/GUIDANCE]`
- [x] Verified no duplicate lines after fix

---

## Previously Completed (Sessions 24-25)

### User Guidance System ✅
- [x] Textbox overlay when pressing `p` in TUI mode
- [x] Stdin support for stdout mode
- [x] Full replan flow with `orchestrator.replanWithGuidance()`

### Indefinite Mode ✅
- [x] End-to-end cycle verified
- [x] Loop exits correctly on CEO approval

---

## Next Up: Extended Testing

### TUI Mode Testing (Priority 1)
- [ ] Run indefinite mode in TUI (not --stdout)
- [ ] Verify TUI shows "[INDEFINITE]" in status bar
- [ ] Press `p` to pause - verify textbox overlay appears
- [ ] Type guidance and press Enter - verify CEO processes it
- [ ] Test `--log` flag in TUI mode

### Medium Project Testing (Priority 2)
- [ ] Test indefinite mode on a medium complexity project
- [ ] Verify handoff blocks parse correctly
- [ ] Test agent respawn after simulated crash
- [ ] Test context threshold warnings appear

---

## How To Run

```bash
# Standard run
bun run dev start /path/to/requirements.md

# Indefinite mode with stdout logging
bun run dev start /path/to/requirements.md --indefinite --stdout

# TUI with logging
bun run dev start /path/to/requirements.md --log
```

---

## Architecture Overview

```
Session Logging Flow:
┌─────────────────────────────────────────────────────────┐
│                    StdoutApp / App                      │
│  log(agent, status, message) {                          │
│    logBuffer.push(formatted_line)                       │
│    if (logBuffer.length >= 20) flushLog()               │
│  }                                                      │
│                                                         │
│  flushLog() {                                           │
│    const toWrite = logBuffer  // Capture               │
│    logBuffer = []              // Clear sync           │
│    await appendFile(toWrite)   // Write async          │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Next Priorities

See BACKLOG.md for future enhancements.
