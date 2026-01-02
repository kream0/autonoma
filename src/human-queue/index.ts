/**
 * Human Queue Manager
 *
 * Queues blockers, questions, and approval requests for human resolution.
 *
 * V2 Update: Added auto-escalation and auto-resolve patterns to reduce
 * human intervention for common issues.
 */

import { Database } from 'bun:sqlite';
import { HumanQueueStore } from './store.ts';
import type { HumanQueueMessage, HumanQueueFilter } from './types.ts';

export * from './types.ts';
export { HumanQueueStore } from './store.ts';

/**
 * Auto-resolve patterns for common blockers
 */
interface AutoResolvePattern {
  pattern: RegExp;
  resolution: string;
  category: string;
}

const AUTO_RESOLVE_PATTERNS: AutoResolvePattern[] = [
  { pattern: /npm install|missing.*module|Cannot find module/i, resolution: 'RUN: npm install or bun install', category: 'dependencies' },
  { pattern: /port.*in use|EADDRINUSE/i, resolution: 'RUN: lsof -ti:PORT | xargs kill -9', category: 'port-conflict' },
  { pattern: /permission denied|EACCES/i, resolution: 'RUN: chmod +x <file> or check file permissions', category: 'permissions' },
  { pattern: /ENOENT.*no such file/i, resolution: 'Create the missing file or directory', category: 'missing-file' },
  { pattern: /ECONNREFUSED|connection refused/i, resolution: 'Ensure the service is running and accessible', category: 'connection' },
  { pattern: /out of memory|ENOMEM/i, resolution: 'Reduce memory usage or increase limits', category: 'memory' },
  { pattern: /timeout|ETIMEDOUT/i, resolution: 'Increase timeout or check network', category: 'timeout' },
];

/** Default escalation timeout in milliseconds (30 minutes) */
const DEFAULT_ESCALATION_TIMEOUT_MS = 30 * 60 * 1000;

/** Check interval for escalation monitor (60 seconds) */
const ESCALATION_CHECK_INTERVAL_MS = 60 * 1000;

export class HumanQueue {
  private store: HumanQueueStore;
  private escalationInterval?: ReturnType<typeof setInterval>;
  private onAutoResolve?: (messageId: string, resolution: string) => void;
  private onEscalate?: (messageId: string, reason: string) => void;

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
   * Format pending messages for display with urgency indicators
   */
  formatPending(): string {
    const pending = this.getPending();
    if (pending.length === 0) return 'No pending messages';

    const now = Date.now();
    return pending
      .map((m) => {
        // Type icon
        const typeIcon =
          m.type === 'blocker' ? '🚫' : m.type === 'question' ? '❓' : '✋';

        // Priority indicator
        const priorityIcon =
          m.priority === 'critical' ? '🔴' :
          m.priority === 'high' ? '🟠' :
          m.priority === 'medium' ? '🟡' : '⚪';

        // Calculate age
        const createdAt = new Date(m.createdAt).getTime();
        const ageMs = now - createdAt;
        const ageStr = this.formatAge(ageMs);

        // Urgency based on age
        const urgency = ageMs > 30 * 60 * 1000 ? ' ⚠️ OVERDUE' :
                        ageMs > 15 * 60 * 1000 ? ' ⏰ URGENT' : '';

        // Blocking indicator
        const block = m.blocking ? ' [BLOCKING]' : '';

        // Truncate content
        const content = m.content.length > 50
          ? m.content.slice(0, 50) + '...'
          : m.content;

        return `${typeIcon} ${priorityIcon} [${m.id.slice(0, 8)}] ${content}${block}${urgency} (${ageStr})`;
      })
      .join('\n');
  }

  /**
   * Format age in human-readable form
   */
  private formatAge(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  /**
   * Get summary of pending messages for quick display
   */
  getSummary(): string {
    const pending = this.getPending();
    if (pending.length === 0) return '';

    const blockers = pending.filter(m => m.type === 'blocker').length;
    const questions = pending.filter(m => m.type === 'question').length;
    const approvals = pending.filter(m => m.type === 'approval').length;

    const parts: string[] = [];
    if (blockers > 0) parts.push(`${blockers} blocker${blockers > 1 ? 's' : ''}`);
    if (questions > 0) parts.push(`${questions} question${questions > 1 ? 's' : ''}`);
    if (approvals > 0) parts.push(`${approvals} approval${approvals > 1 ? 's' : ''}`);

    return `⚠️ Human attention needed: ${parts.join(', ')}`;
  }

  /**
   * Try to auto-resolve a message using pattern matching
   * Returns the resolution if successful, null otherwise
   */
  tryAutoResolve(content: string): string | null {
    for (const { pattern, resolution } of AUTO_RESOLVE_PATTERNS) {
      if (pattern.test(content)) {
        return resolution;
      }
    }
    return null;
  }

  /**
   * Queue a blocker with auto-resolve attempt
   * Returns the ID and whether it was auto-resolved
   */
  queueBlockerWithAutoResolve(
    taskId: string,
    agentId: string,
    reason: string,
    priority: HumanQueueMessage['priority'] = 'high'
  ): { id: string; autoResolved: boolean; resolution?: string } {
    // Try auto-resolve first
    const resolution = this.tryAutoResolve(reason);
    if (resolution) {
      // Create the message and immediately resolve it
      const id = this.store.insert({
        type: 'blocker',
        taskId,
        agentId,
        content: reason,
        priority,
        blocking: true,
      });
      this.store.respond(id, `[AUTO-RESOLVED] ${resolution}`);
      this.onAutoResolve?.(id, resolution);
      return { id, autoResolved: true, resolution };
    }

    // No auto-resolve, queue normally
    const id = this.queueBlocker(taskId, agentId, reason, priority);
    return { id, autoResolved: false };
  }

  /**
   * Start the escalation monitor
   * Checks for old pending messages and auto-resolves or skips them
   */
  startEscalationMonitor(callbacks?: {
    onAutoResolve?: (messageId: string, resolution: string) => void;
    onEscalate?: (messageId: string, reason: string) => void;
  }): void {
    this.onAutoResolve = callbacks?.onAutoResolve;
    this.onEscalate = callbacks?.onEscalate;

    this.stopEscalationMonitor(); // Clear any existing interval

    this.escalationInterval = setInterval(() => {
      this.checkForEscalation();
    }, ESCALATION_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the escalation monitor
   */
  stopEscalationMonitor(): void {
    if (this.escalationInterval) {
      clearInterval(this.escalationInterval);
      this.escalationInterval = undefined;
    }
  }

  /**
   * Check for messages that need escalation
   * Auto-resolves if possible, otherwise marks for skip
   */
  private checkForEscalation(): void {
    const pending = this.getPending();
    const now = Date.now();

    for (const message of pending) {
      const createdAt = new Date(message.createdAt).getTime();
      const age = now - createdAt;

      if (age > DEFAULT_ESCALATION_TIMEOUT_MS) {
        // Message has been pending too long
        // Try auto-resolve one more time
        const resolution = this.tryAutoResolve(message.content);

        if (resolution) {
          this.store.respond(message.id, `[AUTO-RESOLVED after timeout] ${resolution}`);
          this.onAutoResolve?.(message.id, resolution);
        } else {
          // Can't auto-resolve - skip the task and log for human review later
          this.store.respond(
            message.id,
            `[ESCALATED] Task skipped after ${Math.round(age / 60000)}min timeout. Review needed.`
          );
          this.onEscalate?.(message.id, `Timeout after ${Math.round(age / 60000)} minutes`);
        }
      }
    }
  }

  /**
   * Get messages that were auto-resolved or escalated
   * Useful for review and learning
   */
  getAutoResolved(): HumanQueueMessage[] {
    return this.store.getAll().filter(
      m => m.status === 'responded' &&
           (m.response?.includes('[AUTO-RESOLVED]') || m.response?.includes('[ESCALATED]'))
    );
  }
}
