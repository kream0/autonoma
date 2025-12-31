/**
 * Persisted state types
 *
 * V4 Update: Added self-loop tracking, promise tracking, verification history
 */

import type { AgentRole, AgentStatus, TokenUsage } from './agent.ts';
import type { TaskBatch } from './task.ts';
import type { CompletionPromise } from './protocol.ts';

/** Orchestration phases */
export type OrchestrationPhase =
  | 'idle'
  | 'planning'
  | 'task-breakdown'
  | 'development'
  | 'testing'
  | 'review'
  | 'ceo-approval'
  | 'complete'
  | 'failed';

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

/** Agent handoff for context window management */
export interface AgentHandoff {
  agentId: string;
  role: AgentRole;
  taskId?: number;
  timestamp: string;
  tokenUsage: TokenUsage;
  handoffBlock: ParsedHandoff | null;
  replacementAgentId?: string;
  /** V2: Session ID for resume support */
  sessionId?: string;
}

/** User interrupt during indefinite run */
export interface UserInterrupt {
  timestamp: string;
  guidance: string;
  ceoResponse?: string;
  appliedChanges?: string[];
}

/** V4: Self-loop state for Ralph-Wiggum style iteration */
export interface LoopStateV4 {
  currentAgentId: string | null;
  iteration: number;
  maxIterations: number;
  startedAt: string;
  lastIterationAt: string;
  accumulatedContext: string[];
}

/** V4: Promise tracking for completion detection */
export interface PromiseRecord {
  agentId: string;
  promise: CompletionPromise;
  timestamp: string;
  taskId?: number;
  verified: boolean;
}

/** V4: Verification result history */
export interface VerificationRecord {
  timestamp: string;
  taskId: number;
  allPassed: boolean;
  stages: Array<{
    name: string;
    passed: boolean;
    duration: number;
  }>;
}

/** Current state version */
export const STATE_VERSION = 4;

/** Persisted state for resume capability (v4 - with self-loop support) */
export interface PersistedState {
  version: number;
  startedAt: string;
  updatedAt: string;
  phase: OrchestrationPhase;
  requirementsPath: string;
  hasProjectContext: boolean;
  plan: {
    milestones: Array<{ id: number; title: string; description: string }>;
  } | null;
  batches: TaskBatch[];
  currentBatchIndex: number;
  currentTasksInProgress: number[];
  completedPhases: OrchestrationPhase[];
  maxDevelopers?: number;  // Deprecated - developers now spawned dynamically per batch
  lastTestOutput?: string[];
  lastQaOutput?: string[];
  ceoApprovalAttempts?: number;
  ceoFeedback?: string;
  indefiniteMode?: boolean;
  handoffs?: AgentHandoff[];
  totalLoopIterations?: number;
  userInterrupts?: UserInterrupt[];

  // V4 additions
  /** Self-loop state per agent */
  loopStates?: Record<string, LoopStateV4>;
  /** Promise tracking for all agents */
  promiseRecords?: PromiseRecord[];
  /** Verification history */
  verificationHistory?: VerificationRecord[];
  /** Session IDs for resume support */
  sessionIds?: Record<string, string>;
}

/** V3 schema for migration */
export interface PersistedStateV3 {
  version: 3;
  startedAt: string;
  updatedAt: string;
  phase: OrchestrationPhase;
  requirementsPath: string;
  hasProjectContext: boolean;
  plan: {
    milestones: Array<{ id: number; title: string; description: string }>;
  } | null;
  batches: TaskBatch[];
  currentBatchIndex: number;
  currentTasksInProgress: number[];
  completedPhases: OrchestrationPhase[];
  maxDevelopers?: number;  // Deprecated - developers now spawned dynamically per batch
  lastTestOutput?: string[];
  lastQaOutput?: string[];
  ceoApprovalAttempts?: number;
  ceoFeedback?: string;
  indefiniteMode?: boolean;
  handoffs?: AgentHandoff[];
  totalLoopIterations?: number;
  userInterrupts?: UserInterrupt[];
}

/** Status file schema for external monitoring (Claude Code Control API) */
export interface StatusFile {
  phase: OrchestrationPhase;
  iteration: number;
  progress: { completed: number; total: number };
  agents: Record<string, AgentStatus>;
  lastUpdate: string;
}
