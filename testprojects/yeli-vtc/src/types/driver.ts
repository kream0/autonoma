/**
 * Driver-related type definitions
 */

import type { VehicleTypeId, DriverStatus as DriverStatusType } from '../constants';
import type { User } from './user';

/**
 * Re-export DriverStatus from constants for convenience
 */
export type DriverStatus = DriverStatusType;

/**
 * Driver vehicle information
 */
export interface DriverVehicle {
  id: string;
  type: VehicleTypeId;
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  capacity: number;
  imageUrl?: string;
  isVerified: boolean;
}

/**
 * Driver location with coordinates
 */
export interface DriverLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: string;
}

/**
 * Driver profile extending base User
 */
export interface Driver extends User {
  role: 'driver';
  status: DriverStatus;
  vehicle: DriverVehicle;
  currentLocation?: DriverLocation;
  rating: number;
  totalTrips: number;
  totalEarnings: number;
  isOnline: boolean;
  licenseNumber: string;
  licenseExpiry: string;
  insuranceNumber?: string;
  insuranceExpiry?: string;
}

/**
 * Driver statistics
 */
export interface DriverStats {
  todayTrips: number;
  todayEarnings: number;
  weekTrips: number;
  weekEarnings: number;
  monthTrips: number;
  monthEarnings: number;
  acceptanceRate: number;
  cancellationRate: number;
  averageRating: number;
}

/**
 * Nearby driver for customer view
 */
export interface NearbyDriver {
  id: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;
  vehicle: DriverVehicle;
  location: DriverLocation;
  rating: number;
  totalTrips: number;
  distanceKm: number;
  estimatedArrivalMinutes: number;
}
