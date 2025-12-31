/**
 * Job service for driver job management
 * Handles job acceptance and declination by drivers
 */

import {
  doc,
  collection,
  addDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Job, Trip, Ride } from '../../types/ride';
import type { Driver } from '../../types/driver';
import type { User } from '../../types/user';
import { TRIP_STATUS, DRIVER_STATUS } from '../../constants';

/**
 * Result of job acceptance
 */
export interface AcceptJobResult {
  success: boolean;
  tripId?: string;
  error?: string;
}

/**
 * Result of job declination
 */
export interface DeclineJobResult {
  success: boolean;
  error?: string;
}

/**
 * Accept a job offer
 * Updates job status to 'accepted', assigns driver, and creates a trip document
 * @param jobId - The ID of the job to accept
 * @param driverId - The ID of the driver accepting the job
 * @returns Result containing tripId on success
 */
export async function acceptJob(
  jobId: string,
  driverId: string
): Promise<AcceptJobResult> {
  try {
    // Validate required parameters
    if (!jobId) {
      return {
        success: false,
        error: 'Job ID is required',
      };
    }

    if (!driverId) {
      return {
        success: false,
        error: 'Driver ID is required',
      };
    }

    // Get the job document
    const jobRef = doc(db, 'jobs', jobId);
    const jobSnapshot = await getDoc(jobRef);

    if (!jobSnapshot.exists()) {
      return {
        success: false,
        error: 'Job not found',
      };
    }

    const jobData = jobSnapshot.data() as Omit<Job, 'id'>;

    // Check if job is still available
    if (jobData.status !== 'pending' && jobData.status !== 'offered') {
      return {
        success: false,
        error: `Job is no longer available (status: ${jobData.status})`,
      };
    }

    // Check if job has expired
    const expiresAt = new Date(jobData.expiresAt);
    if (expiresAt < new Date()) {
      // Update job status to expired
      await updateDoc(jobRef, {
        status: 'expired',
        updatedAt: serverTimestamp(),
      });

      return {
        success: false,
        error: 'Job has expired',
      };
    }

    // Get driver information
    const driverRef = doc(db, 'drivers', driverId);
    const driverSnapshot = await getDoc(driverRef);

    if (!driverSnapshot.exists()) {
      return {
        success: false,
        error: 'Driver not found',
      };
    }

    const driverData = driverSnapshot.data() as Driver;

    // Get customer information from the ride
    const ride = jobData.ride;
    const customerRef = doc(db, 'users', ride.customerId);
    const customerSnapshot = await getDoc(customerRef);

    if (!customerSnapshot.exists()) {
      return {
        success: false,
        error: 'Customer not found',
      };
    }

    const customerData = customerSnapshot.data() as User;

    const now = new Date().toISOString();

    // Update job status to accepted
    await updateDoc(jobRef, {
      status: 'accepted',
      driverId,
      respondedAt: now,
      updatedAt: serverTimestamp(),
    });

    // Create trip document
    const tripData: Omit<Trip, 'id'> = {
      rideId: ride.id,
      customer: {
        id: customerData.id,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        phoneNumber: customerData.phoneNumber,
        profileImageUrl: customerData.profileImageUrl,
      },
      driver: {
        id: driverData.id,
        firstName: driverData.firstName,
        lastName: driverData.lastName,
        phoneNumber: driverData.phoneNumber,
        profileImageUrl: driverData.profileImageUrl,
        vehicle: driverData.vehicle,
        rating: driverData.rating,
      },
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      waypoints: ride.waypoints,
      vehicleType: ride.vehicleType,
      paymentMethod: ride.paymentMethod,
      status: TRIP_STATUS.DRIVER_ASSIGNED,
      phase: 'driver_assigned',
      estimatedFare: ride.estimatedFare,
      estimatedDistanceKm: ride.estimatedDistanceKm,
      estimatedDurationMinutes: ride.estimatedDurationMinutes,
      surgeMultiplier: ride.surgeMultiplier,
      driverLocation: driverData.currentLocation,
      driverAssignedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // Add trip to Firestore
    const tripRef = await addDoc(collection(db, 'trips'), tripData);

    // Update driver status to busy/on_trip
    await updateDoc(driverRef, {
      status: DRIVER_STATUS.BUSY,
      updatedAt: serverTimestamp(),
    });

    console.log(
      `[JobService] Driver ${driverId} accepted job ${jobId}, created trip ${tripRef.id}`
    );

    return {
      success: true,
      tripId: tripRef.id,
    };
  } catch (error) {
    console.error('[JobService] Error accepting job:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept job',
    };
  }
}

/**
 * Decline a job offer
 * Updates job status to 'rejected' for this driver
 * @param jobId - The ID of the job to decline
 * @param driverId - The ID of the driver declining the job
 * @returns Result indicating success or failure
 */
export async function declineJob(
  jobId: string,
  driverId: string
): Promise<DeclineJobResult> {
  try {
    // Validate required parameters
    if (!jobId) {
      return {
        success: false,
        error: 'Job ID is required',
      };
    }

    if (!driverId) {
      return {
        success: false,
        error: 'Driver ID is required',
      };
    }

    // Get the job document
    const jobRef = doc(db, 'jobs', jobId);
    const jobSnapshot = await getDoc(jobRef);

    if (!jobSnapshot.exists()) {
      return {
        success: false,
        error: 'Job not found',
      };
    }

    const jobData = jobSnapshot.data() as Omit<Job, 'id'>;

    // Check if job can be declined
    if (jobData.status === 'accepted') {
      return {
        success: false,
        error: 'Job has already been accepted',
      };
    }

    if (jobData.status === 'expired') {
      return {
        success: false,
        error: 'Job has already expired',
      };
    }

    const now = new Date().toISOString();

    // Update job status to rejected
    await updateDoc(jobRef, {
      status: 'rejected',
      driverId,
      respondedAt: now,
      updatedAt: serverTimestamp(),
    });

    // Record the decline in a separate collection for analytics
    await addDoc(collection(db, 'job_declines'), {
      jobId,
      driverId,
      rideId: jobData.rideId,
      declinedAt: now,
    });

    console.log(`[JobService] Driver ${driverId} declined job ${jobId}`);

    return {
      success: true,
    };
  } catch (error) {
    console.error('[JobService] Error declining job:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to decline job',
    };
  }
}

/**
 * Get job details by ID
 * @param jobId - The ID of the job to retrieve
 * @returns The job data or null if not found
 */
export async function getJob(jobId: string): Promise<Job | null> {
  try {
    if (!jobId) {
      return null;
    }

    const jobRef = doc(db, 'jobs', jobId);
    const jobSnapshot = await getDoc(jobRef);

    if (!jobSnapshot.exists()) {
      return null;
    }

    return {
      id: jobSnapshot.id,
      ...jobSnapshot.data(),
    } as Job;
  } catch (error) {
    console.error('[JobService] Error getting job:', error);
    return null;
  }
}

/**
 * Get pending jobs for a driver (jobs that can be accepted)
 * @param driverId - The ID of the driver
 * @returns Array of available jobs
 */
export async function getPendingJobsForDriver(driverId: string): Promise<Job[]> {
  try {
    if (!driverId) {
      return [];
    }

    const jobsRef = collection(db, 'jobs');
    const pendingQuery = query(
      jobsRef,
      where('status', 'in', ['pending', 'offered']),
      where('driverId', '==', null)
    );

    const snapshot = await getDocs(pendingQuery);
    const now = new Date();

    const jobs: Job[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as Omit<Job, 'id'>;
      // Filter out expired jobs
      if (new Date(data.expiresAt) > now) {
        jobs.push({
          id: doc.id,
          ...data,
        });
      }
    });

    return jobs;
  } catch (error) {
    console.error('[JobService] Error getting pending jobs:', error);
    return [];
  }
}
