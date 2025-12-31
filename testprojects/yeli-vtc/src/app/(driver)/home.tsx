/**
 * Driver Home Screen
 * Availability toggle, location tracking, and ride offer management
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  doc,
  updateDoc,
  onSnapshot,
  Timestamp,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import { useTheme } from '../../context/ThemeContext';
import { useLocation } from '../../hooks/useLocation';
import { useVoice } from '../../hooks/useVoice';
import { GlassCard } from '../../components/ui/GlassCard';
import { RideOfferModal } from '../../components/ui/RideOfferModal';

type DriverStatus = 'offline' | 'available' | 'busy';

interface DriverData {
  status: DriverStatus;
  currentJobId?: string;
  name?: string;
}

interface RideOffer {
  id: string;
  clientName: string;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  fare: number;
}

interface JobDocument {
  driverId: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  clientName?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  distanceKm?: number;
  fare?: number;
}

export default function DriverHomeScreen() {
  const { theme } = useTheme();
  const { colors } = theme;

  const [isOnline, setIsOnline] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [currentOffer, setCurrentOffer] = useState<RideOffer | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);

  const {
    currentLocation,
    isTracking,
    startTracking,
    stopTracking,
    error: locationError,
    requestPermissions,
  } = useLocation({ autoStart: false });

  // Initialize voice commands
  const { lastIntent, speak } = useVoice({
    onError: (error) => {
      console.error('Voice error:', error);
    },
  });

  // Listen to driver document for real-time updates
  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const driverRef = doc(db, 'drivers', userId);
    const unsubscribe = onSnapshot(
      driverRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as DriverData;
          setDriverData(data);
          setIsOnline(data.status === 'available' || data.status === 'busy');
        }
      },
      (error) => {
        console.error('Error listening to driver data:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Listen for incoming job offers (pending jobs assigned to this driver)
  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId || !isOnline) return;

    const jobsRef = collection(db, 'jobs');
    const pendingJobsQuery = query(
      jobsRef,
      where('driverId', '==', userId),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(
      pendingJobsQuery,
      (snapshot) => {
        // Check for new pending offers
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const jobData = change.doc.data() as JobDocument;
            const offer: RideOffer = {
              id: change.doc.id,
              clientName: jobData.clientName || 'Client',
              pickupAddress: jobData.pickupAddress || 'Adresse de prise en charge',
              dropoffAddress: jobData.dropoffAddress || 'Adresse de destination',
              distanceKm: jobData.distanceKm || 0,
              fare: jobData.fare || 0,
            };
            setCurrentOffer(offer);
            setShowOfferModal(true);
          }
        });
      },
      (error) => {
        console.error('Error listening to job offers:', error);
      }
    );

    return () => unsubscribe();
  }, [isOnline]);

  // Handle accepting a ride offer
  const handleAcceptOffer = useCallback(async (offerId: string) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const jobRef = doc(db, 'jobs', offerId);
      await updateDoc(jobRef, {
        status: 'accepted',
        acceptedAt: Timestamp.now(),
      });

      const driverRef = doc(db, 'drivers', userId);
      await updateDoc(driverRef, {
        status: 'busy',
        currentJobId: offerId,
      });

      setShowOfferModal(false);
      setCurrentOffer(null);
    } catch (error) {
      console.error('Error accepting job offer:', error);
      Alert.alert('Erreur', 'Impossible d\'accepter la course');
    }
  }, []);

  // Handle declining a ride offer
  const handleDeclineOffer = useCallback(async (offerId: string) => {
    try {
      const jobRef = doc(db, 'jobs', offerId);
      await updateDoc(jobRef, {
        status: 'cancelled',
        cancelledBy: 'driver',
        cancelledAt: Timestamp.now(),
      });

      setShowOfferModal(false);
      setCurrentOffer(null);
    } catch (error) {
      console.error('Error declining job offer:', error);
      Alert.alert('Erreur', 'Impossible de refuser la course');
    }
  }, []);

  // Update driver location in Firestore when tracking
  useEffect(() => {
    if (!isTracking || !currentLocation) return;

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const updateLocation = async () => {
      try {
        const driverRef = doc(db, 'drivers', userId);
        await updateDoc(driverRef, {
          location: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          },
          lastLocationUpdate: Timestamp.now(),
        });
      } catch (error) {
        console.error('Error updating driver location:', error);
      }
    };

    // Update location every 5 seconds
    const intervalId = setInterval(updateLocation, 5000);
    updateLocation(); // Initial update

    return () => clearInterval(intervalId);
  }, [isTracking, currentLocation]);

  // Handle availability toggle
  const handleToggleAvailability = useCallback(async (value: boolean) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      Alert.alert('Erreur', 'Vous devez être connecté');
      return;
    }

    // Request location permissions if going online
    if (value) {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        Alert.alert(
          'Permission requise',
          'L\'accès à la localisation est nécessaire pour recevoir des courses.'
        );
        return;
      }
    }

    setIsUpdating(true);

    try {
      const driverRef = doc(db, 'drivers', userId);
      const newStatus: DriverStatus = value ? 'available' : 'offline';

      await updateDoc(driverRef, {
        status: newStatus,
        lastStatusUpdate: Timestamp.now(),
      });

      setIsOnline(value);

      // Start or stop location tracking
      if (value) {
        startTracking();
      } else {
        stopTracking();
      }
    } catch (error) {
      console.error('Error updating driver status:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour votre statut');
    } finally {
      setIsUpdating(false);
    }
  }, [requestPermissions, startTracking, stopTracking]);

  // Handle voice intents for driver actions
  useEffect(() => {
    if (!lastIntent || lastIntent.type === 'unknown') return;

    switch (lastIntent.type) {
      case 'accept_ride':
        // Accept current offer if one exists
        if (currentOffer) {
          handleAcceptOffer(currentOffer.id);
          speak('Course acceptée');
        }
        break;
      case 'decline_ride':
        // Decline current offer if one exists
        if (currentOffer) {
          handleDeclineOffer(currentOffer.id);
          speak('Course refusée');
        }
        break;
      case 'go_online':
        // Go online if currently offline
        if (!isOnline && driverData?.status !== 'busy') {
          handleToggleAvailability(true);
          speak('Vous êtes maintenant en ligne');
        }
        break;
      case 'go_offline':
        // Go offline if currently online and not busy
        if (isOnline && driverData?.status !== 'busy') {
          handleToggleAvailability(false);
          speak('Vous êtes maintenant hors ligne');
        }
        break;
      default:
        // Other voice commands not handled on this screen
        break;
    }
  }, [lastIntent, currentOffer, isOnline, driverData?.status, handleAcceptOffer, handleDeclineOffer, handleToggleAvailability, speak]);

  // Get status display text
  const getStatusText = () => {
    if (isUpdating) return 'Mise à jour...';
    if (driverData?.status === 'busy') return 'En course';
    if (isOnline) return 'En ligne';
    return 'Hors ligne';
  };

  const getStatusColor = () => {
    if (driverData?.status === 'busy') return colors.primary;
    if (isOnline) return colors.success;
    return colors.textSecondary;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Header */}
        <Text style={[styles.title, { color: colors.text }]}>Accueil</Text>

        {/* Availability Card */}
        <GlassCard style={styles.availabilityCard}>
          <View style={styles.availabilityHeader}>
            <View>
              <Text style={[styles.availabilityLabel, { color: colors.textSecondary }]}>
                Disponibilité
              </Text>
              <Text style={[styles.statusText, { color: getStatusColor() }]}>
                {getStatusText()}
              </Text>
            </View>

            <View style={styles.toggleContainer}>
              {isUpdating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Switch
                  value={isOnline}
                  onValueChange={handleToggleAvailability}
                  trackColor={{
                    false: colors.border,
                    true: colors.success,
                  }}
                  thumbColor={isOnline ? '#FFFFFF' : '#F4F4F4'}
                  disabled={driverData?.status === 'busy'}
                />
              )}
            </View>
          </View>

          {driverData?.status === 'busy' && (
            <View style={[styles.busyBanner, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.busyText, { color: colors.primary }]}>
                Vous avez une course en cours
              </Text>
            </View>
          )}
        </GlassCard>

        {/* Status info when online */}
        {isOnline && !driverData?.currentJobId && (
          <GlassCard style={styles.statusCard}>
            <View style={styles.waitingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.waitingText, { color: colors.textSecondary }]}>
                En attente de courses...
              </Text>
            </View>

            {currentLocation && (
              <View style={styles.locationInfo}>
                <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>
                  Position actuelle
                </Text>
                <Text style={[styles.locationCoords, { color: colors.text }]}>
                  {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
                </Text>
              </View>
            )}

            {locationError && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {locationError.message}
              </Text>
            )}
          </GlassCard>
        )}

        {/* Offline message */}
        {!isOnline && (
          <View style={styles.offlineContainer}>
            <Text style={[styles.offlineTitle, { color: colors.text }]}>
              Vous êtes hors ligne
            </Text>
            <Text style={[styles.offlineSubtitle, { color: colors.textSecondary }]}>
              Activez votre disponibilité pour commencer à recevoir des courses
            </Text>
          </View>
        )}
      </View>

      {/* Ride Offer Modal */}
      <RideOfferModal
        visible={showOfferModal}
        offer={currentOffer}
        onAccept={handleAcceptOffer}
        onDecline={handleDeclineOffer}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  availabilityCard: {
    padding: 20,
    marginBottom: 16,
  },
  availabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 24,
    fontWeight: '700',
  },
  toggleContainer: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyBanner: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  busyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusCard: {
    padding: 20,
    marginBottom: 16,
  },
  waitingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  waitingText: {
    fontSize: 16,
  },
  locationInfo: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  locationLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
  errorText: {
    fontSize: 14,
    marginTop: 12,
  },
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  offlineSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
