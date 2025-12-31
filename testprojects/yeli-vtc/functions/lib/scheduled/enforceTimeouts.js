"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceTimeouts = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const dispatchAlgorithm_1 = require("../dispatch/dispatchAlgorithm");
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
 * Scheduled function that runs every minute to enforce job timeouts.
 *
 * Handles two types of timeouts:
 * 1. Assigned jobs older than 30 seconds: Re-dispatch to find a new driver
 * 2. Pending jobs older than 5 minutes: Cancel with 'no_drivers' reason
 */
exports.enforceTimeouts = functions.pubsub
    .schedule("every 1 minutes")
    .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    functions.logger.info("Running enforceTimeouts scheduler");
    // Calculate cutoff timestamps
    const assignedCutoff = new Date(now.toMillis() - TIMEOUT_CONFIG.ASSIGNED_TIMEOUT_SECONDS * 1000);
    const pendingCutoff = new Date(now.toMillis() - TIMEOUT_CONFIG.PENDING_TIMEOUT_MINUTES * 60 * 1000);
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
async function handleAssignedTimeouts(db, cutoffTime) {
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
        const jobData = doc.data();
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
            const { driver: newDriver } = await (0, dispatchAlgorithm_1.findBestDriver)(jobData.pickupLocation, jobData.vehicleCategory);
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
            }
            else {
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
        }
        catch (error) {
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
async function handlePendingTimeouts(db, cutoffTime) {
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
        const jobData = doc.data();
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
        }
        catch (error) {
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
async function releaseDriver(db, driverId) {
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
async function notifyRiderOfCancellation(db, riderId, jobId) {
    try {
        const riderDoc = await db.collection("riders").doc(riderId).get();
        const riderData = riderDoc.data();
        if (!riderData?.fcmToken) {
            functions.logger.warn(`No FCM token found for rider ${riderId}`);
            return;
        }
        const message = {
            token: riderData.fcmToken,
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
    }
    catch (error) {
        functions.logger.error(`Failed to notify rider ${riderId}:`, error);
    }
}
//# sourceMappingURL=enforceTimeouts.js.map