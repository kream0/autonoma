/**
 * Validation utility functions
 */

/**
 * West African country codes and their phone number patterns
 * Format: { countryCode: { prefix: string, length: number } }
 */
const WEST_AFRICAN_PHONE_PATTERNS: Record<string, { prefix: string; length: number }> = {
  // Senegal
  SN: { prefix: '221', length: 9 },
  // Côte d'Ivoire
  CI: { prefix: '225', length: 10 },
  // Mali
  ML: { prefix: '223', length: 8 },
  // Burkina Faso
  BF: { prefix: '226', length: 8 },
  // Guinea
  GN: { prefix: '224', length: 9 },
  // Niger
  NE: { prefix: '227', length: 8 },
  // Togo
  TG: { prefix: '228', length: 8 },
  // Benin
  BJ: { prefix: '229', length: 8 },
  // Mauritania
  MR: { prefix: '222', length: 8 },
  // Gambia
  GM: { prefix: '220', length: 7 },
  // Guinea-Bissau
  GW: { prefix: '245', length: 7 },
  // Liberia
  LR: { prefix: '231', length: 7 },
  // Sierra Leone
  SL: { prefix: '232', length: 8 },
  // Ghana
  GH: { prefix: '233', length: 9 },
  // Nigeria
  NG: { prefix: '234', length: 10 },
  // Cape Verde
  CV: { prefix: '238', length: 7 },
};

/**
 * Validate a phone number for West African countries
 * @param phone - The phone number to validate (digits only or with + prefix)
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., 'SN', 'CI')
 * @returns True if the phone number is valid for the given country
 */
export function validatePhone(phone: string, countryCode: string): boolean {
  const pattern = WEST_AFRICAN_PHONE_PATTERNS[countryCode.toUpperCase()];

  if (!pattern) {
    return false;
  }

  // Remove spaces, dashes, and parentheses
  const cleaned = phone.replace(/[\s\-()]/g, '');

  // Check if it starts with + and country prefix
  if (cleaned.startsWith('+')) {
    const withoutPlus = cleaned.slice(1);
    if (!withoutPlus.startsWith(pattern.prefix)) {
      return false;
    }
    // Validate length: prefix + local number
    const localNumber = withoutPlus.slice(pattern.prefix.length);
    return /^\d+$/.test(localNumber) && localNumber.length === pattern.length;
  }

  // Check if it starts with country prefix (without +)
  if (cleaned.startsWith(pattern.prefix)) {
    const localNumber = cleaned.slice(pattern.prefix.length);
    return /^\d+$/.test(localNumber) && localNumber.length === pattern.length;
  }

  // Assume it's just the local number
  return /^\d+$/.test(cleaned) && cleaned.length === pattern.length;
}

/**
 * Validate an email address
 * @param email - The email address to validate
 * @returns True if the email is valid
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const trimmed = email.trim();

  if (trimmed.length === 0 || trimmed.length > 254) {
    return false;
  }

  // RFC 5322 compliant email regex (simplified but robust)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  return emailRegex.test(trimmed);
}

/**
 * Validate a person's name
 * @param name - The name to validate
 * @returns True if the name is valid
 */
export function validateName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  const trimmed = name.trim();

  // Name should be at least 2 characters and no more than 100
  if (trimmed.length < 2 || trimmed.length > 100) {
    return false;
  }

  // Allow letters (including accented characters common in West African names),
  // spaces, hyphens, and apostrophes
  const nameRegex = /^[\p{L}\s'\-]+$/u;

  return nameRegex.test(trimmed);
}

/**
 * Validate a 6-digit OTP code
 * @param otp - The OTP code to validate
 * @returns True if the OTP is a valid 6-digit code
 */
export function validateOTP(otp: string): boolean {
  if (!otp || typeof otp !== 'string') {
    return false;
  }

  const trimmed = otp.trim();

  // Must be exactly 6 digits
  return /^\d{6}$/.test(trimmed);
}

/**
 * Get the country prefix for a West African country
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns The country prefix or null if not found
 */
export function getCountryPrefix(countryCode: string): string | null {
  const pattern = WEST_AFRICAN_PHONE_PATTERNS[countryCode.toUpperCase()];
  return pattern ? pattern.prefix : null;
}

/**
 * Get supported West African country codes
 * @returns Array of supported country codes
 */
export function getSupportedCountries(): string[] {
  return Object.keys(WEST_AFRICAN_PHONE_PATTERNS);
}
