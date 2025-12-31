/**
 * Phone OTP Authentication Service
 * Handles Firebase phone authentication with reCAPTCHA verification
 */

import {
  PhoneAuthProvider,
  signInWithCredential,
  signInWithPhoneNumber,
  ApplicationVerifier,
  ConfirmationResult,
  UserCredential,
} from 'firebase/auth';
import { auth } from '../../config/firebase';

/** OTP cooldown period in milliseconds (60 seconds) */
const OTP_COOLDOWN_MS = 60 * 1000;

/** OTP result returned after sending verification code */
export interface OTPSendResult {
  success: boolean;
  verificationId?: string;
  error?: string;
  cooldownRemaining?: number;
}

/** OTP verification result */
export interface OTPVerifyResult {
  success: boolean;
  user?: UserCredential['user'];
  error?: string;
}

/** Cooldown tracking per phone number */
const cooldownMap = new Map<string, number>();

/** Active confirmation results per phone number */
const confirmationMap = new Map<string, ConfirmationResult>();

/**
 * Normalize phone number to E.164 format
 * @param phoneNumber - Phone number to normalize
 * @param countryPrefix - Country prefix (e.g., '221' for Senegal)
 * @returns Normalized phone number with + prefix
 */
function normalizePhoneNumber(phoneNumber: string, countryPrefix?: string): string {
  // Remove all non-digit characters except leading +
  let cleaned = phoneNumber.replace(/[\s\-()]/g, '');

  // If already has +, return as is
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // If starts with country prefix, add +
  if (countryPrefix && cleaned.startsWith(countryPrefix)) {
    return `+${cleaned}`;
  }

  // If country prefix provided, prepend it
  if (countryPrefix) {
    return `+${countryPrefix}${cleaned}`;
  }

  // Default: assume it needs a + prefix
  return `+${cleaned}`;
}

/**
 * Check if phone number is in cooldown period
 * @param phoneNumber - Phone number to check
 * @returns Remaining cooldown time in milliseconds, or 0 if no cooldown
 */
export function getCooldownRemaining(phoneNumber: string): number {
  const lastSentTime = cooldownMap.get(phoneNumber);
  if (!lastSentTime) {
    return 0;
  }

  const elapsed = Date.now() - lastSentTime;
  const remaining = OTP_COOLDOWN_MS - elapsed;

  return remaining > 0 ? remaining : 0;
}

/**
 * Check if phone number can receive a new OTP
 * @param phoneNumber - Phone number to check
 * @returns True if OTP can be sent
 */
export function canSendOTP(phoneNumber: string): boolean {
  return getCooldownRemaining(phoneNumber) === 0;
}

/**
 * Send OTP to the specified phone number
 * @param phoneNumber - Phone number to send OTP to
 * @param recaptchaVerifier - Firebase reCAPTCHA verifier instance
 * @param countryPrefix - Optional country prefix for normalization
 * @returns OTP send result with verification ID or error
 */
export async function sendOTP(
  phoneNumber: string,
  recaptchaVerifier: ApplicationVerifier,
  countryPrefix?: string
): Promise<OTPSendResult> {
  const normalizedPhone = normalizePhoneNumber(phoneNumber, countryPrefix);

  // Check cooldown
  const cooldownRemaining = getCooldownRemaining(normalizedPhone);
  if (cooldownRemaining > 0) {
    return {
      success: false,
      error: 'Please wait before requesting a new code',
      cooldownRemaining,
    };
  }

  try {
    const confirmationResult = await signInWithPhoneNumber(
      auth,
      normalizedPhone,
      recaptchaVerifier
    );

    // Store confirmation result for verification
    confirmationMap.set(normalizedPhone, confirmationResult);

    // Set cooldown
    cooldownMap.set(normalizedPhone, Date.now());

    return {
      success: true,
      verificationId: confirmationResult.verificationId,
    };
  } catch (error: unknown) {
    const errorMessage = getFirebaseErrorMessage(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Verify OTP code entered by user
 * @param phoneNumber - Phone number the OTP was sent to
 * @param otpCode - 6-digit OTP code entered by user
 * @param verificationId - Optional verification ID (uses stored one if not provided)
 * @returns Verification result with user or error
 */
export async function verifyOTP(
  phoneNumber: string,
  otpCode: string,
  verificationId?: string
): Promise<OTPVerifyResult> {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Validate OTP format
  if (!/^\d{6}$/.test(otpCode.trim())) {
    return {
      success: false,
      error: 'Invalid OTP format. Please enter a 6-digit code.',
    };
  }

  try {
    // Get confirmation result from map or use provided verification ID
    const confirmationResult = confirmationMap.get(normalizedPhone);

    if (confirmationResult) {
      // Use confirmation result's confirm method
      const userCredential = await confirmationResult.confirm(otpCode.trim());

      // Clean up stored confirmation
      confirmationMap.delete(normalizedPhone);

      return {
        success: true,
        user: userCredential.user,
      };
    } else if (verificationId) {
      // Use verification ID to create credential manually
      const credential = PhoneAuthProvider.credential(verificationId, otpCode.trim());
      const userCredential = await signInWithCredential(auth, credential);

      return {
        success: true,
        user: userCredential.user,
      };
    } else {
      return {
        success: false,
        error: 'No verification session found. Please request a new code.',
      };
    }
  } catch (error: unknown) {
    const errorMessage = getFirebaseErrorMessage(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Resend OTP to the specified phone number
 * Respects cooldown period
 * @param phoneNumber - Phone number to resend OTP to
 * @param recaptchaVerifier - Firebase reCAPTCHA verifier instance
 * @param countryPrefix - Optional country prefix for normalization
 * @returns OTP send result with verification ID or error
 */
export async function resendOTP(
  phoneNumber: string,
  recaptchaVerifier: ApplicationVerifier,
  countryPrefix?: string
): Promise<OTPSendResult> {
  const normalizedPhone = normalizePhoneNumber(phoneNumber, countryPrefix);

  // Check cooldown
  const cooldownRemaining = getCooldownRemaining(normalizedPhone);
  if (cooldownRemaining > 0) {
    return {
      success: false,
      error: 'Please wait before requesting a new code',
      cooldownRemaining,
    };
  }

  // Clear previous confirmation result
  confirmationMap.delete(normalizedPhone);

  // Send new OTP
  return sendOTP(phoneNumber, recaptchaVerifier, countryPrefix);
}

/**
 * Clear all stored data for a phone number
 * Call this on logout or when user cancels verification
 * @param phoneNumber - Phone number to clear data for
 */
export function clearPhoneAuthData(phoneNumber: string): void {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  cooldownMap.delete(normalizedPhone);
  confirmationMap.delete(normalizedPhone);
}

/**
 * Get user-friendly error message from Firebase error
 * @param error - Firebase error object
 * @returns User-friendly error message
 */
function getFirebaseErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const firebaseError = error as { code: string; message?: string };

    switch (firebaseError.code) {
      case 'auth/invalid-phone-number':
        return 'Invalid phone number format. Please check and try again.';
      case 'auth/missing-phone-number':
        return 'Please enter a phone number.';
      case 'auth/quota-exceeded':
        return 'Too many requests. Please try again later.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/operation-not-allowed':
        return 'Phone authentication is not enabled.';
      case 'auth/invalid-verification-code':
        return 'Invalid verification code. Please check and try again.';
      case 'auth/invalid-verification-id':
        return 'Verification session expired. Please request a new code.';
      case 'auth/code-expired':
        return 'Verification code has expired. Please request a new code.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'auth/captcha-check-failed':
        return 'Security verification failed. Please try again.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection and try again.';
      default:
        return firebaseError.message || 'An error occurred. Please try again.';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}

/** Constants exported for use in UI components */
export const OTP_COOLDOWN_SECONDS = OTP_COOLDOWN_MS / 1000;
