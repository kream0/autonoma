/**
 * Retry Context Builder
 *
 * Builds context to inject into retry prompts with error information.
 */

import { Database } from 'bun:sqlite';
import type { VerificationResult } from '../verification/types.ts';
import type { RetryContext, RetryContextRow } from './types.ts';

export * from './types.ts';

export class RetryContextStore {
  constructor(private db: Database) {
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retry_context (
        task_id TEXT PRIMARY KEY,
        previous_attempts INTEGER DEFAULT 0,
        last_error TEXT,
        verification_failures TEXT,
        human_resolution TEXT,
        updated_at TEXT NOT NULL
      );
    `);
  }

  get(taskId: string): RetryContext | null {
    const row = this.db
      .prepare(`SELECT * FROM retry_context WHERE task_id = ?`)
      .get(taskId) as RetryContextRow | undefined;

    if (!row) return null;

    return {
      previousAttempts: row.previous_attempts,
      lastError: row.last_error ?? '',
      verificationFailures: row.verification_failures
        ? JSON.parse(row.verification_failures)
        : [],
      humanResolution: row.human_resolution ?? undefined,
    };
  }

  save(taskId: string, context: RetryContext): void {
    const now = new Date().toISOString();
    this.db.run(
      `
      INSERT OR REPLACE INTO retry_context
      (task_id, previous_attempts, last_error, verification_failures, human_resolution, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [
        taskId,
        context.previousAttempts,
        context.lastError,
        JSON.stringify(context.verificationFailures),
        context.humanResolution ?? null,
        now,
      ]
    );
  }

  incrementAttempts(
    taskId: string,
    error: string,
    failures: VerificationResult[]
  ): RetryContext {
    const existing = this.get(taskId);
    const context: RetryContext = {
      previousAttempts: (existing?.previousAttempts ?? 0) + 1,
      lastError: error,
      verificationFailures: failures,
      humanResolution: existing?.humanResolution,
    };
    this.save(taskId, context);
    return context;
  }

  addHumanResolution(taskId: string, resolution: string): void {
    const existing = this.get(taskId);
    if (existing) {
      existing.humanResolution = resolution;
      this.save(taskId, existing);
    } else {
      this.save(taskId, {
        previousAttempts: 0,
        lastError: '',
        verificationFailures: [],
        humanResolution: resolution,
      });
    }
  }

  clear(taskId: string): void {
    this.db.run(`DELETE FROM retry_context WHERE task_id = ?`, [taskId]);
  }
}

/**
 * Build retry prompt section
 */
export function buildRetryPrompt(context: RetryContext): string {
  const sections: string[] = [];

  sections.push(`## RETRY CONTEXT (Attempt ${context.previousAttempts + 1})`);
  sections.push('');

  if (context.lastError) {
    sections.push(`**Previous error:** ${context.lastError}`);
    sections.push('');
  }

  if (context.verificationFailures.length > 0) {
    sections.push('**Verification failures:**');
    for (const f of context.verificationFailures) {
      sections.push(`- [${f.type}] ${f.message}`);
      if (f.output) {
        sections.push(`  Output: ${f.output.slice(0, 500)}`);
      }
    }
    sections.push('');
  }

  if (context.humanResolution) {
    sections.push(`**Human guidance:** ${context.humanResolution}`);
    sections.push('');
  }

  sections.push('Please fix these issues and complete the task.');

  return sections.join('\n');
}
