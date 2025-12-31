import * as functions from "firebase-functions";
/**
 * Firebase Auth trigger that runs when a new user is created.
 * Creates a corresponding user document in Firestore with default values.
 */
export declare const onUserCreated: functions.CloudFunction<import("firebase-admin/auth").UserRecord>;
//# sourceMappingURL=onUserCreated.d.ts.map