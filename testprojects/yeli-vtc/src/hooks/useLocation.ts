/**
 * Custom hook for location tracking in Yeli VTC
 * Wraps locationService to provide React-friendly location state management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';

/**
 * Location coordinates interface
 */
export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

/**
 * Location error types
 */
export type LocationErrorType =
  | 'PERMISSION_DENIED'
  | 'PERMISSION_NOT_GRANTED'
  | 'LOCATION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * Location error interface
 */
export interface LocationError {
  type: LocationErrorType;
  message: string;
}

/**
 * Options for useLocation hook
 */
export interface UseLocationOptions {
  /** Enable high accuracy mode (default: true) */
  enableHighAccuracy?: boolean;
  /** Location update interval in milliseconds (default: 5000) */
  updateInterval?: number;
  /** Distance filter in meters - minimum distance to trigger update (default: 10) */
  distanceFilter?: number;
  /** Auto-start tracking on mount (default: false) */
  autoStart?: boolean;
  /** Callback when location updates */
  onLocationUpdate?: (location: LocationCoordinates) => void;
  /** Callback on error */
  onError?: (error: LocationError) => void;
}

/**
 * Return type for useLocation hook
 */
export interface UseLocationReturn {
  /** Current location coordinates */
  currentLocation: LocationCoordinates | null;
  /** Whether location tracking is active */
  isTracking: boolean;
  /** Whether location is being fetched for the first time */
  isLoading: boolean;
  /** Current error state */
  error: LocationError | null;
  /** Start location tracking */
  startTracking: () => Promise<void>;
  /** Stop location tracking */
  stopTracking: () => void;
  /** Get current location once (without continuous tracking) */
  getCurrentLocation: () => Promise<LocationCoordinates | null>;
  /** Clear error state */
  clearError: () => void;
  /** Request location permissions */
  requestPermissions: () => Promise<boolean>;
  /** Check if location permissions are granted */
  hasPermissions: () => Promise<boolean>;
}

/**
 * Convert expo-location coordinates to our interface
 */
function toLocationCoordinates(location: Location.LocationObject): LocationCoordinates {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    altitude: location.coords.altitude,
    accuracy: location.coords.accuracy,
    altitudeAccuracy: location.coords.altitudeAccuracy,
    heading: location.coords.heading,
    speed: location.coords.speed,
    timestamp: location.timestamp,
  };
}

/**
 * Custom hook for location tracking in Yeli VTC
 * Provides easy access to device location with tracking capabilities
 */
export function useLocation(options: UseLocationOptions = {}): UseLocationReturn {
  const {
    enableHighAccuracy = true,
    updateInterval = 5000,
    distanceFilter = 10,
    autoStart = false,
    onLocationUpdate,
    onError,
  } = options;

  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<LocationError | null>(null);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const isMounted = useRef<boolean>(true);

  /**
   * Request location permissions
   */
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

      if (foregroundStatus !== 'granted') {
        const permissionError: LocationError = {
          type: 'PERMISSION_DENIED',
          message: 'Foreground location permission denied',
        };
        setError(permissionError);
        onError?.(permissionError);
        return false;
      }

      // Request background permissions for driver tracking (optional)
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

      // Foreground permission is sufficient for basic operation
      return foregroundStatus === 'granted';
    } catch (err) {
      const permissionError: LocationError = {
        type: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'Failed to request permissions',
      };
      setError(permissionError);
      onError?.(permissionError);
      return false;
    }
  }, [onError]);

  /**
   * Check if location permissions are granted
   */
  const hasPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }, []);

  /**
   * Get current location once
   */
  const getCurrentLocation = useCallback(async (): Promise<LocationCoordinates | null> => {
    try {
      setIsLoading(true);
      setError(null);

      const permissionGranted = await hasPermissions();
      if (!permissionGranted) {
        const granted = await requestPermissions();
        if (!granted) {
          return null;
        }
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: enableHighAccuracy
          ? Location.Accuracy.BestForNavigation
          : Location.Accuracy.Balanced,
      });

      const coords = toLocationCoordinates(location);

      if (isMounted.current) {
        setCurrentLocation(coords);
        setIsLoading(false);
      }

      return coords;
    } catch (err) {
      const locationError: LocationError = {
        type: 'LOCATION_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Failed to get current location',
      };

      if (isMounted.current) {
        setError(locationError);
        setIsLoading(false);
      }

      onError?.(locationError);
      return null;
    }
  }, [enableHighAccuracy, hasPermissions, requestPermissions, onError]);

  /**
   * Start continuous location tracking
   */
  const startTracking = useCallback(async (): Promise<void> => {
    try {
      // Stop any existing subscription
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      setError(null);
      setIsLoading(true);

      const permissionGranted = await hasPermissions();
      if (!permissionGranted) {
        const granted = await requestPermissions();
        if (!granted) {
          setIsLoading(false);
          return;
        }
      }

      // Get initial location
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: enableHighAccuracy
          ? Location.Accuracy.BestForNavigation
          : Location.Accuracy.Balanced,
      });

      if (isMounted.current) {
        const coords = toLocationCoordinates(initialLocation);
        setCurrentLocation(coords);
        setIsLoading(false);
        onLocationUpdate?.(coords);
      }

      // Start watching location
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: enableHighAccuracy
            ? Location.Accuracy.BestForNavigation
            : Location.Accuracy.Balanced,
          timeInterval: updateInterval,
          distanceInterval: distanceFilter,
        },
        (location: Location.LocationObject) => {
          if (isMounted.current) {
            const coords = toLocationCoordinates(location);
            setCurrentLocation(coords);
            onLocationUpdate?.(coords);
          }
        }
      );

      if (isMounted.current) {
        setIsTracking(true);
      }
    } catch (err) {
      const trackingError: LocationError = {
        type: 'LOCATION_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Failed to start location tracking',
      };

      if (isMounted.current) {
        setError(trackingError);
        setIsLoading(false);
        setIsTracking(false);
      }

      onError?.(trackingError);
    }
  }, [
    enableHighAccuracy,
    updateInterval,
    distanceFilter,
    hasPermissions,
    requestPermissions,
    onLocationUpdate,
    onError,
  ]);

  /**
   * Stop location tracking
   */
  const stopTracking = useCallback((): void => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    if (isMounted.current) {
      setIsTracking(false);
    }
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  // Auto-start tracking if enabled
  useEffect(() => {
    if (autoStart) {
      startTracking();
    }
  }, [autoStart, startTracking]);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, []);

  return {
    currentLocation,
    isTracking,
    isLoading,
    error,
    startTracking,
    stopTracking,
    getCurrentLocation,
    clearError,
    requestPermissions,
    hasPermissions,
  };
}

export default useLocation;
