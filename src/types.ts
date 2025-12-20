/**
 * Core types for Autonoma
 */

/** Agent roles in the hierarchy */
export type AgentRole = 'ceo' | 'staff' | 'developer' | 'qa' | 'e2e';

/** Context threshold levels for awareness injection */
export type ContextThreshold = 50 | 60 | 70 | 80;

/** Watchdog decision types */
export type WatchdogDecision = 'respawn' | 'inject_guidance' | 'continue' | 'escalate_to_user';

/** Agent status */
export type AgentStatus = 'idle' | 'running' | 'complete' | 'error';

/** Permission mode for Claude Code CLI */
export type PermissionMode = 'plan' | 'full';

/** Task complexity levels for context-aware developer allocation */
export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'very_complex';

/** Agent configuration */
export interface AgentConfig {
  id: string;
  role: AgentRole;
  name: string;
  systemPrompt?: string;
  workingDir: string;
  permissionMode: PermissionMode;  // 'plan' = read-only, 'full' = can write
}

/** Token usage tracking */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

/** Agent state at runtime */
export interface AgentState {
  config: AgentConfig;
  status: AgentStatus;
  output: string[];
  startTime?: Date;
  endTime?: Date;
  error?: string;
  tokenUsage: TokenUsage;
}

/** Tile in the TUI */
export interface Tile {
  id: string;
  agentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** View modes */
export type ViewMode = 'tiles' | 'focus' | 'tasks' | 'stats' | 'dashboard';

/** Task definition */
export interface Task {
  id: string;
  description: string;
  agentId?: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/** Session stats */
export interface SessionStats {
  startTime: Date;
  agents: {
    id: string;
    role: AgentRole;
    status: AgentStatus;
    messageCount: number;
  }[];
  tasks: {
    total: number;
    pending: number;
    running: number;
    complete: number;
    failed: number;
  };
}

/** Tile layout for different agent combinations */
export interface TileLayout {
  tiles: {
    agentId: string;
    role: AgentRole;
    x: string; // percentage e.g. "0%"
    y: string;
    width: string;
    height: string;
  }[];
}

/** Orchestration phases */
export type OrchestrationPhase =
  | 'idle'
  | 'planning'      // CEO analyzing requirements
  | 'task-breakdown' // Staff breaking into tasks
  | 'development'   // Developer(s) implementing
  | 'testing'       // Running automated tests
  | 'review'        // QA reviewing
  | 'ceo-approval'  // CEO final approval
  | 'complete'
  | 'failed';

/** Individual developer task */
export interface DevTask {
  id: number;
  title: string;
  description: string;
  files?: string[];
  status: 'pending' | 'running' | 'complete' | 'failed';
  assignedTo?: string;  // Developer agent ID
  complexity?: TaskComplexity;  // Task complexity for context estimation
  context?: string;  // Task-specific context for the developer
  // Retry tracking (for QA feedback loop)
  retryCount?: number;  // Number of retry attempts (default 0)
  lastFailureReason?: string;  // QA's reason for failure
  maxRetries?: number;  // Max retry attempts (default 2)
}

/** Batch of tasks that can be executed together */
export interface TaskBatch {
  batchId: number;
  tasks: DevTask[];
  parallel: boolean;  // If true, tasks in this batch can run simultaneously
  status: 'pending' | 'running' | 'complete' | 'failed';
  maxParallelTasks?: number;  // Per-batch parallelism override (for complex batches)
}

/** Persisted state for resume capability (v3 - minimal storage) */
export interface PersistedState {
  version: number;
  startedAt: string;  // ISO date
  updatedAt: string;  // ISO date
  phase: OrchestrationPhase;

  // Store path to requirements file, not content (v3)
  requirementsPath: string;

  // Flag indicating CLAUDE.md exists, content loaded at runtime (v3)
  hasProjectContext: boolean;

  // Plan from CEO (extracted JSON only, not raw output)
  plan: {
    milestones: Array<{ id: number; title: string; description: string }>;
  } | null;

  // Task batches from Staff Engineer (extracted JSON only)
  batches: TaskBatch[];

  // Track which batch we're on (for resume)
  currentBatchIndex: number;

  // Track tasks within current batch (for resume of parallel execution)
  currentTasksInProgress: number[];  // Task IDs currently running

  // Completed phases for resume logic
  completedPhases: OrchestrationPhase[];

  // Number of parallel developers to use
  maxDevelopers: number;

  // Phase outputs for CEO approval (stored for resume)
  lastTestOutput?: string[];
  lastQaOutput?: string[];
  ceoApprovalAttempts?: number;
  ceoFeedback?: string;  // CEO's feedback if rejected

  // Indefinite mode state (v4)
  indefiniteMode?: boolean;
  handoffs?: AgentHandoff[];
  totalLoopIterations?: number;
  userInterrupts?: UserInterrupt[];
}

/** Agent handoff for context window management */
export interface AgentHandoff {
  agentId: string;
  role: AgentRole;
  taskId?: number;
  timestamp: string;  // ISO date
  tokenUsage: TokenUsage;
  handoffBlock: ParsedHandoff | null;
  replacementAgentId?: string;
}

/** Parsed handoff block from agent output */
export interface ParsedHandoff {
  taskId: number;
  status: 'pending' | 'in_progress' | 'blocked' | 'nearly_complete';
  filesModified: Array<{
    path: string;
    lines?: string;
    functions?: string;
  }>;
  filesToTouch: Array<{
    path: string;
    reason: string;
  }>;
  currentState: string;
  blockers?: string;
  nextSteps: string;
  context?: string;
}

/** User interrupt during indefinite run */
export interface UserInterrupt {
  timestamp: string;
  guidance: string;
  ceoResponse?: string;
  appliedChanges?: string[];
}

/** Context monitor state for an agent */
export interface AgentContextState {
  agentId: string;
  totalTokens: number;
  contextLimit: number;
  percentUsed: number;
  lastThresholdNotified: ContextThreshold | null;
  handoffRequested: boolean;
}

/** Health monitor status for an agent */
export interface AgentHealthStatus {
  agentId: string;
  isHealthy: boolean;
  lastOutputTime: Date;
  errorCount: number;
  lastError?: string;
  isStuck: boolean;
}
