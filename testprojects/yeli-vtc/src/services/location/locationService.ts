/**
 * Location Service for Yeli VTC
 * Handles location tracking using expo-location
 */

import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Location coordinates with optional accuracy
 */
export interface LocationCoords {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

/**
 * Location with timestamp
 */
export interface LocationData extends LocationCoords {
  timestamp: number;
}

/**
 * Location permission status
 */
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Location tracking options
 */
export interface TrackingOptions {
  /** Accuracy level (default: high) */
  accuracy?: 'low' | 'balanced' | 'high' | 'best';
  /** Distance interval for updates in meters (default: 10) */
  distanceInterval?: number;
  /** Time interval for updates in milliseconds (default: 5000) */
  timeInterval?: number;
  /** Show indicator on iOS (default: true) */
  showsBackgroundLocationIndicator?: boolean;
}

/**
 * Location update callback
 */
export type LocationCallback = (location: LocationData) => void;

/**
 * Error callback
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Internal state
 */
let locationSubscription: Location.LocationSubscription | null = null;
let isTracking = false;

/**
 * Map accuracy level to expo-location accuracy constant
 */
function getAccuracy(level: TrackingOptions['accuracy']): Location.Accuracy {
  switch (level) {
    case 'low':
      return Location.Accuracy.Low;
    case 'balanced':
      return Location.Accuracy.Balanced;
    case 'high':
      return Location.Accuracy.High;
    case 'best':
      return Location.Accuracy.BestForNavigation;
    default:
      return Location.Accuracy.High;
  }
}

/**
 * Request foreground location permission
 *
 * @returns Permission status
 */
export async function requestForegroundPermission(): Promise<PermissionStatus> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status as PermissionStatus;
  } catch (error) {
    console.error('[LocationService] Error requesting foreground permission:', error);
    return 'denied';
  }
}

/**
 * Request background location permission
 * Note: Requires foreground permission first
 *
 * @returns Permission status
 */
export async function requestBackgroundPermission(): Promise<PermissionStatus> {
  try {
    // First ensure foreground permission
    const foreground = await requestForegroundPermission();
    if (foreground !== 'granted') {
      return foreground;
    }

    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status as PermissionStatus;
  } catch (error) {
    console.error('[LocationService] Error requesting background permission:', error);
    return 'denied';
  }
}

/**
 * Check current foreground permission status
 *
 * @returns Permission status
 */
export async function getForegroundPermissionStatus(): Promise<PermissionStatus> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status as PermissionStatus;
  } catch (error) {
    console.error('[LocationService] Error checking foreground permission:', error);
    return 'denied';
  }
}

/**
 * Check current background permission status
 *
 * @returns Permission status
 */
export async function getBackgroundPermissionStatus(): Promise<PermissionStatus> {
  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status as PermissionStatus;
  } catch (error) {
    console.error('[LocationService] Error checking background permission:', error);
    return 'denied';
  }
}

/**
 * Check if location services are enabled on the device
 *
 * @returns Whether location services are enabled
 */
export async function isLocationServicesEnabled(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch (error) {
    console.error('[LocationService] Error checking location services:', error);
    return false;
  }
}

/**
 * Get the current location once
 *
 * @param accuracy - Accuracy level (default: high)
 * @returns Current location or null if unavailable
 */
export async function getCurrentLocation(
  accuracy: TrackingOptions['accuracy'] = 'high'
): Promise<LocationData | null> {
  try {
    // Check permission
    const permission = await getForegroundPermissionStatus();
    if (permission !== 'granted') {
      const requested = await requestForegroundPermission();
      if (requested !== 'granted') {
        console.warn('[LocationService] Location permission not granted');
        return null;
      }
    }

    // Get current position
    const location = await Location.getCurrentPositionAsync({
      accuracy: getAccuracy(accuracy),
    });

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
  } catch (error) {
    console.error('[LocationService] Error getting current location:', error);
    return null;
  }
}

/**
 * Get the last known location (faster but may be stale)
 *
 * @returns Last known location or null if unavailable
 */
export async function getLastKnownLocation(): Promise<LocationData | null> {
  try {
    const location = await Location.getLastKnownPositionAsync();

    if (!location) {
      return null;
    }

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
  } catch (error) {
    console.error('[LocationService] Error getting last known location:', error);
    return null;
  }
}

/**
 * Start watching location updates
 *
 * @param onLocation - Callback for location updates
 * @param onError - Callback for errors
 * @param options - Tracking options
 * @returns Whether tracking started successfully
 */
export async function startLocationTracking(
  onLocation: LocationCallback,
  onError?: ErrorCallback,
  options: TrackingOptions = {}
): Promise<boolean> {
  try {
    // Stop any existing tracking
    if (isTracking) {
      await stopLocationTracking();
    }

    // Check permission
    const permission = await getForegroundPermissionStatus();
    if (permission !== 'granted') {
      const requested = await requestForegroundPermission();
      if (requested !== 'granted') {
        const error = new Error('Location permission not granted');
        onError?.(error);
        return false;
      }
    }

    // Start tracking
    const {
      accuracy = 'high',
      distanceInterval = 10,
      timeInterval = 5000,
    } = options;

    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: getAccuracy(accuracy),
        distanceInterval,
        timeInterval,
      },
      (location) => {
        const locationData: LocationData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude,
          accuracy: location.coords.accuracy,
          altitudeAccuracy: location.coords.altitudeAccuracy,
          heading: location.coords.heading,
          speed: location.coords.speed,
          timestamp: location.timestamp,
        };
        onLocation(locationData);
      }
    );

    isTracking = true;
    console.log('[LocationService] Location tracking started');
    return true;
  } catch (error) {
    console.error('[LocationService] Error starting location tracking:', error);
    onError?.(error instanceof Error ? error : new Error('Failed to start tracking'));
    return false;
  }
}

/**
 * Stop watching location updates
 */
export async function stopLocationTracking(): Promise<void> {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  isTracking = false;
  console.log('[LocationService] Location tracking stopped');
}

/**
 * Check if location tracking is active
 *
 * @returns Whether tracking is active
 */
export function isTrackingActive(): boolean {
  return isTracking;
}

/**
 * Geocode an address to coordinates
 *
 * @param address - Address string to geocode
 * @returns Location coordinates or null if not found
 */
export async function geocodeAddress(address: string): Promise<LocationCoords | null> {
  try {
    const results = await Location.geocodeAsync(address);

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    return {
      latitude: result.latitude,
      longitude: result.longitude,
      altitude: result.altitude,
      accuracy: result.accuracy,
    };
  } catch (error) {
    console.error('[LocationService] Error geocoding address:', error);
    return null;
  }
}

/**
 * Reverse geocode coordinates to an address
 *
 * @param coords - Coordinates to reverse geocode
 * @returns Address string or null if not found
 */
export async function reverseGeocode(coords: LocationCoords): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });

    if (results.length === 0) {
      return null;
    }

    const result = results[0];

    // Build address string
    const parts: string[] = [];

    if (result.streetNumber) {
      parts.push(result.streetNumber);
    }
    if (result.street) {
      parts.push(result.street);
    }
    if (result.district) {
      parts.push(result.district);
    }
    if (result.city) {
      parts.push(result.city);
    }
    if (result.region) {
      parts.push(result.region);
    }
    if (result.country) {
      parts.push(result.country);
    }

    return parts.join(', ');
  } catch (error) {
    console.error('[LocationService] Error reverse geocoding:', error);
    return null;
  }
}

/**
 * Calculate distance between two points using Haversine formula
 *
 * @param point1 - First location
 * @param point2 - Second location
 * @returns Distance in kilometers
 */
export function calculateDistance(point1: LocationCoords, point2: LocationCoords): number {
  const EARTH_RADIUS_KM = 6371;

  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const deltaLat = toRadians(point2.latitude - point1.latitude);
  const deltaLng = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Location service object providing all location functionality
 */
export const locationService = {
  // Permissions
  requestForegroundPermission,
  requestBackgroundPermission,
  getForegroundPermissionStatus,
  getBackgroundPermissionStatus,
  isLocationServicesEnabled,

  // Location
  getCurrentLocation,
  getLastKnownLocation,

  // Tracking
  startLocationTracking,
  stopLocationTracking,
  isTrackingActive,

  // Geocoding
  geocodeAddress,
  reverseGeocode,

  // Utilities
  calculateDistance,
} as const;

export default locationService;
