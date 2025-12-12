# Autonoma Project Prompt for Claude Opus 4.5

**Instructions for Claude Opus 4.5:**  
You are tasked with building **Autonoma**, an autonomous agentic orchestration tool for software development. This is a "software company in a box" that leverages multiple instances of Claude Code (the Anthropic CLI) to autonomously plan, implement, test, and deploy codebases from high-level requirements.  

Use your maximum reasoning capabilities: Employ chain-of-thought (CoT) for every major decision, XML-structured prompts for subagents, and tool use (e.g., Bash for Git, Edit for code changes) throughout. Since we have a generous, nearly unlimited subscription, default to Claude Opus 4.5 for all agents (CEO, Staff Engineer, Developers, QA) to maximize intelligence and reduce errors—no cost constraints.  

**Core Constraints and Enhancements:**  
- **CLI Focus:** Build the core as a command-line tool with a rich TUI (Terminal User Interface) using a Python library like Rich or Textual for real-time dashboards (e.g., progress bars, agent status, logs).  
- **Desktop Extension:** Include a build target for a cross-platform desktop app using Electrobun (https://blackboard.sh/electrobun/docs/). Electrobun enables tiny (14MB), fast (<50ms startup) apps with Bun runtime, native WebView rendering, and TypeScript support. The desktop version wraps the TUI in a WebView (e.g., via React/Vue for dashboard) for a native-feel GUI, supporting macOS, Windows, Linux. Provide a `make desktop` command to bundle via `bunx electrobun init` and Electrobun APIs (e.g., BrowserWindow for the UI, events for agent monitoring).  
- **Autonomy First:** Fully hands-off execution; escalate to user only on critical blocks.  
- **Tech Stack:** Python 3.12+ (AsyncIO) for core orchestration; integrate `anthropic` SDK and `pexpect` for PTY-wrapped Claude Code sessions. For desktop, add Bun/TypeScript layer via Electrobun.  
- **Testing:** As you build, use your tools to self-test: Run code snippets, simulate sessions, and validate Git flows. Output progress in structured Markdown sections (e.g., <think>Reasoning</think>, <code>File contents</code>).  
- **Output Format:** Generate the full codebase incrementally: Start with directory structure and core files, then TUI, then Electrobun integration. End with setup scripts (e.g., `autonoma init`, `autonoma start`). Commit semantically to a demo repo if possible.  

Below is the complete Product Requirements Document (PRD) and Technical Specification. Build directly from this—refine only if a contradiction arises (explain why in CoT). Aim for production-ready code with docs and examples.

---

# Project: "Autonoma" – The Autonomous Agentic Orchestra

**Product Requirement Document (PRD) & Technical Specification**

## 1. Executive Summary

**Autonoma** is a local orchestration wrapper designed to manage multiple instances of Anthropic's `claude-code` CLI (Claude Code) for agentic coding tasks. It operates as an autonomous "software company in a box," leveraging Claude's built-in agentic capabilities to enable fully hands-off execution.

Drawing from Anthropic's best practices for Claude Code, Autonoma emphasizes iterative planning, tool use (e.g., Bash for git operations, Read/Grep for codebase navigation), and subagents for specialized roles. Unlike tools like Conductor that require human oversight for parallel streams, Autonoma enables **fully autonomous execution** by chaining Claude Code sessions via structured prompts, MCP (Model Context Protocol) for external tools, and safeguards for safety and efficiency.

Input: A high-level requirements document (e.g., PRD or spec).  
Output: A finalized, tested, and atomically committed codebase on the `main` branch, with all changes validated through Claude's integrated testing and review workflows.

Key enhancements:  
- **Model Selection:** Use Claude Opus 4.5 for *all* agents (CEO, Staff Engineer, Developers, QA) to leverage maximum intelligence for planning, decomposition, execution, and review. With unlimited subscription, prioritize depth over speed—fewer retries, richer reasoning via extended CoT.  
- **UI Layers:** Core TUI for CLI mode (real-time dashboard in terminal). Desktop mode via Electrobun for a lightweight, cross-platform GUI wrapper (WebView-based, <50ms startup, 14MB bundle).  
- **Incorporate XML tags** for structured prompting, chain-of-thought (CoT) for error handling, and role-based system prompts to minimize hallucinations.

## 2. System Architecture: The "Org Chart"

Autonoma models a hierarchical corporate structure, with each role implemented as a Claude Code session configured via CLI flags (e.g., `--model claude-opus-4-5-20251124`, `--system-prompt`). Sessions are spawned asynchronously, using PTY wrappers for input/output control. Parallelism is achieved through dedicated worktrees, with MCP enabling cross-session communication (e.g., sharing plans via temporary files).

### Level 1: Governance (The Brain)

* **CEO Agent (Opus 4.5):**
  * **Responsibility:** Ingests the user's initial spec/PRD using Claude's vision capabilities if images/charts are included.
  * **Action:** Uses extended thinking mode to break the project into high-level phases (e.g., "Scaffolding," "Core Logic," "UI," "Testing"). Employs CoT prompting: `<think>Analyze dependencies and risks</think>`.
  * **Output:** A `plan.json` with ordered milestones, including estimated token budgets per phase. Saves context to `CLAUDE.md` for downstream agents.

### Level 2: Management (The Architects)

* **Staff Engineer Agent (Opus 4.5):**
  * **Responsibility:** Receives a milestone; uses `/project:analyze` command to scan codebase.
  * **Action:** Converts features into technical steps with dependency graphs. Creates git branches via Bash tool (e.g., `git worktree add`). Outputs isolated tasks in JSON, flagging parallelizable ones.
  * **Best Practice Integration:** Prompts include examples of task decomposition to reduce refusals; uses tool use for `gh` CLI if GitHub integration is enabled. Opus ensures superior handling of complex architectures (e.g., 80.9% SWE-bench Verified).

### Level 3: Execution (The Workers)

* **Developer Agents (Parallel Workers – Opus 4.5):**
  * **Responsibility:** Stateless Claude Code instances for task execution.
  * **Action:** Checkout worktree, use `/edit` for code changes, `/test` for running suites, and Bash for commits. Signal completion with `[TASK_COMPLETE]` token.
  * **Constraint:** Spawned per-task; terminated post-merge. Limit to 5-10 concurrent to respect rate limits (exponential backoff via SDK).

### Level 4: Quality Assurance (The Gatekeeper)

* **QA/Review Agent (Opus 4.5 with Subagent Config):**
  * **Responsibility:** Configured as a "code reviewer" subagent with prompt: "You are a senior code reviewer. Focus on quality, security, best practices."
  * **Action:** Runs tests via Bash; if pass, merges via `git merge --squash`. If fail, iterates with feedback loop (up to 3 retries). Uses citations for verifiable changes.
  * **Enhancement:** Integrates debugger subagent for failures: "Analyze errors, identify root causes, provide fixes."

| Level | Agent | Model | Key Tools | Prompt Style |
|-------|--------|--------|-----------|--------------|
| 1     | CEO   | Opus 4.5 | Web Search, Read | CoT + XML Tags |
| 2     | Staff Eng | Opus 4.5 | Grep, Glob | Multishot Examples |
| 3     | Developer | Opus 4.5 | Edit, Bash, Test | Role-Based System |
| 4     | QA    | Opus 4.5 | Bash, Debugger Subagent | Structured Outputs |

## 3. Functional Requirements

### 3.1. Autonomous Execution & Resilience (Critical)

* **Watchdog Process:** AsyncIO supervisor loop monitors sessions via stdout parsing for stop reasons (e.g., "end_turn", "pause_turn"). Uses SDK for rate limit detection.
* **Retry Strategy:**
  * **Level 1 (Soft Fail):** Hallucination/non-executable code → Feed error back with CoT: `<think>Why did this fail? Revise step-by-step</think>`. Max: 3 retries.
  * **Level 2 (Hard Fail):** Hang/timeout → Send Ctrl+C interrupt; clean worktree, respawn with `--append-system-prompt` for continuity.
  * **Level 3 (Escalation):** 3x failure → Escalate to Staff Engineer with full context (via MCP); flag "Blocked" in state DB. Last resort: Pause and notify user via TUI.
* **Rate Limit Handling:** Parse for warnings; implement SDK-level backoff (e.g., 2^x seconds). No strict budget enforcement given unlimited access.

### 3.2. Git Hygiene & Parallelism

* **Git Worktrees:** Dedicated per task (e.g., `.autonoma/worktrees/task-001`). Use Claude's Bash tool for all ops: `git worktree add`, `git add -A`.
* **Atomic Commits:** Enforce semantic messages via prompt: "Squash into single commit: `feat: implement user login`". No WIP; validate with `/commit` command.

### 3.3. Safety & Ethical Guardrails

* Align with Anthropic's ASL-2: Prompt all agents to refuse harmful requests (e.g., insecure code). Use `--dangerously-skip-permissions` only in trusted envs.
* Sandboxing: Run sessions in isolated dirs; leverage Claude Code's Bubblewrap (Linux) or seatbelt (macOS) for file/network isolation.

### 3.4. User Interface Requirements

* **TUI (CLI Mode):** Real-time dashboard using Rich/Textual: Show agent status, progress bars, live logs, token usage. Commands: `autonoma start`, `autonoma dashboard`.
* **Desktop Mode:** Electrobun-powered GUI: Embed TUI output in WebView (e.g., React dashboard for visualizations). Features: Native menus (via Electrobun's ContextMenu), tray icon for background runs, auto-updates (14KB diffs). Build command: `autonoma build-desktop` invokes Electrobun bundler for macOS/Windows/Linux artifacts.

## 4. Technical Implementation Specifications

**Target Stack:** Python 3.12+ (AsyncIO) for core; `anthropic` SDK, `pexpect` for PTY. For desktop: TypeScript/Bun via Electrobun (native bindings in C++/Zig, WebView renderer).  
**Core Dependencies:** `@anthropic-ai/claude-code` (CLI), `anthropic` (SDK), `mcp-client` for protocol, `rich`/`textual` for TUI, `electrobun` for desktop.

### 4.1. The Wrapper (Interfacing with Claude Code)

Claude Code is an interactive agentic CLI; wrap via PTY for automation:  
* **Input:** Inject via stdin with XML-structured prompts (e.g., `<task>{description}</task>`).  
* **Output:** Stream stdout to logs; parse for tool calls (e.g., Bash executions).  
* **Interrupts:** Ctrl+C for loops; use `/rewind` for session reset.  
* **Model Selection:** `--model claude-opus-4-5-20251124` for all.

### 4.2. State Management

SQLite `state.db` tracks:  
| Field | Type | Description |  
|-------|------|-------------|  
| task_id | INT | Unique task identifier |  
| agent_id | STR | e.g., "worker-001" |  
| status | ENUM | PENDING, IN_PROGRESS, REVIEW, MERGED, FAILED |  
| branch_name | STR | Git branch/worktree |  
| retry_count | INT | Up to 3 |  
| token_usage | INT | Cumulative per task |  

Use JSON for plans; MCP for inter-agent handoffs.

### 4.3. Directory Structure

```
/my-project
  /.autonoma
     /logs/          # Session transcripts (with timestamps)
     /worktrees/     # Isolated git worktrees
     /mcp/           # Temp files for protocol sharing
     state.db        # Task tracking
     CLAUDE.md       # Global project context (auto-generated by /init)
     /desktop/       # Electrobun sources (TypeScript, config)
  /src              # User codebase
```

### 4.4. Subagent Configuration

JSON config for specialized roles (via `--subagents` flag):  
```json
{
  "reviewer": {
    "description": "Code quality enforcer",
    "prompt": "You are a senior reviewer. Check security, best practices. Use citations.",
    "tools": ["Read", "Grep", "Bash"],
    "model": "opus-4-5"
  },
  "debugger": {
    "description": "Error fixer",
    "prompt": "Analyze stack traces, suggest patches.",
    "tools": ["Bash", "Edit"]
  }
}
```

## 5. User Interaction Flow (The "Happy Path")

1. **Init:** `autonoma init` → Runs `claude-code /init` to generate `CLAUDE.md` with project standards (e.g., "Use TypeScript, Jest tests").
2. **Input:** Drop `requirements.md` (supports vision for diagrams).
3. **Launch:** `autonoma start --desktop` → CEO plans; spawns hierarchy. TUI/Desktop dashboard shows real-time progress.
4. **Observation:** TUI/Desktop:  
   - *CEO (Opus):* "Planning phases... [Token: 2k]"  
   - *Staff Eng:* "5 tasks queued."  
   - *Worker 1:* "Auth impl (Retry 1/3) – Editing files..."  
   - Progress bars; real-time via stdout tailing. Desktop adds native tray notifications.
5. **Completion:** All merged → Clean `main`; summary report with citations. Desktop: Export as installable bundle.

Edge: If blocked, TUI/Desktop prompts: "Escalation: Review plan.json?"

## 6. Prompting Strategy for Sub-Agents

Leverage Anthropic's guide: Clear roles, XML for structure, CoT for reasoning, examples for consistency. All with Opus 4.5 for depth.

**System Prompt for Worker Agents (Appended to Default):**

```
<role>You are a Developer Agent in a Git Worktree. Complete TASK_ID: {task_description} autonomously.</role>
<guidelines>
- Use <think> for step-by-step planning.
- Tools: Edit files, run `bash: npm test`, commit semantically.
- Write Jest tests; run and verify.
- If error: <debug>Analyze and fix</debug>.
- Output [TASK_COMPLETE] only on success. No pushes.
</guidelines>
<examples>
Input: Implement login. Output: Edits auth.ts, adds test, commits "feat: user auth".
</examples>
```

**System Prompt for Staff Engineer:**

```
<role>You are the Technical Architect. Decompose CEO plan into parallel tasks.</role>
<guidelines>
- Identify dependencies; use JSON: [{"id":1, "desc":"DB schema", "parallel":true}].
- Create branches via bash: git worktree add.
- Avoid circular deps; estimate tokens.
</guidelines>
<examples>Plan: Full app → Tasks: Schema, API, UI (parallel after schema).
</examples>
```

**Global CLAUDE.md Snippet (Auto-Generated):**

```
# Project Standards
- Stack: Next.js, TypeScript, PostgreSQL.
- Tests: Jest, 80% coverage.
- Commits: Conventional (feat:, fix:).
- Security: No hard-coded secrets; use env vars.
```

**Electrobun Integration Prompt Snippet (For Desktop Build):**

```
<role>Integrate TUI into Electrobun desktop app.</role>
<guidelines>
- Use Bun runtime for backend; WebView for rendering TUI output.
- APIs: BrowserWindow for dashboard, ContextMenu for actions, Events for agent updates.
- Bundle: 14MB target; support auto-updates.
</guidelines>
```

---

**Start Building:** Begin with <think>Overall architecture validation</think>, then generate `setup.py` or `package.json` for dependencies. Output full files in code blocks. Use your tools to test Git flows and TUI prototypes. Goal: A runnable prototype by end.

