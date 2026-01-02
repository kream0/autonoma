/**
 * Retry Context Types
 *
 * Types for tracking retry attempts and injecting error context.
 * V2 Update: Added error trace history for learning from failures.
 */

import type { VerificationResult } from '../verification/types.ts';

/** Individual error trace from a failed attempt */
export interface ErrorTrace {
  iteration: number;
  timestamp: string;
  errorType: 'verification' | 'runtime' | 'timeout' | 'unknown';
  message: string;
  stackTrace?: string;
  filesInvolved: string[];
  suggestedFix?: string;
}

export interface RetryContext {
  previousAttempts: number;
  lastError: string;
  verificationFailures: VerificationResult[];
  humanResolution?: string;
  /** V2: Full error history for learning */
  errorTraces?: ErrorTrace[];
  /** V2.1: Preferred developer ID for retry affinity */
  preferredDeveloperId?: string;
}

export interface RetryContextRow {
  task_id: string;
  previous_attempts: number;
  last_error: string | null;
  verification_failures: string | null; // JSON array
  human_resolution: string | null;
  error_traces: string | null; // V2: JSON array of ErrorTrace
  preferred_developer_id: string | null; // V2.1: Developer affinity
  updated_at: string;
}

/** V2: Enhanced retry context with error history */
export interface EnhancedRetryContext extends RetryContext {
  errorTraces: ErrorTrace[];
}
