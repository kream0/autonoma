/**
 * Ride Context - State machine for ride phases with Firestore listeners
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {
  doc,
  onSnapshot,
  updateDoc,
  Unsubscribe,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Trip, Location, DriverLocation } from '../types/ride';
import type { Driver } from '../types/driver';

/**
 * Ride phase state machine states
 */
export type RidePhase =
  | 'idle'
  | 'going_to_pickup'
  | 'at_pickup'
  | 'in_ride'
  | 'completing'
  | 'completed';

/**
 * Ride state interface
 */
export interface RideState {
  phase: RidePhase;
  currentRide: Trip | null;
  driver: Pick<Driver, 'id' | 'firstName' | 'lastName' | 'phoneNumber' | 'profileImageUrl' | 'vehicle' | 'rating'> | null;
  driverLocation: DriverLocation | null;
  etaMinutes: number | null;
  pickup: Location | null;
  dropoff: Location | null;
  loading: boolean;
  error: string | null;
}

/**
 * State machine transitions
 */
const VALID_TRANSITIONS: Record<RidePhase, RidePhase[]> = {
  idle: ['going_to_pickup'],
  going_to_pickup: ['at_pickup', 'idle'], // can cancel back to idle
  at_pickup: ['in_ride', 'idle'], // can cancel back to idle
  in_ride: ['completing', 'idle'], // can cancel back to idle
  completing: ['completed', 'idle'],
  completed: ['idle'],
};

/**
 * Action types for reducer
 */
type RideAction =
  | { type: 'SET_RIDE'; payload: Trip }
  | { type: 'UPDATE_RIDE'; payload: Partial<Trip> }
  | { type: 'CLEAR_RIDE' }
  | { type: 'SET_PHASE'; payload: RidePhase }
  | { type: 'SET_DRIVER'; payload: RideState['driver'] }
  | { type: 'SET_DRIVER_LOCATION'; payload: DriverLocation }
  | { type: 'SET_ETA'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET' };

const initialState: RideState = {
  phase: 'idle',
  currentRide: null,
  driver: null,
  driverLocation: null,
  etaMinutes: null,
  pickup: null,
  dropoff: null,
  loading: false,
  error: null,
};

/**
 * Map trip phase from Firestore to local ride phase
 */
function mapTripPhaseToRidePhase(tripPhase: Trip['phase']): RidePhase {
  switch (tripPhase) {
    case 'driver_assigned':
    case 'driver_en_route':
      return 'going_to_pickup';
    case 'driver_arrived':
      return 'at_pickup';
    case 'trip_started':
    case 'trip_in_progress':
      return 'in_ride';
    case 'trip_completed':
      return 'completed';
    case 'trip_cancelled':
      return 'idle';
    default:
      return 'idle';
  }
}

/**
 * Reducer for ride state
 */
function rideReducer(state: RideState, action: RideAction): RideState {
  switch (action.type) {
    case 'SET_RIDE': {
      const ride = action.payload;
      const newPhase = mapTripPhaseToRidePhase(ride.phase);
      return {
        ...state,
        currentRide: ride,
        phase: newPhase,
        driver: ride.driver,
        driverLocation: ride.driverLocation || null,
        pickup: ride.pickup,
        dropoff: ride.dropoff,
        loading: false,
        error: null,
      };
    }

    case 'UPDATE_RIDE': {
      if (!state.currentRide) return state;
      const updatedRide = { ...state.currentRide, ...action.payload };
      const newPhase = mapTripPhaseToRidePhase(updatedRide.phase);
      return {
        ...state,
        currentRide: updatedRide,
        phase: newPhase,
        driverLocation: updatedRide.driverLocation || state.driverLocation,
      };
    }

    case 'CLEAR_RIDE':
      return {
        ...initialState,
      };

    case 'SET_PHASE': {
      const currentPhase = state.phase;
      const newPhase = action.payload;

      // Validate state machine transition
      if (!VALID_TRANSITIONS[currentPhase].includes(newPhase)) {
        console.warn(`Invalid phase transition: ${currentPhase} -> ${newPhase}`);
        return state;
      }

      return {
        ...state,
        phase: newPhase,
      };
    }

    case 'SET_DRIVER':
      return {
        ...state,
        driver: action.payload,
      };

    case 'SET_DRIVER_LOCATION':
      return {
        ...state,
        driverLocation: action.payload,
      };

    case 'SET_ETA':
      return {
        ...state,
        etaMinutes: action.payload,
      };

    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        loading: false,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

/**
 * Context value interface
 */
export interface RideContextValue {
  // State
  phase: RidePhase;
  currentRide: Trip | null;
  driver: RideState['driver'];
  driverLocation: DriverLocation | null;
  etaMinutes: number | null;
  pickup: Location | null;
  dropoff: Location | null;
  loading: boolean;
  error: string | null;

  // State checkers
  isIdle: boolean;
  isGoingToPickup: boolean;
  isAtPickup: boolean;
  isInRide: boolean;
  isCompleting: boolean;
  isCompleted: boolean;
  hasActiveRide: boolean;

  // Actions
  subscribeToRide: (tripId: string) => void;
  unsubscribeFromRide: () => void;
  updateEta: (minutes: number) => void;
  confirmPickup: () => Promise<void>;
  startRide: () => Promise<void>;
  completeRide: () => Promise<void>;
  cancelRide: (reason?: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const RideContext = createContext<RideContextValue | undefined>(undefined);

interface RideProviderProps {
  children: ReactNode;
}

export function RideProvider({ children }: RideProviderProps) {
  const [state, dispatch] = useReducer(rideReducer, initialState);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const driverUnsubscribeRef = useRef<Unsubscribe | null>(null);

  /**
   * Subscribe to real-time trip updates from Firestore
   */
  const subscribeToRide = useCallback((tripId: string) => {
    // Clean up existing subscriptions
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    if (driverUnsubscribeRef.current) {
      driverUnsubscribeRef.current();
    }

    dispatch({ type: 'SET_LOADING', payload: true });

    // Subscribe to trip document
    const tripRef = doc(db, 'trips', tripId);
    unsubscribeRef.current = onSnapshot(
      tripRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const tripData = snapshot.data() as Omit<Trip, 'id'>;
          const trip: Trip = {
            id: snapshot.id,
            ...tripData,
          };
          dispatch({ type: 'SET_RIDE', payload: trip });

          // Subscribe to driver location if driver is assigned
          if (trip.driver?.id && !driverUnsubscribeRef.current) {
            const driverLocationRef = doc(db, 'driver_locations', trip.driver.id);
            driverUnsubscribeRef.current = onSnapshot(
              driverLocationRef,
              (driverSnapshot) => {
                if (driverSnapshot.exists()) {
                  const locationData = driverSnapshot.data() as DriverLocation;
                  dispatch({ type: 'SET_DRIVER_LOCATION', payload: locationData });
                }
              },
              (error) => {
                console.error('Driver location subscription error:', error);
              }
            );
          }
        } else {
          dispatch({ type: 'SET_ERROR', payload: 'Trip not found' });
        }
      },
      (error) => {
        console.error('Trip subscription error:', error);
        dispatch({ type: 'SET_ERROR', payload: error.message });
      }
    );
  }, []);

  /**
   * Unsubscribe from ride updates
   */
  const unsubscribeFromRide = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (driverUnsubscribeRef.current) {
      driverUnsubscribeRef.current();
      driverUnsubscribeRef.current = null;
    }
  }, []);

  /**
   * Update ETA
   */
  const updateEta = useCallback((minutes: number) => {
    dispatch({ type: 'SET_ETA', payload: minutes });
  }, []);

  /**
   * Confirm pickup - transition from at_pickup to in_ride
   */
  const confirmPickup = useCallback(async () => {
    if (!state.currentRide) {
      dispatch({ type: 'SET_ERROR', payload: 'No active ride' });
      return;
    }

    if (state.phase !== 'at_pickup') {
      dispatch({ type: 'SET_ERROR', payload: 'Cannot confirm pickup in current phase' });
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const tripRef = doc(db, 'trips', state.currentRide.id);
      await updateDoc(tripRef, {
        phase: 'trip_started',
        tripStartedAt: Timestamp.now().toDate().toISOString(),
        updatedAt: Timestamp.now().toDate().toISOString(),
      });
      // State will be updated via the snapshot listener
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to confirm pickup';
      dispatch({ type: 'SET_ERROR', payload: message });
    }
  }, [state.currentRide, state.phase]);

  /**
   * Start ride - alias for confirmPickup for semantic clarity
   */
  const startRide = useCallback(async () => {
    await confirmPickup();
  }, [confirmPickup]);

  /**
   * Complete ride - transition to completing then completed
   */
  const completeRide = useCallback(async () => {
    if (!state.currentRide) {
      dispatch({ type: 'SET_ERROR', payload: 'No active ride' });
      return;
    }

    if (state.phase !== 'in_ride') {
      dispatch({ type: 'SET_ERROR', payload: 'Cannot complete ride in current phase' });
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_PHASE', payload: 'completing' });

      const tripRef = doc(db, 'trips', state.currentRide.id);
      await updateDoc(tripRef, {
        phase: 'trip_completed',
        status: 'completed',
        tripCompletedAt: Timestamp.now().toDate().toISOString(),
        updatedAt: Timestamp.now().toDate().toISOString(),
      });
      // State will be updated via the snapshot listener
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to complete ride';
      dispatch({ type: 'SET_ERROR', payload: message });
    }
  }, [state.currentRide, state.phase]);

  /**
   * Cancel ride
   */
  const cancelRide = useCallback(async (reason?: string) => {
    if (!state.currentRide) {
      dispatch({ type: 'SET_ERROR', payload: 'No active ride' });
      return;
    }

    if (state.phase === 'completed' || state.phase === 'idle') {
      dispatch({ type: 'SET_ERROR', payload: 'Cannot cancel ride in current phase' });
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const tripRef = doc(db, 'trips', state.currentRide.id);
      await updateDoc(tripRef, {
        phase: 'trip_cancelled',
        status: 'cancelled',
        cancelledAt: Timestamp.now().toDate().toISOString(),
        cancellationReason: reason || 'User cancelled',
        cancelledBy: 'customer',
        updatedAt: Timestamp.now().toDate().toISOString(),
      });

      unsubscribeFromRide();
      dispatch({ type: 'CLEAR_RIDE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel ride';
      dispatch({ type: 'SET_ERROR', payload: message });
    }
  }, [state.currentRide, state.phase, unsubscribeFromRide]);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    unsubscribeFromRide();
    dispatch({ type: 'RESET' });
  }, [unsubscribeFromRide]);

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (driverUnsubscribeRef.current) {
        driverUnsubscribeRef.current();
      }
    };
  }, []);

  const value: RideContextValue = {
    // State
    phase: state.phase,
    currentRide: state.currentRide,
    driver: state.driver,
    driverLocation: state.driverLocation,
    etaMinutes: state.etaMinutes,
    pickup: state.pickup,
    dropoff: state.dropoff,
    loading: state.loading,
    error: state.error,

    // State checkers
    isIdle: state.phase === 'idle',
    isGoingToPickup: state.phase === 'going_to_pickup',
    isAtPickup: state.phase === 'at_pickup',
    isInRide: state.phase === 'in_ride',
    isCompleting: state.phase === 'completing',
    isCompleted: state.phase === 'completed',
    hasActiveRide: state.phase !== 'idle' && state.phase !== 'completed',

    // Actions
    subscribeToRide,
    unsubscribeFromRide,
    updateEta,
    confirmPickup,
    startRide,
    completeRide,
    cancelRide,
    clearError,
    reset,
  };

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

/**
 * Hook to access ride context
 */
export function useRideContext(): RideContextValue {
  const context = useContext(RideContext);
  if (context === undefined) {
    throw new Error('useRideContext must be used within a RideProvider');
  }
  return context;
}

export { RideContext };
