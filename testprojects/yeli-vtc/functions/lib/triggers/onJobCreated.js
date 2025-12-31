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
exports.onJobCreated = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const dispatchAlgorithm_1 = require("../dispatch/dispatchAlgorithm");
/**
 * Firestore onCreate trigger for jobs collection.
 *
 * When a new job is created:
 * 1. Calls the dispatch algorithm to find the best available driver
 * 2. Updates the job status to 'assigned' with the driver ID
 * 3. Updates the driver's currentJobId field
 * 4. Sends an FCM notification to the assigned driver
 */
exports.onJobCreated = functions.firestore
    .document("jobs/{jobId}")
    .onCreate(async (snapshot, context) => {
    const jobId = context.params.jobId;
    const jobData = snapshot.data();
    const db = admin.firestore();
    functions.logger.info(`New job created: ${jobId}`, { jobData });
    try {
        // Step 1: Find the best available driver using dispatch algorithm
        const { driver: bestDriver, candidates } = await (0, dispatchAlgorithm_1.findBestDriver)(jobData.pickupLocation, jobData.vehicleCategory);
        if (!bestDriver) {
            functions.logger.warn(`No available driver found for job ${jobId}`, {
                vehicleCategory: jobData.vehicleCategory,
                pickupLocation: jobData.pickupLocation,
                candidateCount: candidates.length,
            });
            // Update job status to indicate no driver available
            await db.collection("jobs").doc(jobId).update({
                status: "pending",
                dispatchError: "no_driver_available",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { success: false, reason: "no_driver_available" };
        }
        functions.logger.info(`Best driver found for job ${jobId}`, {
            driverId: bestDriver.id,
            driverName: bestDriver.name,
            distanceKm: bestDriver.distanceKm,
        });
        // Step 2 & 3: Update job and driver in a batch transaction
        const batch = db.batch();
        // Update job status to 'assigned' and set driverId
        const jobRef = db.collection("jobs").doc(jobId);
        batch.update(jobRef, {
            status: "assigned",
            driverId: bestDriver.id,
            assignedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Update driver's currentJobId and availability
        const driverRef = db.collection("drivers").doc(bestDriver.id);
        batch.update(driverRef, {
            currentJobId: jobId,
            isAvailable: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();
        functions.logger.info(`Job ${jobId} assigned to driver ${bestDriver.id}`);
        // Step 4: Send FCM notification to the driver
        await sendDriverNotification(bestDriver.id, jobId, jobData);
        return {
            success: true,
            driverId: bestDriver.id,
            distanceKm: bestDriver.distanceKm,
        };
    }
    catch (error) {
        functions.logger.error(`Error processing job ${jobId}:`, error);
        // Update job with error status
        await db.collection("jobs").doc(jobId).update({
            dispatchError: error instanceof Error ? error.message : "unknown_error",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw error;
    }
});
/**
 * Sends an FCM notification to the assigned driver about the new job.
 * Includes action buttons for accept/decline functionality.
 *
 * @param driverId - The driver's document ID
 * @param jobId - The job's document ID
 * @param jobData - The job details
 */
async function sendDriverNotification(driverId, jobId, jobData) {
    const db = admin.firestore();
    try {
        // Get driver's FCM token from their document
        const driverDoc = await db.collection("drivers").doc(driverId).get();
        const driverData = driverDoc.data();
        if (!driverData?.fcmToken) {
            functions.logger.warn(`No FCM token found for driver ${driverId}`);
            return;
        }
        const fcmToken = driverData.fcmToken;
        // Format pickup and dropoff addresses for display
        const pickupAddress = jobData.pickupLocation.address ||
            `${jobData.pickupLocation.lat.toFixed(4)}, ${jobData.pickupLocation.lng.toFixed(4)}`;
        const dropoffAddress = jobData.dropoffLocation.address ||
            `${jobData.dropoffLocation.lat.toFixed(4)}, ${jobData.dropoffLocation.lng.toFixed(4)}`;
        // Calculate estimated distance if available
        const estimatedDistance = jobData.pickupLocation.distanceKm
            ? `${jobData.pickupLocation.distanceKm.toFixed(1)} km away`
            : "Nearby";
        // Construct notification body with ride details
        const notificationBody = `${jobData.vehicleCategory.toUpperCase()} • ${estimatedDistance}\nPickup: ${pickupAddress}`;
        // Construct the notification message with action buttons
        const message = {
            token: fcmToken,
            notification: {
                title: "🚗 New Ride Request",
                body: notificationBody,
            },
            data: {
                // Core job data
                type: "new_job",
                jobId: jobId,
                riderId: jobData.riderId,
                // Pickup location details
                pickupLat: String(jobData.pickupLocation.lat),
                pickupLng: String(jobData.pickupLocation.lng),
                pickupAddress: pickupAddress,
                // Dropoff location details
                dropoffLat: String(jobData.dropoffLocation.lat),
                dropoffLng: String(jobData.dropoffLocation.lng),
                dropoffAddress: dropoffAddress,
                // Ride metadata
                vehicleCategory: jobData.vehicleCategory,
                createdAt: jobData.createdAt.toDate().toISOString(),
                // Action identifiers for client-side handling
                acceptAction: "ACCEPT_RIDE",
                declineAction: "DECLINE_RIDE",
                // Click action for notification tap
                clickAction: "OPEN_RIDE_DETAILS",
            },
            android: {
                priority: "high",
                ttl: 60000, // 60 seconds TTL - ride offers expire quickly
                notification: {
                    channelId: "ride_requests",
                    priority: "high",
                    sound: "ride_request.mp3",
                    vibrateTimingsMillis: [0, 250, 250, 250],
                    icon: "ic_car_notification",
                    color: "#4CAF50",
                    tag: `ride_request_${jobId}`, // Allows replacing existing notifications
                    clickAction: "OPEN_RIDE_DETAILS",
                },
                data: {
                    // Android-specific action buttons configuration
                    actions: JSON.stringify([
                        {
                            action: "ACCEPT_RIDE",
                            title: "✓ Accept",
                            icon: "ic_accept",
                        },
                        {
                            action: "DECLINE_RIDE",
                            title: "✗ Decline",
                            icon: "ic_decline",
                        },
                    ]),
                },
            },
            apns: {
                headers: {
                    "apns-priority": "10", // High priority
                    "apns-expiration": String(Math.floor(Date.now() / 1000) + 60), // 60 seconds expiry
                },
                payload: {
                    aps: {
                        alert: {
                            title: "🚗 New Ride Request",
                            body: notificationBody,
                            launchImage: "ride_request_background",
                        },
                        sound: "ride_request.caf",
                        badge: 1,
                        "mutable-content": 1, // Allows notification service extension to modify
                        "content-available": 1, // Enable background processing
                        category: "RIDE_REQUEST", // iOS action category identifier
                    },
                    // Custom data for iOS
                    jobDetails: {
                        jobId: jobId,
                        pickupAddress: pickupAddress,
                        dropoffAddress: dropoffAddress,
                        vehicleCategory: jobData.vehicleCategory,
                    },
                },
                fcmOptions: {
                    imageUrl: "https://yourapp.com/images/ride_request_banner.png",
                },
            },
            webpush: {
                headers: {
                    TTL: "60",
                    Urgency: "high",
                },
                notification: {
                    title: "🚗 New Ride Request",
                    body: notificationBody,
                    icon: "/images/ride_icon.png",
                    badge: "/images/badge.png",
                    tag: `ride_request_${jobId}`,
                    requireInteraction: true, // Keep notification visible until user interacts
                    actions: [
                        {
                            action: "ACCEPT_RIDE",
                            title: "✓ Accept",
                            icon: "/images/accept.png",
                        },
                        {
                            action: "DECLINE_RIDE",
                            title: "✗ Decline",
                            icon: "/images/decline.png",
                        },
                    ],
                },
                fcmOptions: {
                    link: `/driver/ride/${jobId}`,
                },
            },
        };
        const response = await admin.messaging().send(message);
        functions.logger.info(`FCM notification sent to driver ${driverId}`, {
            messageId: response,
            jobId: jobId,
            pickupAddress: pickupAddress,
            dropoffAddress: dropoffAddress,
        });
        // Record notification in Firestore for tracking
        await db.collection("notifications").add({
            type: "ride_offer",
            driverId: driverId,
            jobId: jobId,
            fcmMessageId: response,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "sent",
        });
    }
    catch (error) {
        // Log but don't fail the job assignment if notification fails
        functions.logger.error(`Failed to send FCM notification to driver ${driverId}:`, error);
        // Record failed notification attempt
        const db = admin.firestore();
        await db.collection("notifications").add({
            type: "ride_offer",
            driverId: driverId,
            jobId: jobId,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "failed",
            error: error instanceof Error ? error.message : "unknown_error",
        }).catch((recordError) => {
            functions.logger.error("Failed to record notification failure:", recordError);
        });
    }
}
//# sourceMappingURL=onJobCreated.js.map