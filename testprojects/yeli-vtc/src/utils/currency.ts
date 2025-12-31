/**
 * Currency utilities for F CFA (West African CFA Franc)
 */

// Vehicle types for fare calculation
export type VehicleType = 'sedan' | 'suv' | 'van' | 'motorcycle';

// Pricing constants (in F CFA)
const PRICING = {
  // Base fare per vehicle type
  baseFare: {
    sedan: 1000,
    suv: 1500,
    van: 2000,
    motorcycle: 500,
  },
  // Price per kilometer per vehicle type
  perKm: {
    sedan: 350,
    suv: 450,
    van: 550,
    motorcycle: 200,
  },
  // Minimum fare per vehicle type
  minimumFare: {
    sedan: 1500,
    suv: 2000,
    van: 2500,
    motorcycle: 750,
  },
} as const;

/**
 * Format a number as F CFA currency string
 * @param amount - The amount in F CFA
 * @returns Formatted string like '2 500 F CFA'
 */
export function formatCFA(amount: number): string {
  // Round to nearest integer (F CFA doesn't use decimals)
  const rounded = Math.round(amount);

  // Format with space as thousands separator (French formatting)
  const formatted = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  return `${formatted} F CFA`;
}

/**
 * Parse a F CFA currency string to a number
 * @param str - String like '2 500 F CFA' or '2500'
 * @returns The numeric amount
 */
export function parseCFA(str: string): number {
  // Remove 'F CFA' suffix and any spaces, then parse
  const cleaned = str
    .replace(/F\s*CFA/gi, '')
    .replace(/\s/g, '')
    .trim();

  const parsed = parseInt(cleaned, 10);

  if (isNaN(parsed)) {
    return 0;
  }

  return parsed;
}

/**
 * Calculate fare based on distance and vehicle type
 * @param distanceKm - Distance in kilometers
 * @param vehicleType - Type of vehicle
 * @returns Fare in F CFA
 */
export function calculateFare(distanceKm: number, vehicleType: VehicleType): number {
  if (distanceKm < 0) {
    return 0;
  }

  const baseFare = PRICING.baseFare[vehicleType];
  const perKmRate = PRICING.perKm[vehicleType];
  const minimumFare = PRICING.minimumFare[vehicleType];

  const calculatedFare = baseFare + (distanceKm * perKmRate);

  // Ensure fare is at least the minimum
  const fare = Math.max(calculatedFare, minimumFare);

  // Round to nearest 50 F CFA for cleaner pricing
  return Math.round(fare / 50) * 50;
}
