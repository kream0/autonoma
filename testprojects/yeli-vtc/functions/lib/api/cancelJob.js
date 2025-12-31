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
exports.cancelJob = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/**
 * POST endpoint to cancel a job.
 *
 * Request body:
 * - jobId: The job ID to cancel
 * - reason: Reason for cancellation
 *
 * Validates ownership, updates status to 'cancelled',
 * notifies driver if assigned, and resets driver status.
 */
exports.cancelJob = functions.https.onRequest(async (req, res) => {
    // Only allow POST requests
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    // Validate request body
    const { jobId, reason } = req.body;
    if (!jobId || typeof jobId !== "string") {
        res.status(400).json({ error: "Missing or invalid jobId" });
        return;
    }
    if (!reason || typeof reason !== "string") {
        res.status(400).json({ error: "Missing or invalid reason" });
        return;
    }
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
        return;
    }
    const idToken = authHeader.split("Bearer ")[1];
    let decodedToken;
    try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
    }
    catch (error) {
        functions.logger.error("Token verification failed:", error);
        res.status(401).json({ error: "Unauthorized: Invalid token" });
        return;
    }
    const userId = decodedToken.uid;
    const db = admin.firestore();
    try {
        // Get the job document
        const jobRef = db.collection("jobs").doc(jobId);
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        const jobData = jobDoc.data();
        // Validate ownership - user must be the rider who created the job
        if (jobData?.riderId !== userId) {
            res.status(403).json({ error: "Forbidden: You can only cancel your own jobs" });
            return;
        }
        // Check if job can be cancelled
        const currentStatus = jobData?.status;
        if (currentStatus === "cancelled") {
            res.status(400).json({ error: "Job is already cancelled" });
            return;
        }
        if (currentStatus === "completed") {
            res.status(400).json({ error: "Cannot cancel a completed job" });
            return;
        }
        if (currentStatus === "in_progress") {
            res.status(400).json({ error: "Cannot cancel a job that is in progress" });
            return;
        }
        const assignedDriverId = jobData?.driverId;
        // Use batch to update job and driver atomically
        const batch = db.batch();
        // Update job status to cancelled
        batch.update(jobRef, {
            status: "cancelled",
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancelReason: reason,
            cancelledBy: userId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // If a driver was assigned, reset their status
        if (assignedDriverId) {
            const driverRef = db.collection("drivers").doc(assignedDriverId);
            batch.update(driverRef, {
                currentJobId: admin.firestore.FieldValue.delete(),
                isAvailable: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();
        functions.logger.info(`Job ${jobId} cancelled by rider ${userId}`, {
            reason,
            driverId: assignedDriverId,
        });
        // Notify driver if one was assigned
        if (assignedDriverId) {
            await notifyDriverOfCancellation(assignedDriverId, jobId, reason);
        }
        const response = {
            success: true,
            message: "Job cancelled successfully",
            jobId,
        };
        res.status(200).json(response);
    }
    catch (error) {
        functions.logger.error(`Error cancelling job ${jobId}:`, error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * Sends an FCM notification to the driver about the job cancellation.
 *
 * @param driverId - The driver's document ID
 * @param jobId - The cancelled job's ID
 * @param reason - The cancellation reason
 */
async function notifyDriverOfCancellation(driverId, jobId, reason) {
    const db = admin.firestore();
    try {
        const driverDoc = await db.collection("drivers").doc(driverId).get();
        const driverData = driverDoc.data();
        if (!driverData?.fcmToken) {
            functions.logger.warn(`No FCM token found for driver ${driverId}`);
            return;
        }
        const fcmToken = driverData.fcmToken;
        const message = {
            token: fcmToken,
            notification: {
                title: "Ride Cancelled",
                body: `Your assigned ride has been cancelled. Reason: ${reason}`,
            },
            data: {
                type: "job_cancelled",
                jobId: jobId,
                reason: reason,
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
                            title: "Ride Cancelled",
                            body: `Your assigned ride has been cancelled. Reason: ${reason}`,
                        },
                        sound: "default",
                        badge: 0,
                    },
                },
            },
        };
        const response = await admin.messaging().send(message);
        functions.logger.info(`Cancellation notification sent to driver ${driverId}`, {
            messageId: response,
            jobId: jobId,
        });
    }
    catch (error) {
        functions.logger.error(`Failed to send cancellation notification to driver ${driverId}:`, error);
    }
}
//# sourceMappingURL=cancelJob.js.map