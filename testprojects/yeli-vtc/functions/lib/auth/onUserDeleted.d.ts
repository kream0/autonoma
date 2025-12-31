import * as functions from "firebase-functions";
/**
 * Firebase Auth trigger that runs when a user is deleted.
 * Marks the user document as deleted and cleans up related data.
 */
export declare const onUserDeleted: functions.CloudFunction<import("firebase-admin/auth").UserRecord>;
//# sourceMappingURL=onUserDeleted.d.ts.map