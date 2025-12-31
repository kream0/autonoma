/**
 * Location data structure for trip positions
 */
interface Location {
    lat: number;
    lng: number;
}
/**
 * Trip position data structure
 */
interface TripPosition {
    location: Location;
    timestamp: FirebaseFirestore.Timestamp;
    speed?: number;
}
/**
 * Trip update data structure for fraud detection
 */
export interface TripUpdate {
    id: string;
    driverId: string;
    phase: "going_to_pickup" | "at_pickup" | "in_ride" | "completing" | "completed";
    positions?: TripPosition[];
    lastMovementAt?: FirebaseFirestore.Timestamp;
}
/**
 * Alert types for fraud detection
 */
export type AlertType = "excessive_speed" | "excessive_idle";
/**
 * Alert structure to be written to alerts collection
 */
export interface FraudAlert {
    type: AlertType;
    tripId: string;
    driverId: string;
    value: number;
    message: string;
    createdAt: FirebaseFirestore.FieldValue;
    resolved: boolean;
}
/**
 * Detects potential fraud based on trip update data.
 *
 * Checks:
 * 1. Speed > 150 km/h → Flag as excessive_speed
 * 2. Idle > 10 min during in_ride phase → Flag as excessive_idle
 *
 * If fraud is detected, writes an alert to the alerts collection.
 *
 * @param tripUpdate - Current trip update data
 * @returns FraudAlert object if suspicious activity detected, null otherwise
 */
export declare function detectFraud(tripUpdate: TripUpdate): Promise<FraudAlert | null>;
/**
 * Gets fraud detection thresholds (useful for testing or configuration display)
 */
export declare function getFraudThresholds(): {
    maxSpeedKmh: number;
    maxIdleMinutes: number;
};
export {};
//# sourceMappingURL=fraudDetection.d.ts.map