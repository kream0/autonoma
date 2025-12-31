/**
 * Retry Context Builder
 *
 * Builds context to inject into retry prompts with error information.
 * V2 Update: Preserves full error trace history for learning from failures.
 */

import { Database } from 'bun:sqlite';
import type { VerificationResult } from '../verification/types.ts';
import type { RetryContext, RetryContextRow, ErrorTrace } from './types.ts';

export * from './types.ts';

/** Maximum number of error traces to keep in history */
const MAX_ERROR_TRACES = 5;

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
        error_traces TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    // V2: Add error_traces column if it doesn't exist (migration)
    try {
      this.db.exec(`ALTER TABLE retry_context ADD COLUMN error_traces TEXT;`);
    } catch {
      // Column already exists
    }
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
      errorTraces: row.error_traces
        ? JSON.parse(row.error_traces)
        : [],
    };
  }

  save(taskId: string, context: RetryContext): void {
    const now = new Date().toISOString();
    this.db.run(
      `
      INSERT OR REPLACE INTO retry_context
      (task_id, previous_attempts, last_error, verification_failures, human_resolution, error_traces, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        taskId,
        context.previousAttempts,
        context.lastError,
        JSON.stringify(context.verificationFailures),
        context.humanResolution ?? null,
        JSON.stringify(context.errorTraces ?? []),
        now,
      ]
    );
  }

  /**
   * Increment attempts and add new error trace to history
   */
  incrementAttempts(
    taskId: string,
    error: string,
    failures: VerificationResult[],
    filesInvolved: string[] = []
  ): RetryContext {
    const existing = this.get(taskId);
    const previousTraces = existing?.errorTraces ?? [];

    // Create new error trace
    const newTrace: ErrorTrace = {
      iteration: (existing?.previousAttempts ?? 0) + 1,
      timestamp: new Date().toISOString(),
      errorType: failures.length > 0 ? 'verification' : 'runtime',
      message: error,
      stackTrace: failures.length > 0
        ? failures.map(f => `${f.type}: ${f.message}`).join('\n')
        : undefined,
      filesInvolved,
      suggestedFix: extractSuggestedFix(failures),
    };

    // Keep only last N traces
    const errorTraces = [...previousTraces, newTrace].slice(-MAX_ERROR_TRACES);

    const context: RetryContext = {
      previousAttempts: (existing?.previousAttempts ?? 0) + 1,
      lastError: error,
      verificationFailures: failures,
      humanResolution: existing?.humanResolution,
      errorTraces,
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
        errorTraces: [],
      });
    }
  }

  clear(taskId: string): void {
    this.db.run(`DELETE FROM retry_context WHERE task_id = ?`, [taskId]);
  }
}

/**
 * Extract suggested fix from verification failures
 */
function extractSuggestedFix(failures: VerificationResult[]): string | undefined {
  for (const failure of failures) {
    if (failure.output) {
      // Look for common error patterns and suggest fixes
      if (failure.output.includes('Cannot find module')) {
        return 'Check import paths and ensure dependencies are installed';
      }
      if (failure.output.includes('Type error')) {
        return 'Fix TypeScript type errors';
      }
      if (failure.output.includes('Test failed')) {
        return 'Fix failing tests';
      }
    }
  }
  return undefined;
}

/**
 * Build retry prompt section with error history
 * V2 Update: Includes full error trace history for learning
 */
export function buildRetryPrompt(context: RetryContext): string {
  const sections: string[] = [];

  sections.push(`<retry_context attempt="${context.previousAttempts + 1}">`);

  // Current error
  if (context.lastError) {
    sections.push(`<current_error>${context.lastError}</current_error>`);
  }

  // Verification failures
  if (context.verificationFailures.length > 0) {
    sections.push('<verification_failures>');
    for (const f of context.verificationFailures) {
      sections.push(`  <failure type="${f.type}">`);
      sections.push(`    <message>${f.message}</message>`);
      if (f.output) {
        sections.push(`    <output>${f.output.slice(0, 500)}</output>`);
      }
      sections.push('  </failure>');
    }
    sections.push('</verification_failures>');
  }

  // V2: Error history (learning from past failures)
  if (context.errorTraces && context.errorTraces.length > 0) {
    sections.push('<error_history>');
    sections.push('<instruction>Learn from these previous failures. Do NOT repeat the same mistakes.</instruction>');

    for (const trace of context.errorTraces) {
      sections.push(`  <error iteration="${trace.iteration}" type="${trace.errorType}">`);
      sections.push(`    <message>${trace.message}</message>`);
      if (trace.filesInvolved.length > 0) {
        sections.push(`    <files>${trace.filesInvolved.join(', ')}</files>`);
      }
      if (trace.suggestedFix) {
        sections.push(`    <suggested_fix>${trace.suggestedFix}</suggested_fix>`);
      }
      if (trace.stackTrace) {
        sections.push(`    <stack_trace>${trace.stackTrace.slice(0, 300)}</stack_trace>`);
      }
      sections.push('  </error>');
    }

    sections.push('</error_history>');
  }

  // Human guidance
  if (context.humanResolution) {
    sections.push(`<human_guidance>${context.humanResolution}</human_guidance>`);
  }

  // Instructions
  sections.push('<instruction>');
  sections.push('Review the error history above and fix the issues.');
  sections.push('Do not repeat previous mistakes - learn from what failed.');
  sections.push('Focus on the specific files and errors mentioned.');
  sections.push('</instruction>');

  sections.push('</retry_context>');

  return sections.join('\n');
}

/**
 * Build a simpler retry prompt for quick retries
 */
export function buildQuickRetryPrompt(error: string, iteration: number): string {
  return `<retry_context attempt="${iteration}">
<error>${error}</error>
<instruction>Fix the error above and complete the task.</instruction>
</retry_context>`;
}
