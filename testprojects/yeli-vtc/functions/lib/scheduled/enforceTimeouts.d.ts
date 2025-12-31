import * as functions from "firebase-functions";
/**
 * Scheduled function that runs every minute to enforce job timeouts.
 *
 * Handles two types of timeouts:
 * 1. Assigned jobs older than 30 seconds: Re-dispatch to find a new driver
 * 2. Pending jobs older than 5 minutes: Cancel with 'no_drivers' reason
 */
export declare const enforceTimeouts: functions.CloudFunction<unknown>;
//# sourceMappingURL=enforceTimeouts.d.ts.map