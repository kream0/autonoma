/**
 * Yeli VTC Constants and Configuration
 */

// Vehicle types with base fares in F CFA
export const VEHICLE_TYPES = {
  moto: {
    id: 'moto',
    name: 'Moto',
    description: 'Motorcycle taxi',
    capacity: 1,
    baseFare: 500, // F CFA
    perKmRate: 150, // F CFA per km
    minimumFare: 750, // F CFA
  },
  berline: {
    id: 'berline',
    name: 'Berline',
    description: 'Standard sedan',
    capacity: 4,
    baseFare: 1000, // F CFA
    perKmRate: 350, // F CFA per km
    minimumFare: 1500, // F CFA
  },
  suv: {
    id: 'suv',
    name: 'SUV',
    description: 'Sport utility vehicle',
    capacity: 6,
    baseFare: 1500, // F CFA
    perKmRate: 500, // F CFA per km
    minimumFare: 2500, // F CFA
  },
} as const;

export type VehicleTypeId = keyof typeof VEHICLE_TYPES;

// Supported countries with phone codes
export const SUPPORTED_COUNTRIES = {
  SN: {
    code: 'SN',
    name: 'Senegal',
    phoneCode: '+221',
    currency: 'XOF',
    currencySymbol: 'F CFA',
  },
  CI: {
    code: 'CI',
    name: "Côte d'Ivoire",
    phoneCode: '+225',
    currency: 'XOF',
    currencySymbol: 'F CFA',
  },
  MR: {
    code: 'MR',
    name: 'Mauritania',
    phoneCode: '+222',
    currency: 'MRU',
    currencySymbol: 'UM',
  },
  FR: {
    code: 'FR',
    name: 'France',
    phoneCode: '+33',
    currency: 'EUR',
    currencySymbol: '€',
  },
} as const;

export type CountryCode = keyof typeof SUPPORTED_COUNTRIES;

// Application configuration
export const APP_CONFIG = {
  // Request timeouts in milliseconds
  timeouts: {
    api: 30000,
    geolocation: 10000,
    driverSearch: 120000,
    paymentConfirmation: 60000,
  },
  // Polling/update intervals in milliseconds
  intervals: {
    driverLocationUpdate: 5000,
    tripStatusCheck: 3000,
    nearbyDriversRefresh: 10000,
  },
  // Search radius in kilometers
  searchRadius: {
    default: 5,
    max: 15,
  },
  // Trip limits
  trip: {
    maxWaypoints: 3,
    maxDistanceKm: 100,
  },
} as const;

// Pricing configuration in F CFA (XOF)
export const PRICING = {
  moto: {
    baseFare: 500,
    perKmRate: 150,
    perMinuteRate: 25,
    minimumFare: 750,
    bookingFee: 100,
  },
  berline: {
    baseFare: 1000,
    perKmRate: 350,
    perMinuteRate: 50,
    minimumFare: 1500,
    bookingFee: 200,
  },
  suv: {
    baseFare: 1500,
    perKmRate: 500,
    perMinuteRate: 75,
    minimumFare: 2500,
    bookingFee: 300,
  },
} as const;

// Surge pricing multipliers
export const SURGE_MULTIPLIERS = {
  low: 1.0,
  medium: 1.25,
  high: 1.5,
  veryHigh: 2.0,
} as const;

// Payment methods
export const PAYMENT_METHODS = {
  cash: {
    id: 'cash',
    name: 'Cash',
    enabled: true,
  },
  orangeMoney: {
    id: 'orange_money',
    name: 'Orange Money',
    enabled: true,
  },
  wave: {
    id: 'wave',
    name: 'Wave',
    enabled: true,
  },
  card: {
    id: 'card',
    name: 'Credit/Debit Card',
    enabled: false,
  },
} as const;

export type PaymentMethodId = keyof typeof PAYMENT_METHODS;

// Trip status
export const TRIP_STATUS = {
  PENDING: 'pending',
  SEARCHING: 'searching',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_ARRIVING: 'driver_arriving',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type TripStatus = (typeof TRIP_STATUS)[keyof typeof TRIP_STATUS];

// Driver status
export const DRIVER_STATUS = {
  OFFLINE: 'offline',
  AVAILABLE: 'available',
  BUSY: 'busy',
  ON_TRIP: 'on_trip',
} as const;

export type DriverStatus = (typeof DRIVER_STATUS)[keyof typeof DRIVER_STATUS];
