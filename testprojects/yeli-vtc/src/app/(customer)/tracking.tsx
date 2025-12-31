/**
 * Customer Tracking Screen
 * Real-time ride tracking with map, driver info, ETA, and action buttons
 * Phase-specific UI: waiting for driver, driver arrived, in-ride
 */

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  Image,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MapView, MapViewRef } from '../../components/maps/MapView';
import { DriverMarker } from '../../components/maps/DriverMarker';
import { LocationMarkers } from '../../components/maps/LocationMarkers';
import { RoutePolyline, TripRoutePolyline } from '../../components/maps/RoutePolyline';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Button } from '../../components/ui/Button';
import { useRideContext, RidePhase } from '../../context/RideContext';
import { useTheme } from '../../context/ThemeContext';
import { formatETA, getETA } from '../../services/routing/etaService';
import type { Coordinates } from '../../types/ride';

// OSRM API endpoint for route calculation
const OSRM_API_URL = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Fetch route coordinates from OSRM API
 */
async function getRouteCoordinates(
  origin: Coordinates,
  destination: Coordinates
): Promise<Coordinates[] | null> {
  try {
    const coordsString = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${OSRM_API_URL}/${coordsString}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    return route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
      latitude: lat,
      longitude: lng,
    }));
  } catch {
    return null;
  }
}

/**
 * Calculate distance between two coordinates in km
 */
function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.latitude * Math.PI) / 180) *
      Math.cos((coord2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function CustomerTrackingScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors, mode } = theme;
  const mapRef = useRef<MapViewRef>(null);

  // Ride context
  const {
    phase,
    currentRide,
    driver,
    driverLocation,
    pickup,
    dropoff,
    loading,
    error,
    isGoingToPickup,
    isAtPickup,
    isInRide,
    isCompleted,
    hasActiveRide,
    cancelRide,
    clearError,
  } = useRideContext();

  // Local state
  const [routeToPickup, setRouteToPickup] = useState<Coordinates[]>([]);
  const [routeToDropoff, setRouteToDropoff] = useState<Coordinates[]>([]);
  const [distanceToTarget, setDistanceToTarget] = useState<number>(0);
  const [etaMinutes, setEtaMinutes] = useState<number>(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  // Animation refs for phase transitions
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for status indicators
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Fade in animation for phase transitions
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [phase, fadeAnim]);

  // Track driver location updates
  useEffect(() => {
    if (driverLocation) {
      setLastUpdateTime(new Date());
    }
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  // Calculate route from driver to pickup
  useEffect(() => {
    async function fetchRouteToPickup() {
      if (!driverLocation || !pickup || isInRide) return;

      const route = await getRouteCoordinates(
        { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
        pickup
      );
      if (route) {
        setRouteToPickup(route);
      }
    }

    fetchRouteToPickup();
  }, [driverLocation?.latitude, driverLocation?.longitude, pickup, isInRide]);

  // Calculate route from pickup to dropoff (or current location to dropoff during ride)
  useEffect(() => {
    async function fetchRouteToDropoff() {
      if (!dropoff) return;

      if (isInRide && driverLocation) {
        // During ride: route from current driver location to dropoff
        const route = await getRouteCoordinates(
          { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
          dropoff
        );
        if (route) {
          setRouteToDropoff(route);
        }
      } else if (pickup) {
        // Before ride: route from pickup to dropoff
        const route = await getRouteCoordinates(pickup, dropoff);
        if (route) {
          setRouteToDropoff(route);
        }
      }
    }

    fetchRouteToDropoff();
  }, [driverLocation?.latitude, driverLocation?.longitude, pickup, dropoff, isInRide]);

  // Calculate distance and ETA
  useEffect(() => {
    if (!driverLocation) return;

    let targetLocation: Coordinates | null = null;

    if (isGoingToPickup || isAtPickup) {
      targetLocation = pickup;
    } else if (isInRide) {
      targetLocation = dropoff;
    }

    if (targetLocation) {
      const distance = calculateDistance(
        { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
        targetLocation
      );
      setDistanceToTarget(distance);

      const vehicleType = currentRide?.vehicleType === 'moto' ? 'moto' :
                          currentRide?.vehicleType === 'suv' ? 'suv' : 'berline';
      const eta = getETA(distance, vehicleType);
      setEtaMinutes(eta.minutes);
    }
  }, [driverLocation, pickup, dropoff, isGoingToPickup, isAtPickup, isInRide, currentRide?.vehicleType]);

  // Fit map to show relevant markers
  useEffect(() => {
    if (!mapRef.current) return;

    const coordinates: Coordinates[] = [];

    if (driverLocation) {
      coordinates.push({ latitude: driverLocation.latitude, longitude: driverLocation.longitude });
    }

    if (isGoingToPickup || isAtPickup) {
      if (pickup) coordinates.push(pickup);
    } else if (isInRide) {
      if (dropoff) coordinates.push(dropoff);
    }

    if (coordinates.length >= 2) {
      mapRef.current.fitToCoordinates(
        coordinates,
        { top: 100, right: 50, bottom: 350, left: 50 },
        true
      );
    } else if (coordinates.length === 1) {
      mapRef.current.animateToCoordinate(coordinates[0], 500);
    }
  }, [driverLocation, pickup, dropoff, isGoingToPickup, isAtPickup, isInRide]);

  // Handle call driver
  const handleCallDriver = useCallback(() => {
    if (!driver?.phoneNumber) {
      Alert.alert('Erreur', 'Numéro de téléphone du chauffeur non disponible');
      return;
    }

    const phoneUrl = `tel:${driver.phoneNumber}`;
    Linking.canOpenURL(phoneUrl).then((supported) => {
      if (supported) {
        Linking.openURL(phoneUrl);
      } else {
        Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application téléphone');
      }
    });
  }, [driver?.phoneNumber]);

  // Handle cancel ride
  const handleCancelRide = useCallback(() => {
    Alert.alert(
      'Annuler la course',
      'Êtes-vous sûr de vouloir annuler cette course ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              await cancelRide('Annulation par le client');
              router.replace('/(customer)/home');
            } catch {
              Alert.alert('Erreur', 'Impossible d\'annuler la course');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  }, [cancelRide, router]);

  // Handle error display
  useEffect(() => {
    if (error) {
      Alert.alert('Erreur', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  // Redirect if no active ride
  useEffect(() => {
    if (!hasActiveRide && !loading) {
      router.replace('/(customer)/home');
    }
  }, [hasActiveRide, loading, router]);

  // Redirect when ride is completed
  useEffect(() => {
    if (isCompleted) {
      Alert.alert(
        'Course terminée',
        'Votre course est terminée. Merci d\'avoir utilisé Yeli VTC !',
        [{ text: 'OK', onPress: () => router.replace('/(customer)/home') }]
      );
    }
  }, [isCompleted, router]);

  // Phase-specific UI configuration
  const phaseConfig = useMemo(() => {
    const configs: Record<RidePhase, {
      statusMessage: string;
      statusIcon: keyof typeof Ionicons.glyphMap;
      statusColor: string;
      etaLabel: string;
      instruction: string;
      showPulse: boolean;
      backgroundColor: string;
    }> = {
      idle: {
        statusMessage: 'Recherche en cours...',
        statusIcon: 'search-outline',
        statusColor: colors.textSecondary,
        etaLabel: '',
        instruction: '',
        showPulse: false,
        backgroundColor: 'transparent',
      },
      going_to_pickup: {
        statusMessage: 'Le chauffeur arrive',
        statusIcon: 'car-outline',
        statusColor: colors.primary,
        etaLabel: 'Arrivée dans',
        instruction: 'Préparez-vous à rejoindre le point de prise en charge',
        showPulse: true,
        backgroundColor: colors.primary + '15',
      },
      at_pickup: {
        statusMessage: 'Le chauffeur est arrivé !',
        statusIcon: 'checkmark-circle',
        statusColor: colors.success,
        etaLabel: 'Le chauffeur vous attend',
        instruction: 'Rejoignez votre chauffeur maintenant',
        showPulse: true,
        backgroundColor: colors.success + '15',
      },
      in_ride: {
        statusMessage: 'En route vers la destination',
        statusIcon: 'navigate',
        statusColor: colors.primary,
        etaLabel: 'Arrivée destination',
        instruction: 'Profitez de votre trajet',
        showPulse: false,
        backgroundColor: colors.primary + '10',
      },
      completing: {
        statusMessage: 'Fin de la course...',
        statusIcon: 'flag-outline',
        statusColor: colors.success,
        etaLabel: '',
        instruction: 'Traitement en cours',
        showPulse: false,
        backgroundColor: colors.success + '10',
      },
      completed: {
        statusMessage: 'Course terminée',
        statusIcon: 'checkmark-done-circle',
        statusColor: colors.success,
        etaLabel: '',
        instruction: 'Merci d\'avoir utilisé Yeli VTC !',
        showPulse: false,
        backgroundColor: colors.success + '15',
      },
    };
    return configs[phase] || configs.idle;
  }, [phase, colors]);

  // Get status message based on phase
  const getStatusMessage = (): string => phaseConfig.statusMessage;

  // Get ETA label based on phase
  const getETALabel = (): string => phaseConfig.etaLabel;

  // Format last update time
  const formatLastUpdate = useCallback((): string => {
    if (!lastUpdateTime) return '';
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - lastUpdateTime.getTime()) / 1000);
    if (diffSeconds < 5) return 'À l\'instant';
    if (diffSeconds < 60) return `Il y a ${diffSeconds}s`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    return `Il y a ${diffMinutes} min`;
  }, [lastUpdateTime]);

  // Loading state
  if (loading && !currentRide) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Chargement...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        darkMode={mode === 'dark'}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {/* Driver marker */}
        {driverLocation && (
          <DriverMarker
            location={driverLocation}
            driverId={driver?.id}
            showPulse={isGoingToPickup}
          />
        )}

        {/* Location markers - show based on phase */}
        {isGoingToPickup || isAtPickup ? (
          <LocationMarkers pickup={pickup || undefined} />
        ) : isInRide ? (
          <LocationMarkers dropoff={dropoff || undefined} />
        ) : (
          <LocationMarkers pickup={pickup || undefined} dropoff={dropoff || undefined} />
        )}

        {/* Route polyline */}
        {isGoingToPickup && routeToPickup.length >= 2 && (
          <RoutePolyline coordinates={routeToPickup} color="#2196F3" strokeWidth={4} />
        )}

        {isInRide && routeToDropoff.length >= 2 && (
          <TripRoutePolyline routeCoordinates={routeToDropoff} strokeWidth={4} />
        )}

        {!isInRide && !isGoingToPickup && routeToDropoff.length >= 2 && (
          <RoutePolyline coordinates={routeToDropoff} color="#64B5F6" strokeWidth={3} />
        )}
      </MapView>

      {/* Status header */}
      <GlassPanel position="top" style={styles.statusPanel}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: isAtPickup ? colors.success : colors.primary }]} />
          <Text style={[styles.statusText, { color: colors.text }]}>
            {getStatusMessage()}
          </Text>
        </View>

        {/* ETA info */}
        {(isGoingToPickup || isInRide) && etaMinutes > 0 && (
          <View style={styles.etaRow}>
            <Text style={[styles.etaLabel, { color: colors.textSecondary }]}>
              {getETALabel()}
            </Text>
            <Text style={[styles.etaValue, { color: colors.text }]}>
              {formatETA(etaMinutes)}
            </Text>
            <Text style={[styles.distanceText, { color: colors.textSecondary }]}>
              ({distanceToTarget.toFixed(1)} km)
            </Text>
          </View>
        )}

        {isAtPickup && (
          <View style={styles.etaRow}>
            <Text style={[styles.arrivalText, { color: colors.success }]}>
              Le chauffeur est à votre position
            </Text>
          </View>
        )}
      </GlassPanel>

      {/* Bottom panel - Driver info and actions */}
      <GlassPanel position="bottom" style={styles.bottomPanel}>
        {/* Driver info card */}
        {driver && (
          <View style={styles.driverCard}>
            {/* Driver avatar and info */}
            <View style={styles.driverInfo}>
              <View style={[styles.driverAvatar, { backgroundColor: colors.surface }]}>
                {driver.profileImageUrl ? (
                  <Image
                    source={{ uri: driver.profileImageUrl }}
                    style={styles.driverImage}
                  />
                ) : (
                  <Ionicons name="person" size={28} color={colors.textSecondary} />
                )}
              </View>
              <View style={styles.driverDetails}>
                <Text style={[styles.driverName, { color: colors.text }]}>
                  {driver.firstName} {driver.lastName}
                </Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={[styles.ratingText, { color: colors.textSecondary }]}>
                    {driver.rating?.toFixed(1) || '4.8'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Vehicle info */}
            {driver.vehicle && (
              <View style={styles.vehicleInfo}>
                <Ionicons name="car-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.vehicleText, { color: colors.textSecondary }]}>
                  {driver.vehicle.make} {driver.vehicle.model} • {driver.vehicle.color}
                </Text>
              </View>
            )}

            {/* License plate */}
            {driver.vehicle?.licensePlate && (
              <View style={[styles.licensePlate, { backgroundColor: colors.surface }]}>
                <Text style={[styles.licensePlateText, { color: colors.text }]}>
                  {driver.vehicle.licensePlate}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          {/* Call driver button */}
          <TouchableOpacity
            style={[styles.callButton, { backgroundColor: colors.success }]}
            onPress={handleCallDriver}
          >
            <Ionicons name="call" size={22} color="#FFFFFF" />
            <Text style={styles.callButtonText}>Appeler</Text>
          </TouchableOpacity>

          {/* Cancel button - only show before ride starts */}
          {!isInRide && (
            <Button
              title={isCancelling ? 'Annulation...' : 'Annuler'}
              onPress={handleCancelRide}
              variant="outline"
              size="medium"
              loading={isCancelling}
              disabled={isCancelling}
              style={styles.cancelButton}
            />
          )}
        </View>

        {/* Trip details during ride */}
        {isInRide && dropoff && (
          <View style={styles.tripDetails}>
            <View style={styles.tripDetailRow}>
              <Ionicons name="location" size={18} color={colors.primary} />
              <Text
                style={[styles.tripDetailText, { color: colors.text }]}
                numberOfLines={2}
              >
                {dropoff.address}
              </Text>
            </View>
            {currentRide?.estimatedFare && (
              <View style={styles.tripDetailRow}>
                <Ionicons name="cash-outline" size={18} color={colors.success} />
                <Text style={[styles.fareText, { color: colors.text }]}>
                  {currentRide.estimatedFare.toLocaleString()} F CFA
                </Text>
              </View>
            )}
          </View>
        )}
      </GlassPanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  statusPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 17,
    fontWeight: '600',
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingLeft: 20,
  },
  etaLabel: {
    fontSize: 14,
  },
  etaValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  distanceText: {
    fontSize: 14,
  },
  arrivalText: {
    fontSize: 15,
    fontWeight: '600',
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 30,
    gap: 16,
  },
  driverCard: {
    gap: 12,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  driverDetails: {
    flex: 1,
    gap: 4,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 70,
  },
  vehicleText: {
    fontSize: 14,
  },
  licensePlate: {
    alignSelf: 'flex-start',
    marginLeft: 70,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  licensePlateText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  callButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
  },
  tripDetails: {
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
    marginTop: 4,
  },
  tripDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tripDetailText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  fareText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
