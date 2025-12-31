/**
 * History service for ride history management
 * Handles retrieval of past rides with pagination
 */

import {
  doc,
  collection,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  getDocs,
  getDoc,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Job } from '../../types/ride';

/**
 * Result of ride history query
 */
export interface RideHistoryResult {
  success: boolean;
  rides: Job[];
  hasMore: boolean;
  lastDoc?: QueryDocumentSnapshot<DocumentData>;
  error?: string;
}

/**
 * Result of ride details query
 */
export interface RideDetailsResult {
  success: boolean;
  job?: Job;
  error?: string;
}

/**
 * Pagination cursor for ride history
 */
let lastVisibleDoc: QueryDocumentSnapshot<DocumentData> | null = null;

/**
 * Get paginated ride history for a user
 * Queries the jobs collection filtered by customer ID
 * @param userId - The user ID to get ride history for
 * @param limit - Maximum number of rides to return (default: 10)
 * @param offset - Number of rides to skip (used for pagination cursor reset)
 * @returns Result containing array of jobs with ride information
 */
export async function getRideHistory(
  userId: string,
  limit: number = 10,
  offset: number = 0
): Promise<RideHistoryResult> {
  try {
    if (!userId) {
      return {
        success: false,
        rides: [],
        hasMore: false,
        error: 'User ID is required',
      };
    }

    // Reset cursor if offset is 0 (starting fresh)
    if (offset === 0) {
      lastVisibleDoc = null;
    }

    const jobsRef = collection(db, 'jobs');

    // Build query with filters
    let historyQuery;

    if (lastVisibleDoc && offset > 0) {
      // Paginated query - start after the last document
      historyQuery = query(
        jobsRef,
        where('ride.customerId', '==', userId),
        orderBy('ride.createdAt', 'desc'),
        startAfter(lastVisibleDoc),
        firestoreLimit(limit + 1) // Fetch one extra to check if there are more
      );
    } else {
      // Initial query
      historyQuery = query(
        jobsRef,
        where('ride.customerId', '==', userId),
        orderBy('ride.createdAt', 'desc'),
        firestoreLimit(limit + 1) // Fetch one extra to check if there are more
      );
    }

    const snapshot = await getDocs(historyQuery);

    if (snapshot.empty) {
      return {
        success: true,
        rides: [],
        hasMore: false,
      };
    }

    const docs = snapshot.docs;
    const hasMore = docs.length > limit;

    // Remove the extra document used for hasMore check
    const resultDocs = hasMore ? docs.slice(0, limit) : docs;

    // Update the cursor for next pagination
    if (resultDocs.length > 0) {
      lastVisibleDoc = resultDocs[resultDocs.length - 1];
    }

    const rides: Job[] = resultDocs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Job[];

    return {
      success: true,
      rides,
      hasMore,
      lastDoc: lastVisibleDoc || undefined,
    };
  } catch (error) {
    console.error('[HistoryService] Error getting ride history:', error);
    return {
      success: false,
      rides: [],
      hasMore: false,
      error: error instanceof Error ? error.message : 'Failed to get ride history',
    };
  }
}

/**
 * Get detailed information for a specific ride
 * @param rideId - The ID of the ride/job to get details for
 * @returns Result containing job with full ride information
 */
export async function getRideDetails(rideId: string): Promise<RideDetailsResult> {
  try {
    if (!rideId) {
      return {
        success: false,
        error: 'Ride ID is required',
      };
    }

    // Try to get the job document directly
    const jobRef = doc(db, 'jobs', rideId);
    const jobSnapshot = await getDoc(jobRef);

    if (jobSnapshot.exists()) {
      const jobData = {
        id: jobSnapshot.id,
        ...jobSnapshot.data(),
      } as Job;

      return {
        success: true,
        job: jobData,
      };
    }

    // If not found by ID, try querying by rideId field
    const jobsRef = collection(db, 'jobs');
    const jobQuery = query(
      jobsRef,
      where('rideId', '==', rideId),
      firestoreLimit(1)
    );

    const querySnapshot = await getDocs(jobQuery);

    if (querySnapshot.empty) {
      return {
        success: false,
        error: 'Ride not found',
      };
    }

    const docSnapshot = querySnapshot.docs[0];
    const jobData = {
      id: docSnapshot.id,
      ...docSnapshot.data(),
    } as Job;

    return {
      success: true,
      job: jobData,
    };
  } catch (error) {
    console.error('[HistoryService] Error getting ride details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get ride details',
    };
  }
}

/**
 * Reset pagination cursor
 * Call this when you want to start fetching from the beginning
 */
export function resetPaginationCursor(): void {
  lastVisibleDoc = null;
}
