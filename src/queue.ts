/**
 * Task Queue for Work-Stealing Execution
 *
 * Provides a shared queue of tasks that developers can pull from independently.
 * Eliminates the Promise.all() barrier that caused fast developers to wait for slow ones.
 */

import type { DevTask } from './types.ts';

interface ActiveTask {
  task: DevTask;
  startedAt: Date;
}

/**
 * Thread-safe task queue for parallel developer execution.
 * Each developer independently pulls tasks when ready.
 */
export class TaskQueue {
  private pending: DevTask[] = [];
  private active: Map<string, ActiveTask> = new Map();
  private completed: DevTask[] = [];
  private failed: DevTask[] = [];

  /**
   * Initialize queue with tasks
   */
  constructor(tasks: DevTask[] = []) {
    // Only include pending/running tasks (running tasks from interrupted sessions become pending)
    this.pending = tasks
      .filter(t => t.status === 'pending' || t.status === 'running')
      .map(t => ({ ...t, status: 'pending' as const }));
  }

  /**
   * Get next available task (returns null if queue is empty)
   */
  getNextTask(): DevTask | null {
    if (this.pending.length === 0) {
      return null;
    }
    return this.pending.shift() || null;
  }

  /**
   * Mark a task as started by a developer
   */
  startTask(developerId: string, task: DevTask): void {
    task.status = 'running';
    task.assignedTo = developerId;
    this.active.set(developerId, {
      task,
      startedAt: new Date(),
    });
  }

  /**
   * Mark a task as completed
   */
  completeTask(developerId: string, success: boolean): DevTask | null {
    const activeTask = this.active.get(developerId);
    if (!activeTask) {
      return null;
    }

    this.active.delete(developerId);
    activeTask.task.status = success ? 'complete' : 'failed';

    if (success) {
      this.completed.push(activeTask.task);
    } else {
      this.failed.push(activeTask.task);
    }

    return activeTask.task;
  }

  /**
   * Check if queue has more tasks
   */
  hasNext(): boolean {
    return this.pending.length > 0;
  }

  /**
   * Check if all work is done (no pending + no active)
   */
  isEmpty(): boolean {
    return this.pending.length === 0 && this.active.size === 0;
  }

  /**
   * Get count of pending tasks
   */
  getPendingCount(): number {
    return this.pending.length;
  }

  /**
   * Get count of active (running) tasks
   */
  getActiveCount(): number {
    return this.active.size;
  }

  /**
   * Get count of completed tasks
   */
  getCompletedCount(): number {
    return this.completed.length;
  }

  /**
   * Get count of failed tasks
   */
  getFailedCount(): number {
    return this.failed.length;
  }

  /**
   * Get total task count
   */
  getTotalCount(): number {
    return this.pending.length + this.active.size + this.completed.length + this.failed.length;
  }

  /**
   * Get active task for a developer
   */
  getActiveTask(developerId: string): DevTask | null {
    return this.active.get(developerId)?.task || null;
  }

  /**
   * Check if a developer is currently working
   */
  isDeveloperBusy(developerId: string): boolean {
    return this.active.has(developerId);
  }
}
