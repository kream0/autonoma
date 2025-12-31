import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { GlassPanel } from './GlassPanel';

const COUNTDOWN_DURATION = 30; // seconds
const CIRCLE_SIZE = 80;
const STROKE_WIDTH = 6;

interface RideOffer {
  id: string;
  clientName: string;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  fare: number;
}

interface RideOfferModalProps {
  visible: boolean;
  offer: RideOffer | null;
  onAccept: (offerId: string) => void;
  onDecline: (offerId: string) => void;
}

export function RideOfferModal({
  visible,
  offer,
  onAccept,
  onDecline,
}: RideOfferModalProps) {
  const { theme } = useTheme();
  const { colors, mode } = theme;

  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION);
  const animatedRotation = useRef(new Animated.Value(0)).current;
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Reset and start countdown when modal becomes visible
  useEffect(() => {
    if (visible && offer) {
      setCountdown(COUNTDOWN_DURATION);
      animatedRotation.setValue(0);

      // Start the rotation animation for the progress indicator
      animationRef.current = Animated.timing(animatedRotation, {
        toValue: 1,
        duration: COUNTDOWN_DURATION * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      animationRef.current.start();

      // Start countdown timer
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Auto-decline on timeout
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
            }
            onDecline(offer.id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
        }
        if (animationRef.current) {
          animationRef.current.stop();
        }
      };
    }
  }, [visible, offer, onDecline, animatedRotation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  const handleAccept = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    if (offer) {
      onAccept(offer.id);
    }
  };

  const handleDecline = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    if (offer) {
      onDecline(offer.id);
    }
  };

  if (!offer) return null;

  // Calculate progress percentage for display
  const progress = countdown / COUNTDOWN_DURATION;

  const getTimerColor = (): string => {
    if (countdown <= 10) return '#EF4444'; // Red when low
    if (countdown <= 20) return '#F59E0B'; // Amber when medium
    return '#22C55E'; // Green when high
  };

  // Rotate indicator from 0 to 360 degrees as time progresses
  const rotateInterpolate = animatedRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDecline}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayBackground}
          activeOpacity={1}
          onPress={() => {}} // Prevent dismiss on background tap
        />
        <GlassPanel position="floating" style={styles.modalContent} blur="heavy">
          {/* Circular Timer */}
          <View style={styles.timerContainer}>
            {/* Background circle */}
            <View
              style={[
                styles.timerCircle,
                {
                  borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                },
              ]}
            />
            {/* Progress arc segments */}
            <View style={styles.progressContainer}>
              {/* Top-right quadrant */}
              <Animated.View
                style={[
                  styles.progressQuadrant,
                  styles.progressTopRight,
                  {
                    borderColor: getTimerColor(),
                    opacity: progress > 0.75 ? 1 : 0.3,
                  },
                ]}
              />
              {/* Bottom-right quadrant */}
              <Animated.View
                style={[
                  styles.progressQuadrant,
                  styles.progressBottomRight,
                  {
                    borderColor: getTimerColor(),
                    opacity: progress > 0.5 ? 1 : 0.3,
                  },
                ]}
              />
              {/* Bottom-left quadrant */}
              <Animated.View
                style={[
                  styles.progressQuadrant,
                  styles.progressBottomLeft,
                  {
                    borderColor: getTimerColor(),
                    opacity: progress > 0.25 ? 1 : 0.3,
                  },
                ]}
              />
              {/* Top-left quadrant */}
              <Animated.View
                style={[
                  styles.progressQuadrant,
                  styles.progressTopLeft,
                  {
                    borderColor: getTimerColor(),
                    opacity: progress > 0 ? 1 : 0.3,
                  },
                ]}
              />
            </View>
            {/* Rotating indicator dot */}
            <Animated.View
              style={[
                styles.indicatorContainer,
                { transform: [{ rotate: rotateInterpolate }] },
              ]}
            >
              <View
                style={[
                  styles.indicatorDot,
                  { backgroundColor: getTimerColor() },
                ]}
              />
            </Animated.View>
            {/* Timer text */}
            <View style={styles.timerTextContainer}>
              <Text style={[styles.timerText, { color: getTimerColor() }]}>
                {countdown}
              </Text>
              <Text style={[styles.timerLabel, { color: colors.textSecondary }]}>
                sec
              </Text>
            </View>
          </View>

          {/* New Ride Request Header */}
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            New Ride Request
          </Text>

          {/* Client Info */}
          <View style={styles.clientSection}>
            <View style={[styles.clientAvatar, { backgroundColor: colors.primary }]}>
              <Ionicons name="person" size={24} color="#FFFFFF" />
            </View>
            <Text style={[styles.clientName, { color: colors.text }]}>
              {offer.clientName}
            </Text>
          </View>

          {/* Route Info */}
          <View style={styles.routeSection}>
            {/* Pickup */}
            <View style={styles.routeItem}>
              <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
              <View style={styles.routeTextContainer}>
                <Text style={[styles.routeLabel, { color: colors.textSecondary }]}>
                  Pickup
                </Text>
                <Text
                  style={[styles.routeAddress, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {offer.pickupAddress}
                </Text>
              </View>
            </View>

            {/* Route line */}
            <View style={styles.routeLine}>
              <View
                style={[
                  styles.routeLineDashed,
                  { borderColor: mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' },
                ]}
              />
            </View>

            {/* Dropoff */}
            <View style={styles.routeItem}>
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <View style={styles.routeTextContainer}>
                <Text style={[styles.routeLabel, { color: colors.textSecondary }]}>
                  Dropoff
                </Text>
                <Text
                  style={[styles.routeAddress, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {offer.dropoffAddress}
                </Text>
              </View>
            </View>
          </View>

          {/* Trip Details */}
          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Ionicons name="navigate-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {offer.distanceKm.toFixed(1)} km
              </Text>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                Distance
              </Text>
            </View>
            <View style={[styles.detailDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailItem}>
              <Ionicons name="cash-outline" size={20} color={colors.primary} />
              <Text style={[styles.detailValue, styles.fareValue, { color: colors.primary }]}>
                {offer.fare.toLocaleString()} F
              </Text>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                Fare
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.declineButton]}
              onPress={handleDecline}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={28} color="#FFFFFF" />
              <Text style={styles.buttonText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={handleAccept}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark" size={28} color="#FFFFFF" />
              <Text style={styles.buttonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </GlassPanel>
      </View>
    </Modal>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HALF_CIRCLE = CIRCLE_SIZE / 2;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    width: SCREEN_WIDTH - 40,
    maxWidth: 400,
    alignItems: 'center',
  },
  timerContainer: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  timerCircle: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: STROKE_WIDTH,
  },
  progressContainer: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
  },
  progressQuadrant: {
    position: 'absolute',
    width: HALF_CIRCLE,
    height: HALF_CIRCLE,
    borderWidth: STROKE_WIDTH,
  },
  progressTopRight: {
    top: 0,
    right: 0,
    borderTopRightRadius: HALF_CIRCLE,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  progressBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomRightRadius: HALF_CIRCLE,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  progressBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomLeftRadius: HALF_CIRCLE,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  progressTopLeft: {
    top: 0,
    left: 0,
    borderTopLeftRadius: HALF_CIRCLE,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  indicatorContainer: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: 'center',
  },
  indicatorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: -3,
  },
  timerTextContainer: {
    alignItems: 'center',
  },
  timerText: {
    fontSize: 28,
    fontWeight: '700',
  },
  timerLabel: {
    fontSize: 12,
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  clientSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
  },
  routeSection: {
    width: '100%',
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    marginRight: 12,
  },
  routeTextContainer: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  routeLine: {
    paddingLeft: 5,
    height: 24,
    justifyContent: 'center',
  },
  routeLineDashed: {
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    height: '100%',
    marginLeft: 0,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  fareValue: {
    fontSize: 20,
  },
  detailLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  detailDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  declineButton: {
    backgroundColor: '#EF4444',
  },
  acceptButton: {
    backgroundColor: '#22C55E',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
