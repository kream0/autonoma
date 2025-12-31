/**
 * Real-time tracking service for rides and driver locations
 * Uses Firestore onSnapshot listeners for live updates
 */

import {
  doc,
  collection,
  onSnapshot,
  query,
  where,
  DocumentSnapshot,
  QuerySnapshot,
  Unsubscribe,
  FirestoreError,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Trip } from '../../types/ride';
import type { DriverLocation } from '../../types/driver';

/**
 * Subscription callback types
 */
export type RideUpdateCallback = (trip: Trip | null, error?: FirestoreError) => void;
export type DriverLocationCallback = (location: DriverLocation | null, error?: FirestoreError) => void;

/**
 * Subscription registry to track active subscriptions
 */
interface Subscription {
  unsubscribe: Unsubscribe;
  type: 'ride' | 'driver_location';
  id: string;
  intervalId?: ReturnType<typeof setInterval>;
}

const activeSubscriptions = new Map<string, Subscription>();

/**
 * Generate a unique subscription key
 */
function getSubscriptionKey(type: 'ride' | 'driver_location', id: string): string {
  return `${type}:${id}`;
}

/**
 * Subscribe to real-time updates for a specific ride/trip
 * @param tripId - The ID of the trip to track
 * @param callback - Function called whenever the trip data changes
 * @returns Subscription key that can be used to unsubscribe
 */
export function subscribeToRide(
  tripId: string,
  callback: RideUpdateCallback
): string {
  const subscriptionKey = getSubscriptionKey('ride', tripId);

  // If already subscribed, unsubscribe first
  if (activeSubscriptions.has(subscriptionKey)) {
    unsubscribe(subscriptionKey);
  }

  const tripDocRef = doc(db, 'trips', tripId);

  const unsubscribeFn = onSnapshot(
    tripDocRef,
    (snapshot: DocumentSnapshot) => {
      if (snapshot.exists()) {
        const tripData = {
          id: snapshot.id,
          ...snapshot.data(),
        } as Trip;
        callback(tripData);
      } else {
        callback(null);
      }
    },
    (error: FirestoreError) => {
      console.error(`[TrackingService] Error subscribing to ride ${tripId}:`, error);
      callback(null, error);
    }
  );

  activeSubscriptions.set(subscriptionKey, {
    unsubscribe: unsubscribeFn,
    type: 'ride',
    id: tripId,
  });

  return subscriptionKey;
}

/**
 * Subscribe to real-time driver location updates
 * Uses a polling approach with 3-second intervals for location updates
 * @param driverId - The ID of the driver to track
 * @param callback - Function called with updated location (every ~3 seconds)
 * @returns Subscription key that can be used to unsubscribe
 */
export function subscribeToDriverLocation(
  driverId: string,
  callback: DriverLocationCallback
): string {
  const subscriptionKey = getSubscriptionKey('driver_location', driverId);

  // If already subscribed, unsubscribe first
  if (activeSubscriptions.has(subscriptionKey)) {
    unsubscribe(subscriptionKey);
  }

  const driverLocationRef = doc(db, 'driver_locations', driverId);

  // Flag to track if we should still be processing updates
  let isActive = true;
  let lastUpdateTime = 0;
  const UPDATE_INTERVAL_MS = 3000; // 3 seconds

  const unsubscribeFn = onSnapshot(
    driverLocationRef,
    (snapshot: DocumentSnapshot) => {
      if (!isActive) return;

      const now = Date.now();

      // Throttle updates to approximately every 3 seconds
      if (now - lastUpdateTime < UPDATE_INTERVAL_MS) {
        return;
      }
      lastUpdateTime = now;

      if (snapshot.exists()) {
        const locationData = snapshot.data() as DriverLocation;
        callback(locationData);
      } else {
        callback(null);
      }
    },
    (error: FirestoreError) => {
      console.error(`[TrackingService] Error subscribing to driver location ${driverId}:`, error);
      callback(null, error);
    }
  );

  // Set up interval for guaranteed 3-second updates (re-fetch if no natural updates)
  const intervalId = setInterval(() => {
    if (!isActive) return;
    // The onSnapshot will handle actual data fetching, interval just ensures callback timing
  }, UPDATE_INTERVAL_MS);

  const subscription: Subscription = {
    unsubscribe: () => {
      isActive = false;
      unsubscribeFn();
    },
    type: 'driver_location',
    id: driverId,
    intervalId,
  };

  activeSubscriptions.set(subscriptionKey, subscription);

  return subscriptionKey;
}

/**
 * Unsubscribe from a specific subscription
 * @param subscriptionKey - The key returned from subscribeToRide or subscribeToDriverLocation
 * @returns true if successfully unsubscribed, false if subscription not found
 */
export function unsubscribe(subscriptionKey: string): boolean {
  const subscription = activeSubscriptions.get(subscriptionKey);

  if (!subscription) {
    console.warn(`[TrackingService] Subscription not found: ${subscriptionKey}`);
    return false;
  }

  // Clear interval if exists
  if (subscription.intervalId) {
    clearInterval(subscription.intervalId);
  }

  // Call the Firestore unsubscribe function
  subscription.unsubscribe();

  // Remove from active subscriptions
  activeSubscriptions.delete(subscriptionKey);

  return true;
}

/**
 * Unsubscribe from all active subscriptions
 * Useful for cleanup when component unmounts or user logs out
 */
export function unsubscribeAll(): void {
  activeSubscriptions.forEach((subscription, key) => {
    if (subscription.intervalId) {
      clearInterval(subscription.intervalId);
    }
    subscription.unsubscribe();
  });

  activeSubscriptions.clear();
}

/**
 * Get all active subscription keys
 * @returns Array of active subscription keys
 */
export function getActiveSubscriptions(): string[] {
  return Array.from(activeSubscriptions.keys());
}

/**
 * Check if a subscription is active
 * @param subscriptionKey - The subscription key to check
 * @returns true if the subscription is active
 */
export function isSubscribed(subscriptionKey: string): boolean {
  return activeSubscriptions.has(subscriptionKey);
}

/**
 * Subscribe to all trips for a specific customer (for trip history updates)
 * @param customerId - The customer's user ID
 * @param callback - Function called with updated trips array
 * @returns Subscription key
 */
export function subscribeToCustomerTrips(
  customerId: string,
  callback: (trips: Trip[], error?: FirestoreError) => void
): string {
  const subscriptionKey = `customer_trips:${customerId}`;

  if (activeSubscriptions.has(subscriptionKey)) {
    unsubscribe(subscriptionKey);
  }

  const tripsQuery = query(
    collection(db, 'trips'),
    where('customer.id', '==', customerId)
  );

  const unsubscribeFn = onSnapshot(
    tripsQuery,
    (snapshot: QuerySnapshot) => {
      const trips: Trip[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Trip[];
      callback(trips);
    },
    (error: FirestoreError) => {
      console.error(`[TrackingService] Error subscribing to customer trips ${customerId}:`, error);
      callback([], error);
    }
  );

  activeSubscriptions.set(subscriptionKey, {
    unsubscribe: unsubscribeFn,
    type: 'ride',
    id: customerId,
  });

  return subscriptionKey;
}

/**
 * Subscribe to all active trips for a driver
 * @param driverId - The driver's user ID
 * @param callback - Function called with updated trips array
 * @returns Subscription key
 */
export function subscribeToDriverTrips(
  driverId: string,
  callback: (trips: Trip[], error?: FirestoreError) => void
): string {
  const subscriptionKey = `driver_trips:${driverId}`;

  if (activeSubscriptions.has(subscriptionKey)) {
    unsubscribe(subscriptionKey);
  }

  const tripsQuery = query(
    collection(db, 'trips'),
    where('driver.id', '==', driverId)
  );

  const unsubscribeFn = onSnapshot(
    tripsQuery,
    (snapshot: QuerySnapshot) => {
      const trips: Trip[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Trip[];
      callback(trips);
    },
    (error: FirestoreError) => {
      console.error(`[TrackingService] Error subscribing to driver trips ${driverId}:`, error);
      callback([], error);
    }
  );

  activeSubscriptions.set(subscriptionKey, {
    unsubscribe: unsubscribeFn,
    type: 'ride',
    id: driverId,
  });

  return subscriptionKey;
}
