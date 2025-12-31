import * as functions from "firebase-functions";
import { detectFraud, TripUpdate } from "../dispatch/fraudDetection";

/**
 * Trip position data structure
 */
interface TripPosition {
  location: {
    lat: number;
    lng: number;
  };
  timestamp: FirebaseFirestore.Timestamp;
  speed?: number;
}

/**
 * Trip document structure from Firestore
 */
interface Trip {
  id: string;
  jobId: string;
  driverId: string;
  customerId: string;
  phase: "going_to_pickup" | "at_pickup" | "in_ride" | "completing" | "completed";
  positions: TripPosition[];
  route: {
    pickup: { lat: number; lng: number };
    dropoff: { lat: number; lng: number };
    polyline: string;
  };
  lastMovementAt: FirebaseFirestore.Timestamp;
}

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
export const onTripUpdated = functions.firestore
  .document("trips/{tripId}")
  .onUpdate(async (change, context) => {
    const tripId = context.params.tripId;
    const afterData = change.after.data() as Omit<Trip, "id">;

    const tripAfter: Trip = { id: tripId, ...afterData };

    functions.logger.info(`Trip updated: ${tripId}`, {
      phase: tripAfter.phase,
      positionCount: tripAfter.positions?.length || 0,
    });

    try {
      // Build TripUpdate object for fraud detection
      const tripUpdate: TripUpdate = {
        id: tripId,
        driverId: tripAfter.driverId,
        phase: tripAfter.phase,
        positions: tripAfter.positions,
        lastMovementAt: tripAfter.lastMovementAt,
      };

      // Run fraud detection - creates alert if suspicious
      const alert = await detectFraud(tripUpdate);

      if (alert) {
        functions.logger.warn(`Suspicious activity detected on trip ${tripId}`, {
          alertType: alert.type,
          value: alert.value,
          message: alert.message,
        });

        return {
          success: true,
          suspicious: true,
          alertType: alert.type,
          value: alert.value,
        };
      }

      return {
        success: true,
        suspicious: false,
      };
    } catch (error) {
      functions.logger.error(`Error processing trip update ${tripId}:`, error);
      throw error;
    }
  });
