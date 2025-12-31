/**
 * Human Queue Manager
 *
 * Queues blockers, questions, and approval requests for human resolution.
 */

import { Database } from 'bun:sqlite';
import { HumanQueueStore } from './store.ts';
import type { HumanQueueMessage, HumanQueueFilter } from './types.ts';

export * from './types.ts';
export { HumanQueueStore } from './store.ts';

export class HumanQueue {
  private store: HumanQueueStore;

  constructor(db: Database) {
    this.store = new HumanQueueStore(db);
  }

  /**
   * Queue a blocker for human resolution
   */
  queueBlocker(
    taskId: string,
    agentId: string,
    reason: string,
    priority: HumanQueueMessage['priority'] = 'high'
  ): string {
    return this.store.insert({
      type: 'blocker',
      taskId,
      agentId,
      content: reason,
      priority,
      blocking: true,
    });
  }

  /**
   * Queue a question for human answer
   */
  queueQuestion(
    agentId: string,
    question: string,
    taskId?: string,
    priority: HumanQueueMessage['priority'] = 'medium'
  ): string {
    return this.store.insert({
      type: 'question',
      taskId,
      agentId,
      content: question,
      priority,
      blocking: false,
    });
  }

  /**
   * Queue an approval request
   */
  queueApproval(
    agentId: string,
    description: string,
    taskId?: string,
    priority: HumanQueueMessage['priority'] = 'high'
  ): string {
    return this.store.insert({
      type: 'approval',
      taskId,
      agentId,
      content: description,
      priority,
      blocking: true,
    });
  }

  /**
   * Get all pending messages
   */
  getPending(filter?: HumanQueueFilter): HumanQueueMessage[] {
    return this.store.getPending(filter);
  }

  /**
   * Get blocking messages for a task
   */
  getBlockers(taskId: string): HumanQueueMessage[] {
    return this.store.getPending({ taskId, blocking: true });
  }

  /**
   * Get a message by ID
   */
  getById(id: string): HumanQueueMessage | null {
    return this.store.getById(id);
  }

  /**
   * Respond to a queued message
   */
  respond(id: string, response: string): boolean {
    return this.store.respond(id, response);
  }

  /**
   * Get resolution for a task (if any)
   */
  getResolution(taskId: string): string | null {
    return this.store.getResolutionForTask(taskId);
  }

  /**
   * Check if task is blocked
   */
  isBlocked(taskId: string): boolean {
    return this.store.getPending({ taskId, blocking: true }).length > 0;
  }

  /**
   * Expire old pending messages
   */
  expireOld(maxAgeHours: number = 24): number {
    return this.store.expireOld(maxAgeHours);
  }

  /**
   * Format pending messages for display
   */
  formatPending(): string {
    const pending = this.getPending();
    if (pending.length === 0) return 'No pending messages';

    return pending
      .map((m) => {
        const icon =
          m.type === 'blocker' ? '[!]' : m.type === 'question' ? '[?]' : '[A]';
        const block = m.blocking ? ' (BLOCKING)' : '';
        return `${icon} [${m.id}] ${m.content.slice(0, 60)}...${block}`;
      })
      .join('\n');
  }
}
