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
exports.detectFraud = detectFraud;
exports.getFraudThresholds = getFraudThresholds;
const admin = __importStar(require("firebase-admin"));
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
async function detectFraud(tripUpdate) {
    // Check for excessive speed in the latest position
    const positions = tripUpdate.positions || [];
    if (positions.length > 0) {
        const latestPosition = positions[positions.length - 1];
        if (latestPosition.speed !== undefined && latestPosition.speed > FRAUD_CONFIG.MAX_SPEED_KMH) {
            const alert = await createAlert(tripUpdate.id, tripUpdate.driverId, "excessive_speed", latestPosition.speed, `Speed of ${latestPosition.speed} km/h exceeds maximum of ${FRAUD_CONFIG.MAX_SPEED_KMH} km/h`);
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
            const alert = await createAlert(tripUpdate.id, tripUpdate.driverId, "excessive_idle", idleTimeMs, `Idle for ${idleMinutes} minutes during active ride (threshold: 10 minutes)`);
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
async function createAlert(tripId, driverId, alertType, value, message) {
    const db = admin.firestore();
    const alert = {
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
function getFraudThresholds() {
    return {
        maxSpeedKmh: FRAUD_CONFIG.MAX_SPEED_KMH,
        maxIdleMinutes: FRAUD_CONFIG.MAX_IDLE_MS / 60000,
    };
}
//# sourceMappingURL=fraudDetection.js.map