/**
 * Task-related types
 */

/** Task complexity levels for context-aware developer allocation */
export type TaskComplexity = 'simple' | 'moderate' | 'complex' | 'very_complex';

/** Individual developer task */
export interface DevTask {
  id: number;
  title: string;
  description: string;
  files?: string[];
  status: 'pending' | 'running' | 'complete' | 'failed';
  assignedTo?: string;
  complexity?: TaskComplexity;
  context?: string;
  retryCount?: number;
  lastFailureReason?: string;
  maxRetries?: number;
}

/** Batch of tasks that can be executed together */
export interface TaskBatch {
  batchId: number;
  tasks: DevTask[];
  parallel: boolean;
  status: 'pending' | 'running' | 'complete' | 'failed';
  maxParallelTasks?: number;
}

/** Generic task definition (for TUI) */
export interface Task {
  id: string;
  description: string;
  agentId?: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
