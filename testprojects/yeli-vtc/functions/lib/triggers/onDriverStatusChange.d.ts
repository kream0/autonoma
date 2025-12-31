import * as functions from "firebase-functions";
/**
 * Firestore onUpdate trigger for drivers collection.
 *
 * When a driver's status changes to 'available':
 * 1. Check for pending jobs in the driver's area
 * 2. Filter jobs matching the driver's vehicle category
 * 3. Auto-assign the nearest pending job if found
 * 4. Send FCM notification to the driver
 */
export declare const onDriverStatusChange: functions.CloudFunction<functions.Change<functions.firestore.QueryDocumentSnapshot>>;
//# sourceMappingURL=onDriverStatusChange.d.ts.map