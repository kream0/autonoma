import * as admin from "firebase-admin";

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
 * Configuration for fraud detection thresholds
 */
const FRAUD_CONFIG = {
  MAX_SPEED_KMH: 150,
  MAX_IDLE_MS: 10 * 60 * 1000, // 10 minutes in milliseconds
};

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
export async function detectFraud(tripUpdate: TripUpdate): Promise<FraudAlert | null> {
  // Check for excessive speed in the latest position
  const positions = tripUpdate.positions || [];
  if (positions.length > 0) {
    const latestPosition = positions[positions.length - 1];
    if (latestPosition.speed !== undefined && latestPosition.speed > FRAUD_CONFIG.MAX_SPEED_KMH) {
      const alert = await createAlert(
        tripUpdate.id,
        tripUpdate.driverId,
        "excessive_speed",
        latestPosition.speed,
        `Speed of ${latestPosition.speed} km/h exceeds maximum of ${FRAUD_CONFIG.MAX_SPEED_KMH} km/h`
      );
      return alert;
    }
  }

  // Check for excessive idle time during in_ride phase
  if (tripUpdate.phase === "in_ride" && tripUpdate.lastMovementAt) {
    const lastMovementTime = tripUpdate.lastMovementAt.toMillis();
    const currentTime = Date.now();
    const idleTimeMs = currentTime - lastMovementTime;

    if (idleTimeMs > FRAUD_CONFIG.MAX_IDLE_MS) {
      const idleMinutes = Math.round(idleTimeMs / 60000);
      const alert = await createAlert(
        tripUpdate.id,
        tripUpdate.driverId,
        "excessive_idle",
        idleTimeMs,
        `Idle for ${idleMinutes} minutes during active ride (threshold: 10 minutes)`
      );
      return alert;
    }
  }

  return null;
}

/**
 * Creates a fraud alert and writes it to the alerts collection.
 *
 * @param tripId - The trip document ID
 * @param driverId - The driver's document ID
 * @param alertType - Type of fraud detected
 * @param value - The suspicious value that triggered the alert
 * @param message - Human-readable description of the alert
 * @returns The created FraudAlert object
 */
async function createAlert(
  tripId: string,
  driverId: string,
  alertType: AlertType,
  value: number,
  message: string
): Promise<FraudAlert> {
  const db = admin.firestore();

  const alert: FraudAlert = {
    type: alertType,
    tripId: tripId,
    driverId: driverId,
    value: value,
    message: message,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    resolved: false,
  };

  await db.collection("alerts").add(alert);

  return alert;
}

/**
 * Gets fraud detection thresholds (useful for testing or configuration display)
 */
export function getFraudThresholds() {
  return {
    maxSpeedKmh: FRAUD_CONFIG.MAX_SPEED_KMH,
    maxIdleMinutes: FRAUD_CONFIG.MAX_IDLE_MS / 60000,
  };
}
