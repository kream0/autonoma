/**
 * Booking service for ride management
 * Handles ride creation, cancellation, and status queries
 */

import {
  doc,
  collection,
  addDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Ride, Job, Location } from '../../types/ride';
import type { VehicleTypeId, PaymentMethodId } from '../../constants';

/**
 * Parameters for creating a new ride
 */
export interface CreateRideParams {
  customerId: string;
  pickup: Location;
  dropoff: Location;
  waypoints?: Location[];
  vehicleType: VehicleTypeId;
  paymentMethod: PaymentMethodId;
  estimatedFare: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  surgeMultiplier: number;
  scheduledAt?: string;
}

/**
 * Result of ride creation
 */
export interface CreateRideResult {
  success: boolean;
  rideId?: string;
  jobId?: string;
  error?: string;
}

/**
 * Result of ride cancellation
 */
export interface CancelRideResult {
  success: boolean;
  error?: string;
}

/**
 * Ride status information
 */
export interface RideStatusResult {
  success: boolean;
  ride?: Ride;
  job?: Job;
  error?: string;
}

/**
 * Job expiration time in milliseconds (2 minutes)
 */
const JOB_EXPIRATION_MS = 2 * 60 * 1000;

/**
 * Generate a unique ID for rides/jobs
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new ride and corresponding job in Firestore
 * @param params - Ride creation parameters
 * @returns Result containing rideId and jobId on success
 */
export async function createRide(params: CreateRideParams): Promise<CreateRideResult> {
  try {
    const {
      customerId,
      pickup,
      dropoff,
      waypoints,
      vehicleType,
      paymentMethod,
      estimatedFare,
      estimatedDistanceKm,
      estimatedDurationMinutes,
      surgeMultiplier,
      scheduledAt,
    } = params;

    // Validate required fields
    if (!customerId || !pickup || !dropoff || !vehicleType || !paymentMethod) {
      return {
        success: false,
        error: 'Missing required fields for ride creation',
      };
    }

    const now = new Date().toISOString();
    const rideId = generateId();

    // Create the ride document
    const rideData: Omit<Ride, 'id'> = {
      customerId,
      pickup,
      dropoff,
      waypoints,
      vehicleType,
      paymentMethod,
      estimatedFare,
      estimatedDistanceKm,
      estimatedDurationMinutes,
      surgeMultiplier,
      scheduledAt,
      createdAt: now,
    };

    // Add ride to Firestore
    const rideRef = await addDoc(collection(db, 'rides'), {
      ...rideData,
      id: rideId,
    });

    const actualRideId = rideRef.id;

    // Create the job document for driver matching
    const jobExpiresAt = new Date(Date.now() + JOB_EXPIRATION_MS).toISOString();

    const jobData: Omit<Job, 'id'> = {
      rideId: actualRideId,
      status: 'pending',
      expiresAt: jobExpiresAt,
      ride: {
        id: actualRideId,
        ...rideData,
      },
    };

    // Add job to Firestore jobs collection
    const jobRef = await addDoc(collection(db, 'jobs'), jobData);

    console.log(`[BookingService] Created ride ${actualRideId} with job ${jobRef.id}`);

    return {
      success: true,
      rideId: actualRideId,
      jobId: jobRef.id,
    };
  } catch (error) {
    console.error('[BookingService] Error creating ride:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create ride',
    };
  }
}

/**
 * Cancel an existing ride
 * @param rideId - The ID of the ride to cancel
 * @param reason - Optional cancellation reason
 * @param cancelledBy - Who initiated the cancellation
 * @returns Result indicating success or failure
 */
export async function cancelRide(
  rideId: string,
  reason?: string,
  cancelledBy: 'customer' | 'driver' | 'system' = 'customer'
): Promise<CancelRideResult> {
  try {
    if (!rideId) {
      return {
        success: false,
        error: 'Ride ID is required',
      };
    }

    const rideRef = doc(db, 'rides', rideId);
    const rideSnapshot = await getDoc(rideRef);

    if (!rideSnapshot.exists()) {
      return {
        success: false,
        error: 'Ride not found',
      };
    }

    const now = new Date().toISOString();

    // Update ride with cancellation info
    await updateDoc(rideRef, {
      cancelledAt: now,
      cancellationReason: reason || 'No reason provided',
      cancelledBy,
      updatedAt: serverTimestamp(),
    });

    // Also update the corresponding job if it exists
    // Query for job with matching rideId
    const jobsRef = collection(db, 'jobs');
    const jobQuery = doc(db, 'jobs', rideId); // Jobs might use rideId as their ID

    try {
      const jobSnapshot = await getDoc(jobQuery);
      if (jobSnapshot.exists()) {
        await updateDoc(jobQuery, {
          status: 'expired',
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Job might not exist or use different ID scheme, which is okay
      console.log(`[BookingService] No direct job found for ride ${rideId}`);
    }

    console.log(`[BookingService] Cancelled ride ${rideId} by ${cancelledBy}`);

    return {
      success: true,
    };
  } catch (error) {
    console.error('[BookingService] Error cancelling ride:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel ride',
    };
  }
}

/**
 * Get the current status of a ride
 * @param rideId - The ID of the ride to check
 * @returns Result containing ride and job information
 */
export async function getRideStatus(rideId: string): Promise<RideStatusResult> {
  try {
    if (!rideId) {
      return {
        success: false,
        error: 'Ride ID is required',
      };
    }

    // Get the ride document
    const rideRef = doc(db, 'rides', rideId);
    const rideSnapshot = await getDoc(rideRef);

    if (!rideSnapshot.exists()) {
      return {
        success: false,
        error: 'Ride not found',
      };
    }

    const rideData = {
      id: rideSnapshot.id,
      ...rideSnapshot.data(),
    } as Ride;

    // Try to get the associated job
    let jobData: Job | undefined;

    try {
      // First try using rideId as job reference
      const jobRef = doc(db, 'jobs', rideId);
      const jobSnapshot = await getDoc(jobRef);

      if (jobSnapshot.exists()) {
        jobData = {
          id: jobSnapshot.id,
          ...jobSnapshot.data(),
        } as Job;
      }
    } catch {
      // Job lookup failed, continue without job data
      console.log(`[BookingService] Could not fetch job for ride ${rideId}`);
    }

    return {
      success: true,
      ride: rideData,
      job: jobData,
    };
  } catch (error) {
    console.error('[BookingService] Error getting ride status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get ride status',
    };
  }
}
