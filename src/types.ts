/**
 * Core types for Autonoma
 */

/** Agent roles in the hierarchy */
export type AgentRole = 'ceo' | 'staff' | 'developer' | 'qa';

/** Agent status */
export type AgentStatus = 'idle' | 'running' | 'complete' | 'error';

/** Agent configuration */
export interface AgentConfig {
  id: string;
  role: AgentRole;
  name: string;
  systemPrompt?: string;
  workingDir: string;
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
  | 'review'        // QA reviewing
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
}

/** Batch of tasks that can be executed together */
export interface TaskBatch {
  batchId: number;
  tasks: DevTask[];
  parallel: boolean;  // If true, tasks in this batch can run simultaneously
  status: 'pending' | 'running' | 'complete' | 'failed';
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
}
