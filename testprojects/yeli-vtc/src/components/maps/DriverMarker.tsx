/**
 * DriverMarker - Animated car marker for driver location on map
 * Rotates based on heading and has smooth position transitions
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Marker } from 'react-native-maps';
import type { DriverLocation } from '../../types/driver';

// Brand color
const DRIVER_COLOR = '#FF6B00';

interface DriverMarkerProps {
  location: DriverLocation;
  driverId?: string;
  onPress?: () => void;
  showPulse?: boolean;
}

/**
 * Car icon SVG path rendered as View components
 * Pointing up (0 degrees = North)
 */
const CarIcon: React.FC<{ heading: number }> = ({ heading }) => {
  const rotateAnim = useRef(new Animated.Value(heading)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: heading,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [heading, rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.carContainer,
        { transform: [{ rotate: rotation }] },
      ]}
    >
      {/* Car body */}
      <View style={styles.carBody}>
        {/* Front windshield */}
        <View style={styles.carWindshieldFront} />

        {/* Car roof/cabin */}
        <View style={styles.carCabin} />

        {/* Rear windshield */}
        <View style={styles.carWindshieldRear} />
      </View>

      {/* Direction indicator (arrow at front) */}
      <View style={styles.directionArrow} />
    </Animated.View>
  );
};

/**
 * Pulse animation ring around the marker
 */
const PulseRing: React.FC = () => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.8,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
    };
  }, [scaleAnim, opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.pulseRing,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    />
  );
};

/**
 * DriverMarker component - displays driver location with animated car icon
 *
 * @param location - Driver location with coordinates and heading
 * @param driverId - Optional driver identifier
 * @param onPress - Optional press handler
 * @param showPulse - Whether to show pulse animation (default: true)
 */
export const DriverMarker: React.FC<DriverMarkerProps> = ({
  location,
  driverId,
  onPress,
  showPulse = true,
}) => {
  // Use animated values for smooth position transitions
  const latAnim = useRef(new Animated.Value(location.latitude)).current;
  const lngAnim = useRef(new Animated.Value(location.longitude)).current;
  const coordinateRef = useRef({
    latitude: location.latitude,
    longitude: location.longitude,
  });

  useEffect(() => {
    // Animate to new position
    Animated.parallel([
      Animated.timing(latAnim, {
        toValue: location.latitude,
        duration: 500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false, // Coordinates can't use native driver
      }),
      Animated.timing(lngAnim, {
        toValue: location.longitude,
        duration: 500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start();

    // Update ref for marker coordinate
    coordinateRef.current = {
      latitude: location.latitude,
      longitude: location.longitude,
    };
  }, [location.latitude, location.longitude, latAnim, lngAnim]);

  const heading = location.heading ?? 0;

  return (
    <Marker
      identifier={driverId}
      coordinate={{
        latitude: location.latitude,
        longitude: location.longitude,
      }}
      anchor={{ x: 0.5, y: 0.5 }}
      flat={true}
      tracksViewChanges={true}
      onPress={onPress}
    >
      <View style={styles.markerContainer}>
        {showPulse && <PulseRing />}
        <View style={styles.markerBackground}>
          <CarIcon heading={heading} />
        </View>
      </View>
    </Marker>
  );
};

const styles = StyleSheet.create({
  markerContainer: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: DRIVER_COLOR,
  },
  markerBackground: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DRIVER_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  carContainer: {
    width: 24,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carBody: {
    width: 18,
    height: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    alignItems: 'center',
    overflow: 'hidden',
  },
  carWindshieldFront: {
    width: 14,
    height: 6,
    backgroundColor: '#333333',
    borderRadius: 2,
    marginTop: 3,
  },
  carCabin: {
    width: 14,
    height: 8,
    backgroundColor: '#FFFFFF',
    marginTop: 2,
  },
  carWindshieldRear: {
    width: 14,
    height: 5,
    backgroundColor: '#333333',
    borderRadius: 2,
    marginTop: 2,
  },
  directionArrow: {
    position: 'absolute',
    top: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
});

export default DriverMarker;
