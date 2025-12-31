# Autonoma: Memorai Integration & Supervisor Features

## Context

We've separated memorai into a focused long-term memory NPM package. Phases 1-2 are complete:

- **Phase 1 (DONE):** Created memorai as TypeScript NPM package with:
  - `MemoraiClient` class with full API
  - SQLite + FTS5 with BM25 ranking
  - CLI commands (init, save, find, list, show, delete, bootstrap, status)
  - 25/25 tests passing
  - Uses `bun:sqlite` (Bun-only)

- **Phase 2 (DONE):** Deleted all Python supervisor code from memorai repo

Now we need to integrate the "good parts" of memorai's supervisor into autonoma.

---

## Phase 3: Add Supervisor Features to Autonoma

### 3.1 Create `src/verification/` - Objective Verification

**Goal:** Never trust "I'm done" - verify with objective checks.

Port the verification logic from the old `verify.py`:

```typescript
// src/verification/types.ts
interface VerificationResult {
  type: 'tests_pass' | 'build_succeeds' | 'lint_clean' | 'types_check';
  passed: boolean;
  message: string;
  command: string;
  exitCode: number;
  duration: number;
  output?: string;
}

interface VerificationCriteria {
  type: VerificationResult['type'];
  command: string;
  required: boolean;
}

// src/verification/detector.ts
// Auto-detect project type and available commands
interface ProjectCommands {
  test?: string[];     // ["npm test", "bun test", "pytest"]
  build?: string[];    // ["npm run build", "bun run build"]
  lint?: string[];     // ["eslint .", "biome check"]
  typeCheck?: string[];// ["tsc --noEmit", "npx tsc --noEmit"]
}

function detectProjectType(projectDir: string): 'node' | 'python' | 'go' | 'rust' | 'unknown';
function detectProjectCommands(projectDir: string): ProjectCommands;

// src/verification/index.ts
async function verifyTask(
  task: DevTask,
  criteria: VerificationCriteria[]
): Promise<VerificationResult[]>;

async function runVerification(
  command: string,
  cwd: string
): Promise<VerificationResult>;
```

**Implementation notes:**
- Check for package.json, requirements.txt, go.mod, Cargo.toml
- Parse scripts from package.json
- Run commands with timeout (2 minutes default)
- Capture stdout/stderr for error context

### 3.2 Create `src/human-queue/` - Blocker Handling

**Goal:** When agent is blocked, queue for human resolution.

```typescript
// src/human-queue/types.ts
interface HumanQueueMessage {
  id: string;
  type: 'question' | 'approval' | 'blocker';
  taskId?: string;
  agentId: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  blocking: boolean;
  response?: string;
  status: 'pending' | 'responded' | 'expired';
  createdAt: string;
  respondedAt?: string;
}

// src/human-queue/index.ts
class HumanQueue {
  constructor(dbPath: string);

  // Queue a blocker
  queueBlocker(taskId: string, agentId: string, reason: string): string;

  // Queue a question
  queueQuestion(taskId: string, agentId: string, question: string): string;

  // Get pending messages
  getPending(): HumanQueueMessage[];

  // Respond to a message
  respond(id: string, response: string): void;

  // Check for resolution
  getResolution(taskId: string): string | null;

  // Expire old messages (>24h)
  expireOld(): number;
}

// src/human-queue/store.ts
// SQLite storage in .autonoma/db.sqlite (add human_queue table)
```

**Add CLI command:**
```bash
# Add to src/index.ts
autonoma respond <id> "resolution message"
autonoma queue              # List pending messages
autonoma queue --pending    # Only pending
```

**Add TUI view:**
```typescript
// src/tui/views/notifications.ts
// Show pending human queue messages in TUI
// Allow responding directly from TUI
```

### 3.3 Create `src/retry/` - Error Context Injection

**Goal:** When task fails, inject error context into retry.

```typescript
// src/retry/index.ts
interface RetryContext {
  previousAttempts: number;
  lastError: string;
  verificationFailures: VerificationResult[];
  humanResolution?: string;
}

function buildRetryPrompt(task: DevTask, context: RetryContext): string {
  return `
## RETRY CONTEXT (Attempt ${context.previousAttempts + 1})

Previous error: ${context.lastError}

${context.verificationFailures.length > 0 ? `
Verification failures:
${context.verificationFailures.map(f => `- [${f.type}] ${f.message}`).join('\n')}
` : ''}

${context.humanResolution ? `
Human guidance: ${context.humanResolution}
` : ''}

Please fix these issues and complete the task.
`;
}

function getRetryContext(taskId: string): RetryContext | null;
function saveRetryContext(taskId: string, context: RetryContext): void;
```

### 3.4 Update `src/context-monitor.ts` - Add 40% Objective Reminder

**Goal:** Start managing context earlier to prevent drift.

Current thresholds: 50/60/70/80%

Add new 40% threshold:
```typescript
// At 40%, inject objective reminder into developer prompts
if (contextPercent >= 40 && contextPercent < 50) {
  // Add to next developer prompt:
  const reminder = `
REMINDER: You are ${contextPercent}% through available context.
Current objective: ${currentTask.description}
Completion criteria: ${currentTask.completionCriteria}
Stay focused on the task at hand.
`;
}
```

### 3.5 Update `src/queue.ts` - Add Priority Rebalancing

**Goal:** Periodically boost priority of stuck/old tasks.

```typescript
function rebalancePriorities(): void {
  const pending = getPendingTasks();

  for (const task of pending) {
    let boost = 0;

    // Boost retryable failed tasks
    if (task.status === 'failed' && task.retryCount < task.maxRetries) {
      boost += 2;
    }

    // Boost old pending tasks (>1 hour)
    const age = Date.now() - new Date(task.createdAt).getTime();
    if (age > 3600000) {
      boost += 1;
    }

    // Boost unblocked tasks (human resolved)
    if (task.wasBlocked && task.humanResolution) {
      boost += 3;
    }

    if (boost > 0) {
      task.priority = Math.min(10, task.priority + boost);
      updateTaskPriority(task.id, task.priority);
    }
  }
}

// Call after every N tasks completed
```

---

## Phase 4: Memorai Integration in Autonoma

### 4.1 Add Memorai as Dependency

```bash
# In autonoma directory
bun add memorai
# Or for local development:
bun add ../memorai
```

Update `package.json`:
```json
{
  "dependencies": {
    "memorai": "^1.0.0"
  }
}
```

### 4.2 Initialize Memorai on `autonoma start`

```typescript
// src/orchestrator.ts or src/index.ts
import { MemoraiClient } from 'memorai';

async function start(prdPath: string) {
  const memorai = new MemoraiClient(process.cwd());

  // Check if initialized
  const isInit = await memorai.isInitialized();
  if (!isInit) {
    await memorai.init();
    log('[MEMORAI] Initialized memory database');
  }

  // Store memorai client for use in phases
  state.memorai = memorai;
}
```

### 4.3 Search Memories Before Phase Execution

```typescript
// src/phases/development.ts (or wherever phases start)
async function startDevelopmentPhase(task: DevTask) {
  // Search for relevant memories
  const memories = await state.memorai.search(task.description, {
    limit: 5,
    category: 'architecture'
  });

  // Also search decisions
  const decisions = await state.memorai.search(task.description, {
    limit: 3,
    category: 'decisions'
  });

  // Inject into developer prompt
  const memoryContext = [...memories, ...decisions]
    .map(m => `[${m.category}] ${m.title}: ${m.summary}`)
    .join('\n');

  const enhancedPrompt = `
## Relevant Project Memory

${memoryContext || 'No relevant memories found.'}

## Task
${task.description}
`;
}
```

### 4.4 Store Learnings After Task Completion

```typescript
// src/phases/development.ts
async function onTaskComplete(task: DevTask, result: TaskResult) {
  // Extract learnings from result
  if (result.learnings && result.learnings.length > 0) {
    for (const learning of result.learnings) {
      await state.memorai.store({
        category: learning.category || 'notes',
        title: learning.title || `Task: ${task.title}`,
        content: learning.content,
        tags: [task.id, result.agentId],
        importance: learning.importance || 5
      });
    }
  }
}
```

### 4.5 Store Handoffs as Memories

```typescript
// src/orchestrator.ts
async function handleAgentReplacement(oldAgent: Agent, newAgent: Agent) {
  const handoff = parseHandoff(oldAgent.lastOutput);

  // Store handoff as memory
  await state.memorai.store({
    category: 'summaries',
    title: `Handoff: ${oldAgent.role} → ${newAgent.role}`,
    content: JSON.stringify({
      completedWork: handoff.completedWork,
      currentState: handoff.currentState,
      nextSteps: handoff.nextSteps,
      blockers: handoff.blockers
    }, null, 2),
    tags: ['handoff', oldAgent.id, newAgent.id],
    importance: 6
  });
}
```

### 4.6 CEO Planning Uses Architecture Decisions

```typescript
// src/phases/planning.ts
async function buildCeoPrompt(prd: ParsedPRD) {
  // Search architecture memories
  const architecture = await state.memorai.search('', {
    category: 'architecture',
    limit: 10
  });

  // Search past decisions
  const decisions = await state.memorai.search('', {
    category: 'decisions',
    limit: 10
  });

  const memorySection = `
## Project Memory

### Architecture
${architecture.map(m => `- ${m.title}: ${m.summary}`).join('\n') || 'None recorded.'}

### Past Decisions
${decisions.map(m => `- ${m.title}: ${m.summary}`).join('\n') || 'None recorded.'}
`;

  return `${memorySection}\n\n${buildBaseCeoPrompt(prd)}`;
}
```

### 4.7 Migration for Existing Projects (Optional)

If autonoma has existing memories in `.autonoma/db.sqlite`:

```typescript
// src/migration/memorai-migrate.ts
async function migrateToMemorai() {
  const oldDb = new Database('.autonoma/db.sqlite');
  const memorai = new MemoraiClient(process.cwd());
  await memorai.init();

  // Get old memories
  const oldMemories = oldDb.prepare('SELECT * FROM memories').all();

  for (const old of oldMemories) {
    await memorai.store({
      category: old.category,
      title: old.title,
      content: old.content,
      tags: JSON.parse(old.tags || '[]'),
      importance: old.importance || 5
    });
  }

  log(`Migrated ${oldMemories.length} memories to memorai`);
}
```

---

## Files to Create

```
src/
├── verification/
│   ├── index.ts          # Main verifier
│   ├── detector.ts       # Project type detection
│   └── types.ts          # VerificationResult, VerificationCriteria
├── human-queue/
│   ├── index.ts          # HumanQueue class
│   ├── store.ts          # SQLite storage
│   └── types.ts          # HumanQueueMessage
├── retry/
│   └── index.ts          # RetryContext builder
└── tui/views/
    └── notifications.ts  # Human queue in TUI
```

## Files to Update

```
src/context-monitor.ts    # Add 40% objective reminder
src/queue.ts              # Add priority rebalancing
src/orchestrator.ts       # Wire verification + memorai + human queue
src/phases/development.ts # Add retry context injection
src/phases/planning.ts    # Add memory search before CEO
src/index.ts              # Add "autonoma respond" CLI command
package.json              # Add memorai dependency
```

---

## Database Schema Addition

Add to `.autonoma/db.sqlite`:

```sql
-- Human queue table
CREATE TABLE IF NOT EXISTS human_queue (
    id TEXT PRIMARY KEY,
    type TEXT CHECK(type IN ('question','approval','blocker')),
    task_id TEXT,
    agent_id TEXT,
    content TEXT NOT NULL,
    priority TEXT CHECK(priority IN ('low','medium','high','critical')),
    blocking INTEGER DEFAULT 0,
    response TEXT,
    status TEXT CHECK(status IN ('pending','responded','expired')),
    created_at TEXT,
    responded_at TEXT
);

-- Retry context table
CREATE TABLE IF NOT EXISTS retry_context (
    task_id TEXT PRIMARY KEY,
    previous_attempts INTEGER DEFAULT 0,
    last_error TEXT,
    verification_failures TEXT,  -- JSON array
    human_resolution TEXT,
    updated_at TEXT
);
```

---

## Testing Checklist

- [ ] Verification detects project type correctly
- [ ] Verification runs tests/build/lint/typecheck
- [ ] Human queue stores and retrieves messages
- [ ] `autonoma respond` CLI works
- [ ] TUI shows pending notifications
- [ ] Retry context injected on task retry
- [ ] 40% context reminder appears in prompts
- [ ] Priority rebalancing boosts old tasks
- [ ] Memorai initializes on start
- [ ] Memories searched before phases
- [ ] Learnings stored after tasks
- [ ] Handoffs stored as memories
- [ ] CEO gets architecture context

---

## Notes

- Memorai is Bun-only (uses `bun:sqlite`)
- Both autonoma and memorai use SQLite but separate databases:
  - `.autonoma/db.sqlite` - sessions, tasks, human queue
  - `.memorai/memory.db` - long-term memories (FTS5)
- The `memorai` package exports `MemoraiClient` for programmatic use
- CLI is `bunx memorai <command>` for standalone usage
