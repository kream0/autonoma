/**
 * Task Queue for Work-Stealing Execution
 *
 * Provides a shared queue of tasks that developers can pull from independently.
 * Eliminates the Promise.all() barrier that caused fast developers to wait for slow ones.
 *
 * V2 Update: Added mutex protection to prevent race conditions in parallel execution.
 */

import type { DevTask } from './types.ts';
import { Mutex } from './utils/mutex.ts';
import { Deque } from './utils/deque.ts';

interface ActiveTask {
  task: DevTask;
  startedAt: Date;
}

/**
 * Thread-safe task queue for parallel developer execution.
 * Each developer independently pulls tasks when ready.
 * Uses mutex to prevent race conditions during concurrent access.
 */
export class TaskQueue {
  private pending: Deque<DevTask>;
  private active: Map<string, ActiveTask> = new Map();
  private completed: DevTask[] = [];
  private failed: DevTask[] = [];
  private mutex = new Mutex();

  /**
   * Initialize queue with tasks
   * NOTE: We work with original task references (not copies) so status updates
   * propagate back to the batch.tasks array for correct state persistence.
   */
  constructor(tasks: DevTask[] = []) {
    // Only include pending/running tasks (running tasks from interrupted sessions become pending)
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'running');
    // Reset running tasks to pending (in-place, no copy)
    for (const task of pendingTasks) {
      task.status = 'pending';
    }
    this.pending = Deque.fromArray(pendingTasks);
  }

  /**
   * Get next available task (returns null if queue is empty)
   * Uses mutex to prevent race conditions in parallel execution
   * Uses O(1) deque operation instead of O(n) array shift
   */
  async getNextTask(): Promise<DevTask | null> {
    return this.mutex.withLock(() => {
      if (this.pending.isEmpty()) {
        return null;
      }
      return this.pending.popFront() || null;
    });
  }

  /**
   * Mark a task as started by a developer
   * Uses mutex to prevent race conditions
   */
  async startTask(developerId: string, task: DevTask): Promise<void> {
    await this.mutex.withLock(() => {
      task.status = 'running';
      task.assignedTo = developerId;
      this.active.set(developerId, {
        task,
        startedAt: new Date(),
      });
    });
  }

  /**
   * Mark a task as completed
   * Uses mutex to prevent race conditions
   */
  async completeTask(developerId: string, success: boolean): Promise<DevTask | null> {
    return this.mutex.withLock(() => {
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
    });
  }

  /**
   * Check if queue has more tasks
   */
  hasNext(): boolean {
    return !this.pending.isEmpty();
  }

  /**
   * Check if all work is done (no pending + no active)
   */
  isEmpty(): boolean {
    return this.pending.isEmpty() && this.active.size === 0;
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

  /**
   * Re-queue a task for retry (puts it back at the front of pending)
   * Uses mutex to prevent race conditions
   * Uses O(1) deque pushFront instead of O(n) array unshift
   */
  async requeueTask(task: DevTask): Promise<void> {
    await this.mutex.withLock(() => {
      task.status = 'pending';
      task.assignedTo = undefined;
      // Put at front for priority retry - O(1)
      this.pending.pushFront(task);
    });
  }

  /**
   * Rebalance priorities based on task age and status
   * Call this after every N tasks completed
   * Uses mutex to prevent race conditions
   */
  async rebalancePriorities(getTaskAge: (task: DevTask) => number): Promise<void> {
    await this.mutex.withLock(() => {
      // Convert to array for rebalancing (infrequent operation)
      const pendingArray = this.pending.toArray();
      const toBoost: Array<{ task: DevTask; boost: number; idx: number }> = [];

      for (let i = 0; i < pendingArray.length; i++) {
        const task = pendingArray[i]!;
        let boost = 0;

        // Boost retryable failed tasks
        if (
          task.retryCount &&
          task.retryCount > 0 &&
          task.retryCount < (task.maxRetries ?? 2)
        ) {
          boost += 2;
        }

        // Boost old pending tasks (>1 hour)
        const age = getTaskAge(task);
        if (age > 3600000) {
          boost += 1;
        }

        // Higher boost for tasks with human resolution
        if (task.context?.includes('human_resolved')) {
          boost += 3;
        }

        if (boost > 0) {
          toBoost.push({ task, boost, idx: i });
        }
      }

      // Sort by boost descending and move high-boost tasks to front
      toBoost.sort((a, b) => b.boost - a.boost);

      // Remove boosted tasks from their positions and prepend
      const boostedTasks = toBoost
        .filter((b) => b.boost >= 2)
        .map((b) => b.task);

      if (boostedTasks.length > 0) {
        const reordered = [
          ...boostedTasks,
          ...pendingArray.filter((t) => !boostedTasks.includes(t)),
        ];
        this.pending = Deque.fromArray(reordered);
      }
    });
  }

  /**
   * Get failed tasks that can be retried
   */
  getRetryableFailed(): DevTask[] {
    return this.failed.filter(
      (t) => (t.retryCount ?? 0) < (t.maxRetries ?? 2)
    );
  }
}
