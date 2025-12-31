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
