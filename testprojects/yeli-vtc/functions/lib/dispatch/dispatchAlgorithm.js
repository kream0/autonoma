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
exports.calculateDistanceKm = calculateDistanceKm;
exports.findBestDriver = findBestDriver;
exports.findNearestDrivers = findNearestDrivers;
const admin = __importStar(require("firebase-admin"));
/**
 * Configuration constants for the dispatch algorithm
 */
const DISPATCH_CONFIG = {
    MAX_DISTANCE_KM: 10,
    MIN_RATING: 4.0,
    MIN_BATTERY_PERCENT: 20,
    EARTH_RADIUS_KM: 6371,
};
/**
 * Calculates the distance between two geographic points using the Haversine formula.
 * @param point1 - First location (lat/lng)
 * @param point2 - Second location (lat/lng)
 * @returns Distance in kilometers
 */
function calculateDistanceKm(point1, point2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const lat1Rad = toRadians(point1.lat);
    const lat2Rad = toRadians(point2.lat);
    const deltaLat = toRadians(point2.lat - point1.lat);
    const deltaLng = toRadians(point2.lng - point1.lng);
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return DISPATCH_CONFIG.EARTH_RADIUS_KM * c;
}
/**
 * Finds the best available driver for a given pickup location and vehicle category.
 *
 * Algorithm:
 * 1. Query all available drivers with matching vehicle category
 * 2. Filter drivers within 10km of pickup location
 * 3. Filter drivers with rating >= 4.0
 * 4. Filter drivers with battery > 20%
 * 5. Sort by distance (ascending)
 * 6. Return the nearest driver
 *
 * @param pickupLocation - The pickup location (lat/lng)
 * @param vehicleCategory - The requested vehicle category
 * @returns Object containing the best driver (or null) and all valid candidates
 */
async function findBestDriver(pickupLocation, vehicleCategory) {
    const db = admin.firestore();
    // Query available drivers with matching vehicle category
    const driversSnapshot = await db
        .collection("drivers")
        .where("isAvailable", "==", true)
        .where("vehicleCategory", "==", vehicleCategory)
        .get();
    if (driversSnapshot.empty) {
        return { driver: null, candidates: [] };
    }
    // Process drivers: calculate distance and apply filters
    const candidates = [];
    for (const doc of driversSnapshot.docs) {
        const data = doc.data();
        const driver = {
            id: doc.id,
            name: data.name || "",
            location: {
                lat: data.location?.lat || 0,
                lng: data.location?.lng || 0,
            },
            vehicleCategory: data.vehicleCategory,
            rating: data.rating || 0,
            batteryLevel: data.batteryLevel || 0,
            isAvailable: data.isAvailable,
            updatedAt: data.updatedAt,
        };
        // Calculate distance from pickup location
        const distanceKm = calculateDistanceKm(pickupLocation, driver.location);
        // Apply filters:
        // 1. Within 10km radius
        if (distanceKm > DISPATCH_CONFIG.MAX_DISTANCE_KM) {
            continue;
        }
        // 2. Rating >= 4.0
        if (driver.rating < DISPATCH_CONFIG.MIN_RATING) {
            continue;
        }
        // 3. Battery > 20%
        if (driver.batteryLevel <= DISPATCH_CONFIG.MIN_BATTERY_PERCENT) {
            continue;
        }
        candidates.push({
            ...driver,
            distanceKm,
        });
    }
    // Sort candidates by distance (nearest first)
    candidates.sort((a, b) => a.distanceKm - b.distanceKm);
    // Return the nearest driver (first in sorted list)
    return {
        driver: candidates.length > 0 ? candidates[0] : null,
        candidates,
    };
}
/**
 * Finds multiple available drivers for a given location and category.
 * Useful for showing rider multiple driver options.
 *
 * @param pickupLocation - The pickup location (lat/lng)
 * @param vehicleCategory - The requested vehicle category
 * @param limit - Maximum number of drivers to return (default: 5)
 * @returns Array of drivers sorted by distance
 */
async function findNearestDrivers(pickupLocation, vehicleCategory, limit = 5) {
    const result = await findBestDriver(pickupLocation, vehicleCategory);
    return result.candidates.slice(0, limit);
}
//# sourceMappingURL=dispatchAlgorithm.js.map