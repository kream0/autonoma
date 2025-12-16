# Last Session Summary

## Session 7 - December 16, 2025

### Focus
XML Prompt Structuring & Project Documentation Detection

### Objective
Improve prompt quality by using XML tags for structure, and add support for common project documentation files.

---

## What Was Accomplished

### 1. XML Tags for All Prompts
- Refactored all `SYSTEM_PROMPTS` (CEO, Staff, Developer, QA) to use XML tags
- Updated all dynamic prompts to use structured XML format:
  - `<role>`, `<responsibilities>`, `<output_format>`, `<completion_signal>`
  - `<task>`, `<requirements>`, `<instructions>`, `<step>`
  - `<execution_context>`, `<constraint>`, `<mode>`

### 2. Context Section XML Format
- Updated `buildContextSection()` to output XML-structured content
- `<project_guidelines>` for CLAUDE.md content
- `<project_documentation>` for detected project docs

### 3. User Context Files XML Format
- Updated `loadContextFiles()` for adopt command to use XML format
- `<user_provided_context>` with `<files>` containing `<file name="...">` elements

### 4. Project Documentation Detection
- Added `PROJECT_DOC_FILES` constant for common docs:
  - PRD.md, TODO.md, LAST_SESSION.md, BACKLOG.md, COMPLETED_TASKS.md
- Added `loadProjectDocs()` method to detect and load these files
- Integrated into `start()`, `resume()`, and `adoptProject()` flows
- Info messages show which project docs were found

---

## Files Modified

| File | Changes |
|------|---------|
| `src/orchestrator.ts` | XML prompts, project doc detection, context section refactor |
| `TODO.md` | Updated with session 7 changes |
| `LAST_SESSION.md` | This file |

---

## XML Tag Structure Used

```xml
<!-- System Prompts -->
<role>Agent role name</role>
<responsibilities>List of responsibilities</responsibilities>
<output_format>Expected output format</output_format>
<completion_signal>How to signal completion</completion_signal>

<!-- Dynamic Prompts -->
<task>What to do</task>
<requirements>User requirements</requirements>
<instructions><step>Step 1</step><step>Step 2</step></instructions>
<execution_context><mode>PARALLEL|SEQUENTIAL</mode></execution_context>

<!-- Context -->
<project_guidelines><source>CLAUDE.md</source><content>...</content></project_guidelines>
<project_documentation><document name="PRD.md">...</document></project_documentation>
<user_provided_context><files><file name="...">...</file></files></user_provided_context>
```

---

## Detected Project Docs

When running, Autonoma now automatically detects and includes:
- PRD.md (Product Requirements Document)
- TODO.md (Current tasks)
- LAST_SESSION.md (Previous session summary)
- BACKLOG.md (Future tasks)
- COMPLETED_TASKS.md (Archived completed work)

This helps agents understand project context without manual specification.

---

## Testing Status

| Feature | Status |
|---------|--------|
| Type checking | Passing |
| XML prompt structure | Implemented |
| Project doc detection | Implemented |
| Context section XML | Implemented |

---

## Next Session Priorities

1. Add `--max-developers N` CLI flag
2. Implement retry for failed tasks
3. Better tile layout for 3+ developers
4. Graceful shutdown (SIGINT handling)

---

*Session 7 - XML Prompt Structuring & Project Doc Detection Complete*
