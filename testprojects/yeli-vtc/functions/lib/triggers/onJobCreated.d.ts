import * as functions from "firebase-functions";
/**
 * Firestore onCreate trigger for jobs collection.
 *
 * When a new job is created:
 * 1. Calls the dispatch algorithm to find the best available driver
 * 2. Updates the job status to 'assigned' with the driver ID
 * 3. Updates the driver's currentJobId field
 * 4. Sends an FCM notification to the assigned driver
 */
export declare const onJobCreated: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
//# sourceMappingURL=onJobCreated.d.ts.map