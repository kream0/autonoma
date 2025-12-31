/**
 * User-related type definitions
 */

import type { CountryCode } from '../constants';

/**
 * User roles in the application
 */
export type UserRole = 'customer' | 'driver' | 'admin';

/**
 * User profile information
 */
export interface User {
  id: string;
  phoneNumber: string;
  countryCode: CountryCode;
  firstName: string;
  lastName: string;
  email?: string;
  role: UserRole;
  profileImageUrl?: string;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * User authentication state
 */
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * User registration data
 */
export interface UserRegistration {
  phoneNumber: string;
  countryCode: CountryCode;
  firstName: string;
  lastName: string;
  email?: string;
  role: UserRole;
}

/**
 * User preferences
 */
export interface UserPreferences {
  language: 'fr' | 'en';
  notificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  preferredPaymentMethod?: string;
}
