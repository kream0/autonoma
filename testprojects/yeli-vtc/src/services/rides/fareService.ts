/**
 * Fare finalization service for computing final trip fares
 * Calculates actual fare based on distance traveled and time
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { PRICING, type VehicleTypeId } from '../../constants';
import type { Trip } from '../../types/ride';

/**
 * Result of fare calculation
 */
export interface FareCalculationResult {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  bookingFee: number;
  surgeAmount: number;
  subtotal: number;
  finalFare: number;
  breakdown: {
    actualDistanceKm: number;
    actualDurationMinutes: number;
    surgeMultiplier: number;
    vehicleType: VehicleTypeId;
  };
}

/**
 * Error thrown when fare calculation fails
 */
export class FareCalculationError extends Error {
  constructor(
    message: string,
    public readonly tripId: string,
    public readonly code: 'TRIP_NOT_FOUND' | 'TRIP_NOT_COMPLETED' | 'MISSING_DATA' | 'UPDATE_FAILED'
  ) {
    super(message);
    this.name = 'FareCalculationError';
  }
}

/**
 * Calculate the duration in minutes between two timestamps
 */
function calculateDurationMinutes(startTime: string, endTime: string): number {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const diffMs = end - start;
  return Math.max(0, Math.round(diffMs / (1000 * 60)));
}

/**
 * Round fare to nearest 50 F CFA for cleaner pricing
 */
function roundFare(amount: number): number {
  return Math.round(amount / 50) * 50;
}

/**
 * Calculate final fare for a completed trip
 * Uses actual distance traveled and actual time elapsed
 *
 * @param tripId - The ID of the trip to calculate fare for
 * @returns Promise resolving to the fare calculation result
 * @throws FareCalculationError if trip not found, not completed, or missing data
 */
export async function calculateFinalFare(tripId: string): Promise<FareCalculationResult> {
  // Fetch the trip from Firestore
  const tripDocRef = doc(db, 'trips', tripId);
  const tripSnapshot = await getDoc(tripDocRef);

  if (!tripSnapshot.exists()) {
    throw new FareCalculationError(
      `Trip not found: ${tripId}`,
      tripId,
      'TRIP_NOT_FOUND'
    );
  }

  const trip = { id: tripSnapshot.id, ...tripSnapshot.data() } as Trip;

  // Validate trip is completed
  if (trip.status !== 'completed' && trip.phase !== 'trip_completed') {
    throw new FareCalculationError(
      `Trip ${tripId} is not completed. Current status: ${trip.status}, phase: ${trip.phase}`,
      tripId,
      'TRIP_NOT_COMPLETED'
    );
  }

  // Get actual distance - use actualDistanceKm if available, otherwise estimated
  const actualDistanceKm = trip.actualDistanceKm ?? trip.estimatedDistanceKm;

  if (actualDistanceKm === undefined || actualDistanceKm === null) {
    throw new FareCalculationError(
      `Trip ${tripId} is missing distance data`,
      tripId,
      'MISSING_DATA'
    );
  }

  // Calculate actual duration
  let actualDurationMinutes: number;

  if (trip.actualDurationMinutes !== undefined && trip.actualDurationMinutes !== null) {
    actualDurationMinutes = trip.actualDurationMinutes;
  } else if (trip.tripStartedAt && trip.tripCompletedAt) {
    actualDurationMinutes = calculateDurationMinutes(trip.tripStartedAt, trip.tripCompletedAt);
  } else {
    // Fall back to estimated duration
    actualDurationMinutes = trip.estimatedDurationMinutes;
  }

  // Get pricing config for vehicle type
  const vehicleType = trip.vehicleType;
  const pricing = PRICING[vehicleType];

  if (!pricing) {
    throw new FareCalculationError(
      `Unknown vehicle type: ${vehicleType}`,
      tripId,
      'MISSING_DATA'
    );
  }

  // Calculate fare components
  const baseFare = pricing.baseFare;
  const distanceFare = actualDistanceKm * pricing.perKmRate;
  const timeFare = actualDurationMinutes * pricing.perMinuteRate;
  const bookingFee = pricing.bookingFee;

  // Calculate subtotal before surge
  const subtotalBeforeSurge = baseFare + distanceFare + timeFare + bookingFee;

  // Apply surge multiplier
  const surgeMultiplier = trip.surgeMultiplier ?? 1.0;
  const surgeableAmount = baseFare + distanceFare + timeFare; // Booking fee not subject to surge
  const surgeAmount = surgeableAmount * (surgeMultiplier - 1);

  // Calculate final fare
  const subtotal = subtotalBeforeSurge + surgeAmount;

  // Apply minimum fare
  const minimumFare = pricing.minimumFare;
  const finalFareBeforeRounding = Math.max(subtotal, minimumFare);

  // Round to nearest 50 F CFA
  const finalFare = roundFare(finalFareBeforeRounding);

  // Prepare result
  const result: FareCalculationResult = {
    baseFare,
    distanceFare: roundFare(distanceFare),
    timeFare: roundFare(timeFare),
    bookingFee,
    surgeAmount: roundFare(surgeAmount),
    subtotal: roundFare(subtotal),
    finalFare,
    breakdown: {
      actualDistanceKm,
      actualDurationMinutes,
      surgeMultiplier,
      vehicleType,
    },
  };

  // Update trip in Firestore with final fare
  try {
    await updateDoc(tripDocRef, {
      finalFare,
      actualDistanceKm,
      actualDurationMinutes,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    throw new FareCalculationError(
      `Failed to update trip ${tripId} with final fare: ${error instanceof Error ? error.message : 'Unknown error'}`,
      tripId,
      'UPDATE_FAILED'
    );
  }

  return result;
}

/**
 * Preview fare calculation without updating Firestore
 * Useful for showing estimated final fare to user before trip completion
 *
 * @param vehicleType - Type of vehicle
 * @param distanceKm - Distance in kilometers
 * @param durationMinutes - Duration in minutes
 * @param surgeMultiplier - Surge pricing multiplier (default 1.0)
 * @returns Fare calculation result
 */
export function previewFare(
  vehicleType: VehicleTypeId,
  distanceKm: number,
  durationMinutes: number,
  surgeMultiplier: number = 1.0
): FareCalculationResult {
  const pricing = PRICING[vehicleType];

  if (!pricing) {
    throw new Error(`Unknown vehicle type: ${vehicleType}`);
  }

  // Calculate fare components
  const baseFare = pricing.baseFare;
  const distanceFare = distanceKm * pricing.perKmRate;
  const timeFare = durationMinutes * pricing.perMinuteRate;
  const bookingFee = pricing.bookingFee;

  // Calculate subtotal before surge
  const subtotalBeforeSurge = baseFare + distanceFare + timeFare + bookingFee;

  // Apply surge multiplier (booking fee not subject to surge)
  const surgeableAmount = baseFare + distanceFare + timeFare;
  const surgeAmount = surgeableAmount * (surgeMultiplier - 1);

  // Calculate final fare
  const subtotal = subtotalBeforeSurge + surgeAmount;

  // Apply minimum fare
  const minimumFare = pricing.minimumFare;
  const finalFareBeforeRounding = Math.max(subtotal, minimumFare);

  // Round to nearest 50 F CFA
  const finalFare = roundFare(finalFareBeforeRounding);

  return {
    baseFare,
    distanceFare: roundFare(distanceFare),
    timeFare: roundFare(timeFare),
    bookingFee,
    surgeAmount: roundFare(surgeAmount),
    subtotal: roundFare(subtotal),
    finalFare,
    breakdown: {
      actualDistanceKm: distanceKm,
      actualDurationMinutes: durationMinutes,
      surgeMultiplier,
      vehicleType,
    },
  };
}

/**
 * Recalculate fare for a trip that may need adjustment
 * (e.g., after dispute resolution or route change)
 *
 * @param tripId - The ID of the trip
 * @param adjustedDistanceKm - Optional adjusted distance
 * @param adjustedDurationMinutes - Optional adjusted duration
 * @returns Promise resolving to the updated fare calculation
 */
export async function recalculateFare(
  tripId: string,
  adjustedDistanceKm?: number,
  adjustedDurationMinutes?: number
): Promise<FareCalculationResult> {
  // Fetch the trip from Firestore
  const tripDocRef = doc(db, 'trips', tripId);
  const tripSnapshot = await getDoc(tripDocRef);

  if (!tripSnapshot.exists()) {
    throw new FareCalculationError(
      `Trip not found: ${tripId}`,
      tripId,
      'TRIP_NOT_FOUND'
    );
  }

  const trip = { id: tripSnapshot.id, ...tripSnapshot.data() } as Trip;

  // Use adjusted values if provided, otherwise use existing values
  const distanceKm = adjustedDistanceKm ?? trip.actualDistanceKm ?? trip.estimatedDistanceKm;
  const durationMinutes = adjustedDurationMinutes ?? trip.actualDurationMinutes ?? trip.estimatedDurationMinutes;

  if (distanceKm === undefined || durationMinutes === undefined) {
    throw new FareCalculationError(
      `Trip ${tripId} is missing required data for fare calculation`,
      tripId,
      'MISSING_DATA'
    );
  }

  // Calculate the fare using preview function
  const result = previewFare(
    trip.vehicleType,
    distanceKm,
    durationMinutes,
    trip.surgeMultiplier ?? 1.0
  );

  // Update trip in Firestore
  try {
    await updateDoc(tripDocRef, {
      finalFare: result.finalFare,
      actualDistanceKm: distanceKm,
      actualDurationMinutes: durationMinutes,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    throw new FareCalculationError(
      `Failed to update trip ${tripId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      tripId,
      'UPDATE_FAILED'
    );
  }

  return result;
}
