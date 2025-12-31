/**
 * OTP Verification Screen
 * 6-digit OTP input with auto-focus, countdown timer, and auto-submit
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import {
  verifyOTP,
  resendOTP,
  getCooldownRemaining,
  OTP_COOLDOWN_SECONDS,
} from '../../services/auth/phoneAuthService';
import type { ApplicationVerifier } from 'firebase/auth';

/** OTP digit count */
const OTP_LENGTH = 6;

/** Route params for OTP screen */
type OTPRouteParams = {
  OTP: {
    phoneNumber: string;
    verificationId?: string;
    recaptchaVerifier?: ApplicationVerifier;
  };
};

export default function OTPScreen() {
  const route = useRoute<RouteProp<OTPRouteParams, 'OTP'>>();
  const navigation = useNavigation();

  const { phoneNumber, verificationId, recaptchaVerifier } = route.params ?? {};

  // OTP digit state - array of 6 digits
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));

  // Input refs for auto-focus
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Loading and error states
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Countdown timer state
  const [countdown, setCountdown] = useState(0);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Initialize countdown timer on mount
   */
  useEffect(() => {
    if (phoneNumber) {
      const remaining = getCooldownRemaining(phoneNumber);
      if (remaining > 0) {
        setCountdown(Math.ceil(remaining / 1000));
      } else {
        setCountdown(OTP_COOLDOWN_SECONDS);
      }
    }

    // Auto-focus first input
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [phoneNumber]);

  /**
   * Countdown timer effect
   */
  useEffect(() => {
    if (countdown > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [countdown]);

  /**
   * Auto-submit when all digits are entered
   */
  const handleAutoSubmit = useCallback(async (digits: string[]) => {
    const otpCode = digits.join('');
    if (otpCode.length !== OTP_LENGTH) return;

    setIsVerifying(true);
    setError(null);

    try {
      const result = await verifyOTP(phoneNumber, otpCode, verificationId);

      if (result.success) {
        // Navigate to home or next screen on success
        // The navigation will be handled by auth state listener
      } else {
        setError(result.error ?? 'Verification failed');
        // Clear OTP on error
        setOtpDigits(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setIsVerifying(false);
    }
  }, [phoneNumber, verificationId]);

  /**
   * Handle digit input change
   */
  const handleDigitChange = useCallback((text: string, index: number) => {
    // Only allow single digit
    const digit = text.replace(/[^0-9]/g, '').slice(-1);

    setOtpDigits((prev) => {
      const newDigits = [...prev];
      newDigits[index] = digit;

      // Auto-submit if all digits filled
      if (digit && newDigits.every((d) => d !== '')) {
        setTimeout(() => handleAutoSubmit(newDigits), 100);
      }

      return newDigits;
    });

    // Auto-focus next input
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Clear error on input
    if (error) setError(null);
  }, [error, handleAutoSubmit]);

  /**
   * Handle backspace key press
   */
  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
      if (e.nativeEvent.key === 'Backspace') {
        if (otpDigits[index] === '' && index > 0) {
          // Move to previous input if current is empty
          inputRefs.current[index - 1]?.focus();
          setOtpDigits((prev) => {
            const newDigits = [...prev];
            newDigits[index - 1] = '';
            return newDigits;
          });
        }
      }
    },
    [otpDigits]
  );

  /**
   * Handle resend OTP
   */
  const handleResend = useCallback(async () => {
    if (countdown > 0 || isResending || !recaptchaVerifier) return;

    setIsResending(true);
    setError(null);

    try {
      const result = await resendOTP(phoneNumber, recaptchaVerifier);

      if (result.success) {
        setCountdown(OTP_COOLDOWN_SECONDS);
        setOtpDigits(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      } else {
        if (result.cooldownRemaining) {
          setCountdown(Math.ceil(result.cooldownRemaining / 1000));
        }
        setError(result.error ?? 'Failed to resend code');
      }
    } catch (err) {
      setError('Failed to resend code');
    } finally {
      setIsResending(false);
    }
  }, [countdown, isResending, phoneNumber, recaptchaVerifier]);

  /**
   * Format countdown as MM:SS
   */
  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Mask phone number for display
   */
  const maskedPhone = phoneNumber
    ? `${phoneNumber.slice(0, 4)}****${phoneNumber.slice(-2)}`
    : '';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Verify Your Number</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to{'\n'}
            <Text style={styles.phoneNumber}>{maskedPhone}</Text>
          </Text>
        </View>

        {/* OTP Input */}
        <View style={styles.otpContainer}>
          {Array.from({ length: OTP_LENGTH }).map((_, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[
                styles.otpInput,
                otpDigits[index] ? styles.otpInputFilled : null,
                error ? styles.otpInputError : null,
              ]}
              value={otpDigits[index]}
              onChangeText={(text) => handleDigitChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              editable={!isVerifying}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
            />
          ))}
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Loading Indicator */}
        {isVerifying && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#FFD700" />
            <Text style={styles.loadingText}>Verifying...</Text>
          </View>
        )}

        {/* Countdown Timer */}
        <View style={styles.timerContainer}>
          {countdown > 0 ? (
            <Text style={styles.timerText}>
              Resend code in{' '}
              <Text style={styles.timerCountdown}>{formatCountdown(countdown)}</Text>
            </Text>
          ) : (
            <TouchableOpacity
              onPress={handleResend}
              disabled={isResending || !recaptchaVerifier}
              style={styles.resendButton}
            >
              {isResending ? (
                <ActivityIndicator size="small" color="#FFD700" />
              ) : (
                <Text
                  style={[
                    styles.resendText,
                    !recaptchaVerifier && styles.resendTextDisabled,
                  ]}
                >
                  Resend Code
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={isVerifying}
        >
          <Text style={styles.backButtonText}>Change Phone Number</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 24,
  },
  phoneNumber: {
    color: '#FFD700',
    fontWeight: '600',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333333',
    backgroundColor: '#1A1A1A',
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: '#FFD700',
    backgroundColor: '#1A1A1A',
  },
  otpInputError: {
    borderColor: '#FF4444',
  },
  errorContainer: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#FF4444',
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  loadingText: {
    color: '#888888',
    fontSize: 14,
  },
  timerContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  timerText: {
    fontSize: 14,
    color: '#888888',
  },
  timerCountdown: {
    color: '#FFD700',
    fontWeight: '600',
  },
  resendButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  resendText: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: '600',
  },
  resendTextDisabled: {
    color: '#555555',
  },
  backButton: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    fontSize: 14,
    color: '#888888',
    textDecorationLine: 'underline',
  },
});
