import * as functions from "firebase-functions";
/**
 * POST endpoint to cancel a job.
 *
 * Request body:
 * - jobId: The job ID to cancel
 * - reason: Reason for cancellation
 *
 * Validates ownership, updates status to 'cancelled',
 * notifies driver if assigned, and resets driver status.
 */
export declare const cancelJob: functions.HttpsFunction;
//# sourceMappingURL=cancelJob.d.ts.map