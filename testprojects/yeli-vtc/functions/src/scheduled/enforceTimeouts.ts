import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { findBestDriver, Location, VehicleCategory } from "../dispatch/dispatchAlgorithm";

/**
 * Timeout configuration constants
 */
const TIMEOUT_CONFIG = {
  /** Time in seconds after which an assigned job should be re-dispatched */
  ASSIGNED_TIMEOUT_SECONDS: 30,
  /** Time in minutes after which a pending job should be cancelled */
  PENDING_TIMEOUT_MINUTES: 5,
};

/**
 * Job document structure from Firestore
 */
interface Job {
  id: string;
  riderId: string;
  pickupLocation: Location;
  dropoffLocation: Location;
  vehicleCategory: VehicleCategory;
  status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
  driverId?: string;
  assignedAt?: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
  cancelReason?: string;
}

/**
 * Scheduled function that runs every minute to enforce job timeouts.
 *
 * Handles two types of timeouts:
 * 1. Assigned jobs older than 30 seconds: Re-dispatch to find a new driver
 * 2. Pending jobs older than 5 minutes: Cancel with 'no_drivers' reason
 */
export const enforceTimeouts = functions.pubsub
  .schedule("every 1 minutes")
  .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    functions.logger.info("Running enforceTimeouts scheduler");

    // Calculate cutoff timestamps
    const assignedCutoff = new Date(
      now.toMillis() - TIMEOUT_CONFIG.ASSIGNED_TIMEOUT_SECONDS * 1000
    );
    const pendingCutoff = new Date(
      now.toMillis() - TIMEOUT_CONFIG.PENDING_TIMEOUT_MINUTES * 60 * 1000
    );

    // Process both timeout types in parallel
    const [assignedResults, pendingResults] = await Promise.all([
      handleAssignedTimeouts(db, assignedCutoff),
      handlePendingTimeouts(db, pendingCutoff),
    ]);

    functions.logger.info("enforceTimeouts completed", {
      assignedJobsProcessed: assignedResults.processed,
      assignedJobsRedispatched: assignedResults.redispatched,
      pendingJobsProcessed: pendingResults.processed,
      pendingJobsCancelled: pendingResults.cancelled,
    });

    return null;
  });

/**
 * Handle assigned jobs that have exceeded the 30-second timeout.
 * Attempts to re-dispatch them to a different driver.
 *
 * @param db - Firestore database instance
 * @param cutoffTime - Jobs assigned before this time are considered timed out
 * @returns Object with counts of processed and redispatched jobs
 */
async function handleAssignedTimeouts(
  db: FirebaseFirestore.Firestore,
  cutoffTime: Date
): Promise<{ processed: number; redispatched: number }> {
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffTime);

  // Query for assigned jobs older than 30 seconds
  const assignedJobsSnapshot = await db
    .collection("jobs")
    .where("status", "==", "assigned")
    .where("assignedAt", "<", cutoffTimestamp)
    .get();

  let processed = 0;
  let redispatched = 0;

  for (const doc of assignedJobsSnapshot.docs) {
    const jobData = doc.data() as Omit<Job, "id">;
    const jobId = doc.id;
    processed++;

    functions.logger.info(`Processing timed-out assigned job: ${jobId}`, {
      assignedAt: jobData.assignedAt?.toDate(),
      currentDriverId: jobData.driverId,
    });

    try {
      // Release the current driver
      if (jobData.driverId) {
        await releaseDriver(db, jobData.driverId);
      }

      // Try to find a new driver (excluding the previous one)
      const { driver: newDriver } = await findBestDriver(
        jobData.pickupLocation,
        jobData.vehicleCategory
      );

      if (newDriver && newDriver.id !== jobData.driverId) {
        // Assign to the new driver
        const batch = db.batch();

        batch.update(doc.ref, {
          status: "assigned",
          driverId: newDriver.id,
          assignedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          previousDriverId: jobData.driverId,
          redispatchCount: admin.firestore.FieldValue.increment(1),
        });

        const newDriverRef = db.collection("drivers").doc(newDriver.id);
        batch.update(newDriverRef, {
          currentJobId: jobId,
          isAvailable: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();

        functions.logger.info(`Job ${jobId} re-dispatched to driver ${newDriver.id}`);
        redispatched++;
      } else {
        // No new driver found, set back to pending for retry
        await doc.ref.update({
          status: "pending",
          driverId: admin.firestore.FieldValue.delete(),
          assignedAt: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          dispatchError: "no_driver_available_on_redispatch",
          previousDriverId: jobData.driverId,
        });

        functions.logger.warn(`Job ${jobId} set to pending - no new driver available`);
      }
    } catch (error) {
      functions.logger.error(`Error re-dispatching job ${jobId}:`, error);
    }
  }

  return { processed, redispatched };
}

/**
 * Handle pending jobs that have exceeded the 5-minute timeout.
 * Cancels them with 'no_drivers' reason.
 *
 * @param db - Firestore database instance
 * @param cutoffTime - Jobs created before this time are considered timed out
 * @returns Object with counts of processed and cancelled jobs
 */
async function handlePendingTimeouts(
  db: FirebaseFirestore.Firestore,
  cutoffTime: Date
): Promise<{ processed: number; cancelled: number }> {
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffTime);

  // Query for pending jobs older than 5 minutes
  const pendingJobsSnapshot = await db
    .collection("jobs")
    .where("status", "==", "pending")
    .where("createdAt", "<", cutoffTimestamp)
    .get();

  let processed = 0;
  let cancelled = 0;

  for (const doc of pendingJobsSnapshot.docs) {
    const jobData = doc.data() as Omit<Job, "id">;
    const jobId = doc.id;
    processed++;

    functions.logger.info(`Cancelling timed-out pending job: ${jobId}`, {
      createdAt: jobData.createdAt?.toDate(),
      age: `${Math.round((Date.now() - jobData.createdAt.toMillis()) / 60000)} minutes`,
    });

    try {
      await doc.ref.update({
        status: "cancelled",
        cancelReason: "no_drivers",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Job ${jobId} cancelled due to timeout - no drivers available`);
      cancelled++;

      // Send notification to rider about cancellation
      await notifyRiderOfCancellation(db, jobData.riderId, jobId);
    } catch (error) {
      functions.logger.error(`Error cancelling job ${jobId}:`, error);
    }
  }

  return { processed, cancelled };
}

/**
 * Releases a driver by clearing their current job and making them available.
 *
 * @param db - Firestore database instance
 * @param driverId - The driver's document ID
 */
async function releaseDriver(
  db: FirebaseFirestore.Firestore,
  driverId: string
): Promise<void> {
  const driverRef = db.collection("drivers").doc(driverId);

  await driverRef.update({
    currentJobId: admin.firestore.FieldValue.delete(),
    isAvailable: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  functions.logger.info(`Released driver ${driverId}`);
}

/**
 * Sends a notification to the rider about job cancellation.
 *
 * @param db - Firestore database instance
 * @param riderId - The rider's document ID
 * @param jobId - The cancelled job's document ID
 */
async function notifyRiderOfCancellation(
  db: FirebaseFirestore.Firestore,
  riderId: string,
  jobId: string
): Promise<void> {
  try {
    const riderDoc = await db.collection("riders").doc(riderId).get();
    const riderData = riderDoc.data();

    if (!riderData?.fcmToken) {
      functions.logger.warn(`No FCM token found for rider ${riderId}`);
      return;
    }

    const message: admin.messaging.Message = {
      token: riderData.fcmToken as string,
      notification: {
        title: "Ride Unavailable",
        body: "Sorry, no drivers are available in your area. Please try again later.",
      },
      data: {
        type: "job_cancelled",
        jobId: jobId,
        reason: "no_drivers",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "ride_updates",
          priority: "high",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: "Ride Unavailable",
              body: "Sorry, no drivers are available in your area. Please try again later.",
            },
            sound: "default",
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    functions.logger.info(`Cancellation notification sent to rider ${riderId}`, {
      messageId: response,
      jobId: jobId,
    });
  } catch (error) {
    functions.logger.error(`Failed to notify rider ${riderId}:`, error);
  }
}
