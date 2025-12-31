/**
 * ETA Service - Calculate and format estimated time of arrival
 * All output strings are in French
 */

/**
 * Traffic condition levels with their corresponding multipliers
 * Higher multiplier = slower traffic = longer ETA
 */
export const TRAFFIC_MULTIPLIERS = {
  fluide: 1.0,      // Free-flowing traffic
  modere: 1.3,      // Moderate traffic
  dense: 1.6,       // Heavy traffic
  embouteillage: 2.0, // Traffic jam
} as const;

export type TrafficCondition = keyof typeof TRAFFIC_MULTIPLIERS;

/**
 * Average speeds in km/h for different vehicle types
 */
const AVERAGE_SPEEDS = {
  moto: 35,    // Motorcycles can navigate traffic better
  berline: 30, // Standard sedan
  suv: 28,     // Slightly slower due to size
} as const;

export type VehicleType = keyof typeof AVERAGE_SPEEDS;

export interface ETAResult {
  /** ETA in minutes */
  minutes: number;
  /** Formatted ETA string in French */
  formatted: string;
}

/**
 * Calculate the estimated time of arrival
 * @param distanceKm - Distance to destination in kilometers
 * @param vehicleType - Type of vehicle (affects base speed)
 * @param trafficCondition - Current traffic condition (affects multiplier)
 * @returns ETA in minutes
 */
export function calculateETA(
  distanceKm: number,
  vehicleType: VehicleType = 'berline',
  trafficCondition: TrafficCondition = 'fluide'
): number {
  if (distanceKm < 0) {
    return calculateETA(Math.abs(distanceKm), vehicleType, trafficCondition);
  }

  if (distanceKm === 0) {
    return 0;
  }

  const baseSpeed = AVERAGE_SPEEDS[vehicleType];
  const trafficMultiplier = TRAFFIC_MULTIPLIERS[trafficCondition];

  // Effective speed = base speed / traffic multiplier
  const effectiveSpeed = baseSpeed / trafficMultiplier;

  // Time in hours, converted to minutes
  const timeHours = distanceKm / effectiveSpeed;
  const timeMinutes = timeHours * 60;

  // Round to nearest minute, minimum 1 minute for any non-zero distance
  return Math.max(1, Math.round(timeMinutes));
}

/**
 * Format ETA in minutes to a human-readable string in French
 * @param minutes - ETA in minutes
 * @returns Human-readable ETA string in French
 */
export function formatETA(minutes: number): string {
  if (minutes < 0) {
    return formatETA(Math.abs(minutes));
  }

  if (minutes === 0) {
    return 'Arrivée imminente';
  }

  if (minutes === 1) {
    return '1 minute';
  }

  if (minutes < 60) {
    return `${Math.round(minutes)} minutes`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (hours === 1) {
    if (remainingMinutes === 0) {
      return '1 heure';
    }
    if (remainingMinutes === 1) {
      return '1 heure et 1 minute';
    }
    return `1 heure et ${remainingMinutes} minutes`;
  }

  if (remainingMinutes === 0) {
    return `${hours} heures`;
  }

  if (remainingMinutes === 1) {
    return `${hours} heures et 1 minute`;
  }

  return `${hours} heures et ${remainingMinutes} minutes`;
}

/**
 * Calculate and format ETA in one call
 * @param distanceKm - Distance to destination in kilometers
 * @param vehicleType - Type of vehicle
 * @param trafficCondition - Current traffic condition
 * @returns Object with ETA in minutes and formatted French string
 */
export function getETA(
  distanceKm: number,
  vehicleType: VehicleType = 'berline',
  trafficCondition: TrafficCondition = 'fluide'
): ETAResult {
  const minutes = calculateETA(distanceKm, vehicleType, trafficCondition);
  return {
    minutes,
    formatted: formatETA(minutes),
  };
}

/**
 * Get ETA with arrival time
 * @param distanceKm - Distance to destination in kilometers
 * @param vehicleType - Type of vehicle
 * @param trafficCondition - Current traffic condition
 * @returns Formatted string with ETA and estimated arrival time in French
 */
export function getETAWithArrivalTime(
  distanceKm: number,
  vehicleType: VehicleType = 'berline',
  trafficCondition: TrafficCondition = 'fluide'
): string {
  const minutes = calculateETA(distanceKm, vehicleType, trafficCondition);
  const arrivalTime = new Date(Date.now() + minutes * 60 * 1000);

  const timeString = arrivalTime.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (minutes === 0) {
    return 'Arrivée imminente';
  }

  return `${formatETA(minutes)} (arrivée vers ${timeString})`;
}
