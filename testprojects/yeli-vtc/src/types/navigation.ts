/**
 * Navigation type definitions for React Navigation
 */

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { VehicleTypeId } from '../constants';
import type { Location } from './ride';

/**
 * Customer tab navigator parameters
 */
export type CustomerTabParamList = {
  Home: undefined;
  Rides: undefined;
  Activity: undefined;
  Profile: undefined;
};

/**
 * Driver tab navigator parameters
 */
export type DriverTabParamList = {
  Dashboard: undefined;
  Earnings: undefined;
  Trips: undefined;
  Profile: undefined;
};

/**
 * Root stack navigator parameters
 */
export type RootStackParamList = {
  // Auth screens
  Welcome: undefined;
  PhoneEntry: undefined;
  OtpVerification: { phoneNumber: string; countryCode: string };
  Registration: { phoneNumber: string; countryCode: string };
  RoleSelection: undefined;

  // Customer screens
  CustomerTabs: NavigatorScreenParams<CustomerTabParamList>;
  PickLocation: { type: 'pickup' | 'dropoff' };
  SelectVehicle: { pickup: Location; dropoff: Location };
  ConfirmRide: {
    pickup: Location;
    dropoff: Location;
    vehicleType: VehicleTypeId;
  };
  SearchingDriver: { rideId: string };
  TripActive: { tripId: string };
  TripCompleted: { tripId: string };
  RateDriver: { tripId: string };

  // Driver screens
  DriverTabs: NavigatorScreenParams<DriverTabParamList>;
  DriverOnboarding: undefined;
  VehicleSetup: undefined;
  DocumentUpload: undefined;
  JobOffer: { jobId: string };
  ActiveTrip: { tripId: string };
  TripSummary: { tripId: string };

  // Shared screens
  Settings: undefined;
  EditProfile: undefined;
  PaymentMethods: undefined;
  Help: undefined;
  About: undefined;
};

/**
 * Screen props type helpers
 */
export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type CustomerTabScreenProps<T extends keyof CustomerTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<CustomerTabParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

export type DriverTabScreenProps<T extends keyof DriverTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<DriverTabParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

/**
 * Utility type to get route params
 */
export type RouteParams<T extends keyof RootStackParamList> = RootStackParamList[T];
