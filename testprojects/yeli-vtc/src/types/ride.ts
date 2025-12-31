/**
 * Ride-related type definitions
 */

import type { VehicleTypeId, PaymentMethodId, TripStatus } from '../constants';
import type { User } from './user';
import type { Driver, DriverLocation } from './driver';

// Re-export DriverLocation for convenience
export type { DriverLocation } from './driver';

/**
 * Geographic coordinates
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Location with address details
 */
export interface Location extends Coordinates {
  address: string;
  name?: string;
  placeId?: string;
}

/**
 * Trip phase enumeration
 */
export type TripPhase =
  | 'requesting'
  | 'searching_driver'
  | 'driver_assigned'
  | 'driver_en_route'
  | 'driver_arrived'
  | 'trip_started'
  | 'trip_in_progress'
  | 'trip_completed'
  | 'trip_cancelled';

/**
 * Ride request from customer
 */
export interface Ride {
  id: string;
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
  createdAt: string;
}

/**
 * Job represents a ride request sent to drivers
 */
export interface Job {
  id: string;
  rideId: string;
  driverId?: string;
  status: 'pending' | 'offered' | 'accepted' | 'rejected' | 'expired';
  offeredAt?: string;
  respondedAt?: string;
  expiresAt: string;
  ride: Ride;
}

/**
 * Trip represents an active or completed ride
 */
export interface Trip {
  id: string;
  rideId: string;
  customer: Pick<User, 'id' | 'firstName' | 'lastName' | 'phoneNumber' | 'profileImageUrl'>;
  driver: Pick<Driver, 'id' | 'firstName' | 'lastName' | 'phoneNumber' | 'profileImageUrl' | 'vehicle' | 'rating'>;
  pickup: Location;
  dropoff: Location;
  waypoints?: Location[];
  vehicleType: VehicleTypeId;
  paymentMethod: PaymentMethodId;
  status: TripStatus;
  phase: TripPhase;
  driverLocation?: DriverLocation;
  estimatedFare: number;
  finalFare?: number;
  estimatedDistanceKm: number;
  actualDistanceKm?: number;
  estimatedDurationMinutes: number;
  actualDurationMinutes?: number;
  surgeMultiplier: number;
  route?: Coordinates[];
  driverAssignedAt?: string;
  driverArrivedAt?: string;
  tripStartedAt?: string;
  tripCompletedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledBy?: 'customer' | 'driver' | 'system';
  customerRating?: number;
  driverRating?: number;
  customerReview?: string;
  driverReview?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Trip summary for history view
 */
export interface TripSummary {
  id: string;
  pickup: Location;
  dropoff: Location;
  vehicleType: VehicleTypeId;
  status: TripStatus;
  finalFare: number;
  driverName: string;
  driverRating: number;
  customerRating?: number;
  tripCompletedAt: string;
}

/**
 * Fare estimate response
 */
export interface FareEstimate {
  vehicleType: VehicleTypeId;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  bookingFee: number;
  surgeMultiplier: number;
  surgeAmount: number;
  totalFare: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
}
