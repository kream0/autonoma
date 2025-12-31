/**
 * Retry Context Types
 *
 * Types for tracking retry attempts and injecting error context.
 */

import type { VerificationResult } from '../verification/types.ts';

export interface RetryContext {
  previousAttempts: number;
  lastError: string;
  verificationFailures: VerificationResult[];
  humanResolution?: string;
}

export interface RetryContextRow {
  task_id: string;
  previous_attempts: number;
  last_error: string | null;
  verification_failures: string | null; // JSON array
  human_resolution: string | null;
  updated_at: string;
}
