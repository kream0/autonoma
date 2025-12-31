/**
 * Protocol types for structured agent communication
 * Adapted from Memorai daemon and worker protocols
 */

import type { TaskComplexity } from './task.ts';

// ============================================
// DAEMON PROTOCOL MESSAGES
// ============================================

/** File modification record */
export interface FileModification {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  linesChanged?: string;
  functions?: string[];
  summary: string;
}

/** Learning to store in memory */
export interface Learning {
  category: MemoryCategory;
  content: string;
  importance: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  tags: string[];
}

export type MemoryCategory =
  | 'architecture'
  | 'decisions'
  | 'reports'
  | 'summaries'
  | 'structure'
  | 'notes';

/** Daemon heartbeat - emitted periodically by running agents */
export interface DaemonHeartbeat {
  type: 'HEARTBEAT';
  agentId: string;
  timestamp: string;
  context: {
    percentUsed: number;
    tokensUsed: number;
    contextLimit: number;
  };
  task: {
    id: number | null;
    title: string;
    progress: 'starting' | 'exploring' | 'implementing' | 'testing' | 'finishing';
  };
  queue: {
    pending: number;
    active: number;
    completed: number;
  };
  blockers: number;
}

/** Status update - describes current work */
export interface DaemonStatus {
  type: 'STATUS';
  agentId: string;
  timestamp: string;
  description: string;
  phase: 'analysis' | 'design' | 'implementation' | 'verification';
  confidence: 'high' | 'medium' | 'low';
}

/** Checkpoint - state saved, ready for potential replacement */
export interface DaemonCheckpoint {
  type: 'CHECKPOINT';
  agentId: string;
  timestamp: string;
  taskId: number | null;
  filesModified: FileModification[];
  uncommittedChanges: string[];
  stateSnapshot: string;
  canReplace: boolean;
}

/** Task completion signal */
export interface DaemonComplete {
  type: 'COMPLETE';
  agentId: string;
  timestamp: string;
  taskId: number;
  result: 'success' | 'partial' | 'failed';
  summary: string;
  filesModified: FileModification[];
  learnings: Learning[];
}

/** Blocked signal - cannot proceed */
export interface DaemonBlocked {
  type: 'BLOCKED';
  agentId: string;
  timestamp: string;
  taskId: number | null;
  reason: string;
  blockerType: 'dependency' | 'clarification_needed' | 'technical' | 'access';
  suggestedAction: string;
}

/** Error signal */
export interface DaemonError {
  type: 'ERROR';
  agentId: string;
  timestamp: string;
  taskId: number | null;
  error: string;
  severity: 'warning' | 'error' | 'fatal';
  recoverable: boolean;
  context: string;
}

/** Union type for all daemon protocol messages */
export type DaemonMessage =
  | DaemonHeartbeat
  | DaemonStatus
  | DaemonCheckpoint
  | DaemonComplete
  | DaemonBlocked
  | DaemonError;

// ============================================
// WORKER PROTOCOL
// ============================================

/** Task bundle - input provided to worker agents */
export interface TaskBundle {
  task: {
    id: number;
    title: string;
    description: string;
    files: string[];
    complexity: TaskComplexity;
    context?: string;
  };
  project: {
    path: string;
    name: string;
    stack: string[];
  };
  architecture: {
    summary: string;
    keyFiles: Array<{ path: string; purpose: string }>;
    patterns: string[];
  };
  memories: Array<{
    category: MemoryCategory;
    content: string;
    importance: number;
    createdAt: string;
  }>;
  previousHandoff?: {
    agentId: string;
    status: string;
    filesModified: FileModification[];
    nextSteps: string;
    context?: string;
  };
}

/** Worker result - output from worker agents */
export interface WorkerResult {
  taskId: number;
  status: 'success' | 'partial' | 'failed' | 'blocked';
  filesModified: FileModification[];
  testsRun: boolean;
  testsPassed: boolean;
  learnings: Learning[];
  blockers?: Array<{
    type: 'dependency' | 'clarification' | 'technical' | 'access';
    description: string;
    suggestedResolution?: string;
  }>;
  uncommittedWork?: string;
  nextSteps?: string[];
  summary: string;
}

// ============================================
// COMPLETION PROMISE PROTOCOL (Ralph-Wiggum Style)
// ============================================

/**
 * Completion promises are structured markers that agents emit
 * to signal completion of their work. The stop hook uses these
 * to determine whether to allow exit or re-invoke the agent.
 */
export type CompletionPromise =
  | 'TASK_COMPLETE'        // Developer finished task implementation
  | 'PLAN_COMPLETE'        // CEO created project plan
  | 'TASKS_READY'          // Staff Engineer broke down tasks
  | 'REVIEW_COMPLETE'      // QA reviewed code
  | 'E2E_COMPLETE'         // E2E testing completed
  | 'APPROVED'             // CEO approved project
  | 'REJECTED'             // CEO rejected project (needs retry)
  | 'VERIFICATION_PASSED'; // All automated checks passed

/** Result from parsing a completion promise */
export interface PromiseResult {
  promise: CompletionPromise;
  taskId?: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/** Loop state persisted by stop hook */
export interface LoopState {
  iteration: number;
  maxIterations: number;
  agentId: string;
  taskId?: number;
  startedAt: string;
  lastIterationAt: string;
  accumulatedContext: string[];
  promisesEmitted: PromiseResult[];
}

/** Self-loop configuration for agents */
export interface SelfLoopConfig {
  maxIterations: number;
  checkCompletionPromise: boolean;
  runVerificationOnClaim: boolean;
  preserveErrorTraces: boolean;
  injectRecitationBlock: boolean;
}
