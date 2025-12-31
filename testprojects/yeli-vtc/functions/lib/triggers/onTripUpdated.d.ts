import * as functions from "firebase-functions";
/**
 * Firestore onUpdate trigger for trips collection.
 *
 * When a trip document is updated:
 * 1. Calls fraud detection to check for suspicious activity
 * 2. Creates an alert in the alerts collection if suspicious
 *
 * Fraud detection rules:
 * - Speed > 150 km/h → excessive_speed alert
 * - Idle > 10 min during in_ride phase → excessive_idle alert
 */
export declare const onTripUpdated: functions.CloudFunction<functions.Change<functions.firestore.QueryDocumentSnapshot>>;
//# sourceMappingURL=onTripUpdated.d.ts.map