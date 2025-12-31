/**
 * Distance utility functions for geographic calculations
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the distance between two geographic points using the Haversine formula
 * @param lat1 - Latitude of point 1 in degrees
 * @param lon1 - Longitude of point 1 in degrees
 * @param lat2 - Latitude of point 2 in degrees
 * @param lon2 - Longitude of point 2 in degrees
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Geographic point with latitude and longitude
 */
export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * Check if a point is within a given radius of a center point
 * @param point - The point to check
 * @param center - The center point
 * @param radiusKm - The radius in kilometers
 * @returns True if the point is within the radius
 */
export function isWithinRadius(
  point: GeoPoint,
  center: GeoPoint,
  radiusKm: number
): boolean {
  const distance = haversineDistance(point.lat, point.lon, center.lat, center.lon);
  return distance <= radiusKm;
}

/**
 * Format a distance in kilometers to a human-readable string
 * @param km - Distance in kilometers
 * @returns Human-readable distance string
 */
export function formatDistance(km: number): string {
  if (km < 0) {
    return formatDistance(Math.abs(km));
  }

  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `${meters} m`;
  }

  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }

  return `${Math.round(km)} km`;
}
