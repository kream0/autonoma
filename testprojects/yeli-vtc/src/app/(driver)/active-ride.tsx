/**
 * Driver Active Ride Screen
 * 5-phase UI for managing an active ride:
 * 1. going_to_pickup - Route to client with navigation
 * 2. at_pickup - Wait screen for client
 * 3. in_ride - Route to destination
 * 4. completing - Processing completion spinner
 * 5. completed - Trip summary
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useTheme } from '../../context/ThemeContext';
import { useVoice } from '../../hooks/useVoice';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { formatCFA } from '../../utils/currency';
import type { Trip, Location, Coordinates } from '../../types/ride';
import type { DriverLocation } from '../../types/driver';

// Ride phases for the driver
export type RidePhase =
  | 'going_to_pickup'
  | 'at_pickup'
  | 'in_ride'
  | 'completing'
  | 'completed';

interface ActiveRideProps {
  trip: Trip;
  onPhaseChange?: (phase: RidePhase) => void;
  onComplete?: (trip: Trip) => void;
  onVoiceCommand?: (command: VoiceCommand) => void;
  onReturn?: () => void;
  getDriverLocation?: () => DriverLocation | null;
}

// Location update interval in milliseconds (10 seconds)
const LOCATION_UPDATE_INTERVAL_MS = 10000;

// Voice command types for integration
export type VoiceCommand =
  | 'arrived_pickup'
  | 'start_ride'
  | 'complete_ride'
  | 'call_customer'
  | 'navigate';

export default function ActiveRideScreen({
  trip: initialTrip,
  onPhaseChange,
  onComplete,
  onVoiceCommand,
  onReturn,
  getDriverLocation,
}: ActiveRideProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  const [phase, setPhase] = useState<RidePhase>('going_to_pickup');
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [waitStartTime, setWaitStartTime] = useState<Date | null>(null);
  const [waitDuration, setWaitDuration] = useState<number>(0);
  const locationUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize voice commands for active ride
  const { lastIntent, speak } = useVoice({
    onError: (error) => {
      console.error('[ActiveRide] Voice error:', error);
    },
  });

  /**
   * Update trip document in Firestore
   */
  const updateTripInFirestore = useCallback(
    async (updates: Partial<Trip>) => {
      if (!trip.id) {
        console.warn('[ActiveRide] Cannot update Firestore: trip.id is missing');
        return;
      }

      try {
        const tripRef = doc(db, 'trips', trip.id);
        await updateDoc(tripRef, {
          ...updates,
          updatedAt: serverTimestamp(),
        });
        console.log('[ActiveRide] Firestore trip updated:', Object.keys(updates));
      } catch (error) {
        console.error('[ActiveRide] Error updating Firestore trip:', error);
      }
    },
    [trip.id]
  );

  /**
   * Update driver location in Firestore trip document
   */
  const updateDriverLocationInTrip = useCallback(async () => {
    if (!getDriverLocation) return;

    const driverLocation = getDriverLocation();
    if (!driverLocation) return;

    await updateTripInFirestore({
      driverLocation,
    });
  }, [getDriverLocation, updateTripInFirestore]);

  // Start/stop location updates based on phase
  useEffect(() => {
    // Only update location during active ride phases
    const shouldUpdateLocation = phase === 'going_to_pickup' || phase === 'in_ride';

    if (shouldUpdateLocation && getDriverLocation) {
      // Initial location update
      updateDriverLocationInTrip();

      // Set up interval for periodic updates
      locationUpdateIntervalRef.current = setInterval(() => {
        updateDriverLocationInTrip();
      }, LOCATION_UPDATE_INTERVAL_MS);
    }

    return () => {
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
        locationUpdateIntervalRef.current = null;
      }
    };
  }, [phase, getDriverLocation, updateDriverLocationInTrip]);

  // Update wait duration every second when at pickup
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (phase === 'at_pickup' && waitStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - waitStartTime.getTime()) / 1000);
        setWaitDuration(elapsed);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [phase, waitStartTime]);

  // Format seconds to MM:SS
  const formatWaitTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle phase transitions
  const transitionToPhase = useCallback(
    (newPhase: RidePhase) => {
      setPhase(newPhase);
      onPhaseChange?.(newPhase);

      if (newPhase === 'at_pickup') {
        setWaitStartTime(new Date());
      }
    },
    [onPhaseChange]
  );

  // Phase 1: Arrived at pickup
  const handleArrivedAtPickup = useCallback(() => {
    transitionToPhase('at_pickup');
    onVoiceCommand?.('arrived_pickup');
  }, [transitionToPhase, onVoiceCommand]);

  // Phase 2: Start the ride
  const handleStartRide = useCallback(() => {
    transitionToPhase('in_ride');
    setTrip((prev) => ({
      ...prev,
      tripStartedAt: new Date().toISOString(),
    }));
    onVoiceCommand?.('start_ride');
  }, [transitionToPhase, onVoiceCommand]);

  // Phase 3: Complete the ride
  const handleCompleteRide = useCallback(() => {
    transitionToPhase('completing');
    onVoiceCommand?.('complete_ride');

    // Simulate completion processing
    setTimeout(() => {
      const completedTrip: Trip = {
        ...trip,
        tripCompletedAt: new Date().toISOString(),
        status: 'completed',
        phase: 'trip_completed',
        finalFare: trip.estimatedFare, // In production, calculate actual fare
        actualDistanceKm: trip.estimatedDistanceKm,
        actualDurationMinutes: trip.estimatedDurationMinutes,
      };
      setTrip(completedTrip);
      transitionToPhase('completed');
      onComplete?.(completedTrip);
    }, 2000);
  }, [trip, transitionToPhase, onComplete, onVoiceCommand]);

  // Call customer
  const handleCallCustomer = useCallback(() => {
    const phoneNumber = trip.customer.phoneNumber;
    if (phoneNumber) {
      Linking.openURL(`tel:${phoneNumber}`);
      onVoiceCommand?.('call_customer');
    }
  }, [trip.customer.phoneNumber, onVoiceCommand]);

  // Open navigation app
  const handleNavigate = useCallback(
    (destination: Location) => {
      const { latitude, longitude } = destination;
      const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
      Linking.openURL(url);
      onVoiceCommand?.('navigate');
    },
    [onVoiceCommand]
  );

  // Cancel ride confirmation
  const handleCancelRide = useCallback(() => {
    Alert.alert(
      'Annuler la course',
      'Voulez-vous vraiment annuler cette course?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: () => {
            // Handle cancellation logic
            Alert.alert('Course annulée');
          },
        },
      ]
    );
  }, []);

  // Handle voice intents for active ride actions
  useEffect(() => {
    if (!lastIntent || lastIntent.type === 'unknown') return;

    switch (lastIntent.type) {
      case 'complete_ride':
        // Handle 'arrived_pickup' when going to pickup, or 'complete_ride' when in ride
        if (phase === 'going_to_pickup') {
          // Voice says "arrivé" or "terminé" - interpret as arrived at pickup
          handleArrivedAtPickup();
          speak('Arrivée confirmée. En attente du client.');
        } else if (phase === 'in_ride') {
          // Complete the ride when in ride phase
          handleCompleteRide();
          speak('Course terminée.');
        }
        break;
      case 'confirm':
        // 'confirm' can be used to start ride when at pickup
        if (phase === 'at_pickup') {
          handleStartRide();
          speak('Course démarrée.');
        }
        break;
      case 'call_customer':
        // Call customer at any phase
        handleCallCustomer();
        speak('Appel du client.');
        break;
      case 'navigate':
        // Navigate to appropriate destination based on phase
        if (phase === 'going_to_pickup') {
          handleNavigate(trip.pickup);
          speak('Navigation vers le point de prise en charge.');
        } else if (phase === 'in_ride') {
          handleNavigate(trip.dropoff);
          speak('Navigation vers la destination.');
        }
        break;
      case 'cancel':
        // Cancel ride (with confirmation)
        if (phase !== 'completing' && phase !== 'completed') {
          handleCancelRide();
        }
        break;
      default:
        // Other voice commands not handled on this screen
        break;
    }
  }, [
    lastIntent,
    phase,
    trip.pickup,
    trip.dropoff,
    handleArrivedAtPickup,
    handleStartRide,
    handleCompleteRide,
    handleCallCustomer,
    handleNavigate,
    handleCancelRide,
    speak,
  ]);

  // Customer info display
  const renderCustomerInfo = () => (
    <GlassCard style={styles.customerCard}>
      <View style={styles.customerHeader}>
        <View style={styles.customerAvatar}>
          <Text style={styles.customerInitial}>
            {trip.customer.firstName?.charAt(0) || 'C'}
          </Text>
        </View>
        <View style={styles.customerDetails}>
          <Text style={[styles.customerName, { color: colors.text }]}>
            {trip.customer.firstName} {trip.customer.lastName}
          </Text>
          <TouchableOpacity onPress={handleCallCustomer}>
            <Text style={[styles.customerPhone, { color: colors.primary }]}>
              {trip.customer.phoneNumber}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.callButton} onPress={handleCallCustomer}>
          <Text style={styles.callButtonText}>Appeler</Text>
        </TouchableOpacity>
      </View>
    </GlassCard>
  );

  // Location info display
  const renderLocationInfo = (label: string, location: Location, showNavigate: boolean = false) => (
    <GlassCard style={styles.locationCard}>
      <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.locationAddress, { color: colors.text }]}>{location.address}</Text>
      {location.name && (
        <Text style={[styles.locationName, { color: colors.textSecondary }]}>{location.name}</Text>
      )}
      {showNavigate && (
        <TouchableOpacity
          style={[styles.navigateButton, { backgroundColor: colors.primary }]}
          onPress={() => handleNavigate(location)}
        >
          <Text style={styles.navigateButtonText}>Naviguer</Text>
        </TouchableOpacity>
      )}
    </GlassCard>
  );

  // Phase 1: Going to pickup
  const renderGoingToPickup = () => (
    <View style={styles.phaseContainer}>
      <View style={styles.phaseHeader}>
        <View style={[styles.phaseBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.phaseBadgeText}>En route vers le client</Text>
        </View>
      </View>

      {renderCustomerInfo()}
      {renderLocationInfo('Point de prise en charge', trip.pickup, true)}

      <View style={styles.tripInfo}>
        <View style={styles.tripInfoItem}>
          <Text style={[styles.tripInfoLabel, { color: colors.textSecondary }]}>Distance</Text>
          <Text style={[styles.tripInfoValue, { color: colors.text }]}>
            {trip.estimatedDistanceKm.toFixed(1)} km
          </Text>
        </View>
        <View style={styles.tripInfoItem}>
          <Text style={[styles.tripInfoLabel, { color: colors.textSecondary }]}>Tarif estimé</Text>
          <Text style={[styles.tripInfoValue, { color: colors.primary }]}>
            {formatCFA(trip.estimatedFare)}
          </Text>
        </View>
      </View>

      <View style={styles.actionButtons}>
        <Button
          title="Je suis arrivé"
          onPress={handleArrivedAtPickup}
          variant="primary"
          size="large"
          fullWidth
        />
        <TouchableOpacity style={styles.cancelLink} onPress={handleCancelRide}>
          <Text style={[styles.cancelLinkText, { color: colors.error }]}>Annuler la course</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Phase 2: At pickup - waiting for customer
  const renderAtPickup = () => (
    <View style={styles.phaseContainer}>
      <View style={styles.phaseHeader}>
        <View style={[styles.phaseBadge, { backgroundColor: '#FFA500' }]}>
          <Text style={styles.phaseBadgeText}>En attente du client</Text>
        </View>
      </View>

      {renderCustomerInfo()}

      <GlassCard style={styles.waitCard}>
        <Text style={[styles.waitLabel, { color: colors.textSecondary }]}>Temps d'attente</Text>
        <Text style={[styles.waitTime, { color: colors.text }]}>{formatWaitTime(waitDuration)}</Text>
        {waitDuration > 180 && (
          <Text style={[styles.waitWarning, { color: colors.error }]}>
            Attente supérieure à 3 minutes
          </Text>
        )}
      </GlassCard>

      {renderLocationInfo('Point de prise en charge', trip.pickup, false)}

      <View style={styles.actionButtons}>
        <Button
          title="Démarrer la course"
          onPress={handleStartRide}
          variant="primary"
          size="large"
          fullWidth
        />
        <TouchableOpacity style={styles.cancelLink} onPress={handleCancelRide}>
          <Text style={[styles.cancelLinkText, { color: colors.error }]}>Client absent</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Phase 3: In ride - navigating to destination
  const renderInRide = () => (
    <View style={styles.phaseContainer}>
      <View style={styles.phaseHeader}>
        <View style={[styles.phaseBadge, { backgroundColor: '#00C853' }]}>
          <Text style={styles.phaseBadgeText}>Course en cours</Text>
        </View>
      </View>

      {renderLocationInfo('Destination', trip.dropoff, true)}

      <View style={styles.tripInfo}>
        <View style={styles.tripInfoItem}>
          <Text style={[styles.tripInfoLabel, { color: colors.textSecondary }]}>Distance</Text>
          <Text style={[styles.tripInfoValue, { color: colors.text }]}>
            {trip.estimatedDistanceKm.toFixed(1)} km
          </Text>
        </View>
        <View style={styles.tripInfoItem}>
          <Text style={[styles.tripInfoLabel, { color: colors.textSecondary }]}>Durée estimée</Text>
          <Text style={[styles.tripInfoValue, { color: colors.text }]}>
            {trip.estimatedDurationMinutes} min
          </Text>
        </View>
        <View style={styles.tripInfoItem}>
          <Text style={[styles.tripInfoLabel, { color: colors.textSecondary }]}>Tarif</Text>
          <Text style={[styles.tripInfoValue, { color: colors.primary }]}>
            {formatCFA(trip.estimatedFare)}
          </Text>
        </View>
      </View>

      {trip.waypoints && trip.waypoints.length > 0 && (
        <GlassCard style={styles.waypointsCard}>
          <Text style={[styles.waypointsLabel, { color: colors.textSecondary }]}>
            Arrêts intermédiaires ({trip.waypoints.length})
          </Text>
          {trip.waypoints.map((waypoint, index) => (
            <View key={index} style={styles.waypointItem}>
              <View style={[styles.waypointDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.waypointAddress, { color: colors.text }]}>
                {waypoint.address}
              </Text>
            </View>
          ))}
        </GlassCard>
      )}

      <View style={styles.actionButtons}>
        <Button
          title="Terminer la course"
          onPress={handleCompleteRide}
          variant="primary"
          size="large"
          fullWidth
        />
      </View>
    </View>
  );

  // Phase 4: Completing - processing spinner
  const renderCompleting = () => (
    <View style={styles.completingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.completingText, { color: colors.text }]}>
        Finalisation de la course...
      </Text>
      <Text style={[styles.completingSubtext, { color: colors.textSecondary }]}>
        Veuillez patienter
      </Text>
    </View>
  );

  // Phase 5: Completed - trip summary
  const renderCompleted = () => (
    <View style={styles.phaseContainer}>
      <View style={styles.completedHeader}>
        <View style={[styles.completedIcon, { backgroundColor: colors.success }]}>
          <Text style={styles.completedIconText}>✓</Text>
        </View>
        <Text style={[styles.completedTitle, { color: colors.text }]}>Course terminée</Text>
      </View>

      <GlassCard style={styles.summaryCard}>
        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Résumé</Text>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryRowLabel, { color: colors.textSecondary }]}>De</Text>
          <Text style={[styles.summaryRowValue, { color: colors.text }]} numberOfLines={1}>
            {trip.pickup.address}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryRowLabel, { color: colors.textSecondary }]}>À</Text>
          <Text style={[styles.summaryRowValue, { color: colors.text }]} numberOfLines={1}>
            {trip.dropoff.address}
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryRowLabel, { color: colors.textSecondary }]}>Distance</Text>
          <Text style={[styles.summaryRowValue, { color: colors.text }]}>
            {(trip.actualDistanceKm ?? trip.estimatedDistanceKm).toFixed(1)} km
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryRowLabel, { color: colors.textSecondary }]}>Durée</Text>
          <Text style={[styles.summaryRowValue, { color: colors.text }]}>
            {trip.actualDurationMinutes ?? trip.estimatedDurationMinutes} min
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryRowLabel, { color: colors.textSecondary }]}>Paiement</Text>
          <Text style={[styles.summaryRowValue, { color: colors.text }]}>
            {trip.paymentMethod === 'cash' ? 'Espèces' : trip.paymentMethod}
          </Text>
        </View>

        <View style={styles.fareRow}>
          <Text style={[styles.fareLabel, { color: colors.text }]}>Total à percevoir</Text>
          <Text style={[styles.fareValue, { color: colors.primary }]}>
            {formatCFA(trip.finalFare ?? trip.estimatedFare)}
          </Text>
        </View>
      </GlassCard>

      <View style={styles.actionButtons}>
        <Button
          title="Confirmer le paiement"
          onPress={() => {
            Alert.alert('Paiement confirmé', 'La course a été enregistrée avec succès.', [
              {
                text: 'OK',
                onPress: onReturn,
              },
            ]);
          }}
          variant="primary"
          size="large"
          fullWidth
        />
        <TouchableOpacity style={styles.returnLink} onPress={onReturn}>
          <Text style={[styles.returnLinkText, { color: colors.textSecondary }]}>
            Retour au tableau de bord
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render current phase
  const renderPhase = () => {
    switch (phase) {
      case 'going_to_pickup':
        return renderGoingToPickup();
      case 'at_pickup':
        return renderAtPickup();
      case 'in_ride':
        return renderInRide();
      case 'completing':
        return renderCompleting();
      case 'completed':
        return renderCompleted();
      default:
        return renderGoingToPickup();
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {renderPhase()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  phaseContainer: {
    flex: 1,
  },
  phaseHeader: {
    marginBottom: 20,
  },
  phaseBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  phaseBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  customerCard: {
    marginBottom: 16,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF6B00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerInitial: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  customerPhone: {
    fontSize: 14,
  },
  callButton: {
    backgroundColor: '#00C853',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  locationCard: {
    marginBottom: 16,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  locationAddress: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  locationName: {
    fontSize: 14,
  },
  navigateButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  navigateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  tripInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  tripInfoItem: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    minWidth: '30%',
    flex: 1,
  },
  tripInfoLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  tripInfoValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  actionButtons: {
    marginTop: 20,
  },
  cancelLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  cancelLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  returnLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  returnLinkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  waitCard: {
    marginBottom: 16,
    alignItems: 'center',
    paddingVertical: 24,
  },
  waitLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  waitTime: {
    fontSize: 48,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  waitWarning: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
  },
  waypointsCard: {
    marginBottom: 16,
  },
  waypointsLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  waypointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  waypointDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  waypointAddress: {
    fontSize: 14,
    flex: 1,
  },
  completingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  completingText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
  },
  completingSubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  completedHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  completedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  completedIconText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  completedTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  summaryCard: {
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryRowLabel: {
    fontSize: 14,
    flex: 1,
  },
  summaryRowValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#333333',
    marginVertical: 12,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  fareLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
  fareValue: {
    fontSize: 24,
    fontWeight: '700',
  },
});
