/**
 * Persisted state types
 */

import type { AgentRole, AgentStatus, TokenUsage } from './agent.ts';
import type { TaskBatch } from './task.ts';

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
}

/** User interrupt during indefinite run */
export interface UserInterrupt {
  timestamp: string;
  guidance: string;
  ceoResponse?: string;
  appliedChanges?: string[];
}

/** Persisted state for resume capability (v3 - minimal storage) */
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
  maxDevelopers: number;
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
