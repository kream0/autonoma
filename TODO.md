# TODO - Development Priorities

**Last Updated:** December 20, 2025
**Current Focus:** Autonoma CLI Development
**Project Status:** Feature Complete

---

## Autonoma CLI

**Status:** Feature Complete

### Recent Features
- Complexity-aware developer allocation
- Permission mode support for agent roles
- XML-structured prompts
- `--max-developers N` CLI flag
- Work-stealing task queue
- QA feedback loop with retries

### New Feature: --stdout mode
```bash
bun run dev start /path/to/requirements.md --stdout
```
Outputs plain text instead of TUI for monitoring.

---

## How To Run

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Build
bun run build

# Run production
bun run start
```

---

## Next Priorities

See BACKLOG.md for future enhancements.
