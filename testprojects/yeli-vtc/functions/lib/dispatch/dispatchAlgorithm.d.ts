/**
 * Vehicle categories supported by the dispatch system
 */
export type VehicleCategory = "standard" | "premium" | "xl" | "eco";
/**
 * Geographic location with latitude and longitude
 */
export interface Location {
    lat: number;
    lng: number;
    address?: string;
    distanceKm?: number;
}
/**
 * Driver document structure from Firestore
 */
export interface Driver {
    id: string;
    name: string;
    location: Location;
    vehicleCategory: VehicleCategory;
    rating: number;
    batteryLevel: number;
    isAvailable: boolean;
    updatedAt: FirebaseFirestore.Timestamp;
}
/**
 * Driver with calculated distance from pickup location
 */
export interface DriverWithDistance extends Driver {
    distanceKm: number;
}
/**
 * Result of the findBestDriver function
 */
export interface FindBestDriverResult {
    driver: DriverWithDistance | null;
    candidates: DriverWithDistance[];
}
/**
 * Calculates the distance between two geographic points using the Haversine formula.
 * @param point1 - First location (lat/lng)
 * @param point2 - Second location (lat/lng)
 * @returns Distance in kilometers
 */
export declare function calculateDistanceKm(point1: Location, point2: Location): number;
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
export declare function findBestDriver(pickupLocation: Location, vehicleCategory: VehicleCategory): Promise<FindBestDriverResult>;
/**
 * Finds multiple available drivers for a given location and category.
 * Useful for showing rider multiple driver options.
 *
 * @param pickupLocation - The pickup location (lat/lng)
 * @param vehicleCategory - The requested vehicle category
 * @param limit - Maximum number of drivers to return (default: 5)
 * @returns Array of drivers sorted by distance
 */
export declare function findNearestDrivers(pickupLocation: Location, vehicleCategory: VehicleCategory, limit?: number): Promise<DriverWithDistance[]>;
//# sourceMappingURL=dispatchAlgorithm.d.ts.map