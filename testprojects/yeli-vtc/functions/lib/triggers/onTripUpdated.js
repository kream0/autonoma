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
exports.onTripUpdated = void 0;
const functions = __importStar(require("firebase-functions"));
const fraudDetection_1 = require("../dispatch/fraudDetection");
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
exports.onTripUpdated = functions.firestore
    .document("trips/{tripId}")
    .onUpdate(async (change, context) => {
    const tripId = context.params.tripId;
    const afterData = change.after.data();
    const tripAfter = { id: tripId, ...afterData };
    functions.logger.info(`Trip updated: ${tripId}`, {
        phase: tripAfter.phase,
        positionCount: tripAfter.positions?.length || 0,
    });
    try {
        // Build TripUpdate object for fraud detection
        const tripUpdate = {
            id: tripId,
            driverId: tripAfter.driverId,
            phase: tripAfter.phase,
            positions: tripAfter.positions,
            lastMovementAt: tripAfter.lastMovementAt,
        };
        // Run fraud detection - creates alert if suspicious
        const alert = await (0, fraudDetection_1.detectFraud)(tripUpdate);
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
    }
    catch (error) {
        functions.logger.error(`Error processing trip update ${tripId}:`, error);
        throw error;
    }
});
//# sourceMappingURL=onTripUpdated.js.map