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
exports.onDriverStatusChange = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const dispatchAlgorithm_1 = require("../dispatch/dispatchAlgorithm");
/**
 * Configuration for driver status change trigger
 */
const CONFIG = {
    MAX_DISTANCE_KM: 10,
    MIN_RATING: 4.0,
    MIN_BATTERY_PERCENT: 20,
};
/**
 * Firestore onUpdate trigger for drivers collection.
 *
 * When a driver's status changes to 'available':
 * 1. Check for pending jobs in the driver's area
 * 2. Filter jobs matching the driver's vehicle category
 * 3. Auto-assign the nearest pending job if found
 * 4. Send FCM notification to the driver
 */
exports.onDriverStatusChange = functions.firestore
    .document("drivers/{driverId}")
    .onUpdate(async (change, context) => {
    const driverId = context.params.driverId;
    const beforeData = change.before.data();
    const afterData = change.after.data();
    // Only proceed if driver just became available
    const wasAvailable = beforeData.isAvailable === true || beforeData.status === "available";
    const isNowAvailable = afterData.isAvailable === true || afterData.status === "available";
    if (wasAvailable || !isNowAvailable) {
        // Driver was already available or didn't become available
        return { success: false, reason: "no_status_change_to_available" };
    }
    functions.logger.info(`Driver ${driverId} became available`, {
        location: afterData.location,
        vehicleCategory: afterData.vehicleCategory,
    });
    const db = admin.firestore();
    try {
        // Check driver qualifications
        if (afterData.rating < CONFIG.MIN_RATING) {
            functions.logger.info(`Driver ${driverId} rating too low: ${afterData.rating}`);
            return { success: false, reason: "driver_rating_too_low" };
        }
        if (afterData.batteryLevel <= CONFIG.MIN_BATTERY_PERCENT) {
            functions.logger.info(`Driver ${driverId} battery too low: ${afterData.batteryLevel}%`);
            return { success: false, reason: "driver_battery_too_low" };
        }
        // Find pending jobs with matching vehicle category
        const pendingJobsSnapshot = await db
            .collection("jobs")
            .where("status", "==", "pending")
            .where("vehicleCategory", "==", afterData.vehicleCategory)
            .orderBy("createdAt", "asc")
            .get();
        if (pendingJobsSnapshot.empty) {
            functions.logger.info(`No pending jobs for driver ${driverId}`);
            return { success: false, reason: "no_pending_jobs" };
        }
        // Find the nearest pending job within range
        let nearestJob = null;
        let nearestDistance = Infinity;
        for (const doc of pendingJobsSnapshot.docs) {
            const jobData = doc.data();
            const job = {
                id: doc.id,
                riderId: jobData.riderId,
                pickupLocation: {
                    lat: jobData.pickupLocation?.lat || 0,
                    lng: jobData.pickupLocation?.lng || 0,
                },
                dropoffLocation: {
                    lat: jobData.dropoffLocation?.lat || 0,
                    lng: jobData.dropoffLocation?.lng || 0,
                },
                vehicleCategory: jobData.vehicleCategory,
                status: jobData.status,
                createdAt: jobData.createdAt,
            };
            const distanceKm = (0, dispatchAlgorithm_1.calculateDistanceKm)(afterData.location, job.pickupLocation);
            if (distanceKm <= CONFIG.MAX_DISTANCE_KM && distanceKm < nearestDistance) {
                nearestJob = job;
                nearestDistance = distanceKm;
            }
        }
        if (!nearestJob) {
            functions.logger.info(`No pending jobs within range for driver ${driverId}`);
            return { success: false, reason: "no_jobs_in_range" };
        }
        functions.logger.info(`Found pending job ${nearestJob.id} for driver ${driverId}`, {
            distanceKm: nearestDistance,
        });
        // Auto-assign the job using a batch transaction
        const batch = db.batch();
        // Update job status to 'assigned' and set driverId
        const jobRef = db.collection("jobs").doc(nearestJob.id);
        batch.update(jobRef, {
            status: "assigned",
            driverId: driverId,
            assignedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Update driver's currentJobId and availability
        const driverRef = db.collection("drivers").doc(driverId);
        batch.update(driverRef, {
            currentJobId: nearestJob.id,
            isAvailable: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();
        functions.logger.info(`Job ${nearestJob.id} auto-assigned to driver ${driverId}`);
        // Send FCM notification to the driver
        await sendDriverNotification(driverId, nearestJob, afterData.fcmToken);
        return {
            success: true,
            jobId: nearestJob.id,
            distanceKm: nearestDistance,
        };
    }
    catch (error) {
        functions.logger.error(`Error auto-assigning job for driver ${driverId}:`, error);
        throw error;
    }
});
/**
 * Sends an FCM notification to the driver about the auto-assigned job.
 *
 * @param driverId - The driver's document ID
 * @param job - The pending job that was assigned
 * @param fcmToken - The driver's FCM token (optional)
 */
async function sendDriverNotification(driverId, job, fcmToken) {
    if (!fcmToken) {
        // Try to get FCM token from driver document
        const db = admin.firestore();
        const driverDoc = await db.collection("drivers").doc(driverId).get();
        const driverData = driverDoc.data();
        fcmToken = driverData?.fcmToken;
    }
    if (!fcmToken) {
        functions.logger.warn(`No FCM token found for driver ${driverId}`);
        return;
    }
    try {
        const message = {
            token: fcmToken,
            notification: {
                title: "New Ride Assigned",
                body: `A ${job.vehicleCategory} ride has been auto-assigned to you.`,
            },
            data: {
                type: "job_auto_assigned",
                jobId: job.id,
                pickupLat: String(job.pickupLocation.lat),
                pickupLng: String(job.pickupLocation.lng),
                dropoffLat: String(job.dropoffLocation.lat),
                dropoffLng: String(job.dropoffLocation.lng),
                vehicleCategory: job.vehicleCategory,
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "ride_requests",
                    priority: "high",
                    sound: "default",
                },
            },
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title: "New Ride Assigned",
                            body: `A ${job.vehicleCategory} ride has been auto-assigned to you.`,
                        },
                        sound: "default",
                        badge: 1,
                    },
                },
            },
        };
        const response = await admin.messaging().send(message);
        functions.logger.info(`FCM notification sent to driver ${driverId}`, {
            messageId: response,
            jobId: job.id,
        });
    }
    catch (error) {
        // Log but don't fail the auto-assignment if notification fails
        functions.logger.error(`Failed to send FCM notification to driver ${driverId}:`, error);
    }
}
//# sourceMappingURL=onDriverStatusChange.js.map