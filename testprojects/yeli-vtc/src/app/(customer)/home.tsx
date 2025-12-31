/**
 * Customer Home Screen
 * Main booking flow with MapView, address inputs, route preview, vehicle selection, and booking
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MapView, MapViewRef } from '../../components/maps/MapView';
import { LocationMarkers } from '../../components/maps/LocationMarkers';
import { RoutePolyline } from '../../components/maps/RoutePolyline';
import { VehicleCategoryModal } from '../../components/ui/VehicleCategoryModal';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Button } from '../../components/ui/Button';
import { useRouter } from 'expo-router';
import { useLocation } from '../../hooks/useLocation';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useRideContext } from '../../context/RideContext';
import { createRide, CreateRideParams } from '../../services/rides/bookingService';
import { getETA } from '../../services/routing/etaService';
import { PRICING, VehicleTypeId, PaymentMethodId } from '../../constants';
import type { Location, Coordinates } from '../../types/ride';

// OSRM API endpoint for route calculation
const OSRM_API_URL = 'https://router.project-osrm.org/route/v1/driving';

interface RouteInfo {
  coordinates: Coordinates[];
  distanceKm: number;
  durationMinutes: number;
}

/**
 * Fetch route from OSRM API
 */
async function getRoute(
  origin: Coordinates,
  destination: Coordinates,
  waypoints?: Coordinates[]
): Promise<RouteInfo | null> {
  try {
    // Build coordinates string: origin;waypoints;destination
    const coords: Coordinates[] = [origin, ...(waypoints || []), destination];
    const coordsString = coords
      .map((c) => `${c.longitude},${c.latitude}`)
      .join(';');

    const url = `${OSRM_API_URL}/${coordsString}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error('[OSRM] Request failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('[OSRM] No routes found:', data.code);
      return null;
    }

    const route = data.routes[0];
    const geometry = route.geometry.coordinates;

    // Convert GeoJSON coordinates [lng, lat] to our format {latitude, longitude}
    const routeCoordinates: Coordinates[] = geometry.map(
      ([lng, lat]: [number, number]) => ({
        latitude: lat,
        longitude: lng,
      })
    );

    return {
      coordinates: routeCoordinates,
      distanceKm: route.distance / 1000, // Convert meters to km
      durationMinutes: route.duration / 60, // Convert seconds to minutes
    };
  } catch (error) {
    console.error('[OSRM] Error fetching route:', error);
    return null;
  }
}

/**
 * Calculate fare estimate for a vehicle type
 */
function calculateFare(
  vehicleType: VehicleTypeId,
  distanceKm: number,
  surgeMultiplier: number = 1
): number {
  const pricing = PRICING[vehicleType];
  const baseFare = pricing.baseFare;
  const distanceFare = pricing.perKmRate * distanceKm;
  const subtotal = baseFare + distanceFare;
  const withSurge = subtotal * surgeMultiplier;
  const total = Math.max(withSurge, pricing.minimumFare) + pricing.bookingFee;
  return Math.round(total);
}

/**
 * Geocode address to coordinates using Nominatim (OpenStreetMap)
 */
async function geocodeAddress(address: string): Promise<Location | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'YeliVTC/1.0',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      address: result.display_name,
      name: result.name || undefined,
    };
  } catch (error) {
    console.error('[Geocode] Error:', error);
    return null;
  }
}

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors, mode } = theme;
  const { user } = useAuth();
  const { subscribeToRide } = useRideContext();
  const mapRef = useRef<MapViewRef>(null);

  // Location state
  const {
    currentLocation,
    isLoading: isLocationLoading,
    error: locationError,
    getCurrentLocation,
    requestPermissions,
  } = useLocation({ autoStart: true });

  // Address inputs
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [isPickupFocused, setIsPickupFocused] = useState(false);
  const [isDropoffFocused, setIsDropoffFocused] = useState(false);

  // Locations
  const [pickupLocation, setPickupLocation] = useState<Location | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<Location | null>(null);

  // Route
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Vehicle selection
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedVehicleType, setSelectedVehicleType] = useState<VehicleTypeId>('berline');

  // Booking
  const [isBooking, setIsBooking] = useState(false);
  const [estimatedFare, setEstimatedFare] = useState<number>(0);
  const [paymentMethod] = useState<PaymentMethodId>('cash');
  const [surgeMultiplier] = useState(1);

  // Set current location as pickup when available
  useEffect(() => {
    if (currentLocation && !pickupLocation) {
      const location: Location = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        address: 'Ma position actuelle',
        name: 'Position actuelle',
      };
      setPickupLocation(location);
      setPickupAddress('Ma position actuelle');
    }
  }, [currentLocation, pickupLocation]);

  // Calculate route when both locations are set
  useEffect(() => {
    async function calculateRoute() {
      if (!pickupLocation || !dropoffLocation) {
        setRouteInfo(null);
        return;
      }

      setIsLoadingRoute(true);
      const route = await getRoute(pickupLocation, dropoffLocation);
      setRouteInfo(route);
      setIsLoadingRoute(false);

      // Fit map to show route
      if (route && mapRef.current) {
        mapRef.current.fitToCoordinates(
          [pickupLocation, dropoffLocation],
          { top: 150, right: 50, bottom: 350, left: 50 },
          true
        );
      }
    }

    calculateRoute();
  }, [pickupLocation, dropoffLocation]);

  // Update fare estimate when route or vehicle changes
  useEffect(() => {
    if (routeInfo) {
      const fare = calculateFare(selectedVehicleType, routeInfo.distanceKm, surgeMultiplier);
      setEstimatedFare(fare);
    } else {
      setEstimatedFare(0);
    }
  }, [routeInfo, selectedVehicleType, surgeMultiplier]);

  // Handle pickup address search
  const handlePickupSearch = useCallback(async () => {
    if (!pickupAddress.trim() || pickupAddress === 'Ma position actuelle') {
      return;
    }

    Keyboard.dismiss();
    const location = await geocodeAddress(pickupAddress);
    if (location) {
      setPickupLocation(location);
      setPickupAddress(location.address);

      if (mapRef.current) {
        mapRef.current.animateToCoordinate(location, 500);
      }
    } else {
      Alert.alert('Adresse non trouvée', 'Impossible de trouver cette adresse.');
    }
  }, [pickupAddress]);

  // Handle dropoff address search
  const handleDropoffSearch = useCallback(async () => {
    if (!dropoffAddress.trim()) {
      return;
    }

    Keyboard.dismiss();
    const location = await geocodeAddress(dropoffAddress);
    if (location) {
      setDropoffLocation(location);
      setDropoffAddress(location.address);

      if (mapRef.current && pickupLocation) {
        mapRef.current.fitToCoordinates(
          [pickupLocation, location],
          { top: 150, right: 50, bottom: 350, left: 50 },
          true
        );
      }
    } else {
      Alert.alert('Adresse non trouvée', 'Impossible de trouver cette adresse.');
    }
  }, [dropoffAddress, pickupLocation]);

  // Use current location for pickup
  const handleUseCurrentLocation = useCallback(async () => {
    const location = await getCurrentLocation();
    if (location) {
      const pickupLoc: Location = {
        latitude: location.latitude,
        longitude: location.longitude,
        address: 'Ma position actuelle',
        name: 'Position actuelle',
      };
      setPickupLocation(pickupLoc);
      setPickupAddress('Ma position actuelle');

      if (mapRef.current) {
        mapRef.current.animateToCoordinate(pickupLoc, 500);
      }
    }
  }, [getCurrentLocation]);

  // Handle vehicle selection
  const handleVehicleSelect = useCallback((vehicleType: VehicleTypeId) => {
    setSelectedVehicleType(vehicleType);
  }, []);

  // Handle vehicle confirmation from modal
  const handleVehicleConfirm = useCallback((vehicleType: VehicleTypeId) => {
    setSelectedVehicleType(vehicleType);
    setShowVehicleModal(false);
  }, []);

  // Handle booking
  const handleBookRide = useCallback(async () => {
    if (!user) {
      Alert.alert('Connexion requise', 'Veuillez vous connecter pour réserver.');
      return;
    }

    if (!pickupLocation || !dropoffLocation || !routeInfo) {
      Alert.alert('Informations manquantes', 'Veuillez définir les adresses de départ et d\'arrivée.');
      return;
    }

    setIsBooking(true);

    const rideParams: CreateRideParams = {
      customerId: user.uid,
      pickup: pickupLocation,
      dropoff: dropoffLocation,
      vehicleType: selectedVehicleType,
      paymentMethod: paymentMethod,
      estimatedFare: estimatedFare,
      estimatedDistanceKm: routeInfo.distanceKm,
      estimatedDurationMinutes: routeInfo.durationMinutes,
      surgeMultiplier: surgeMultiplier,
    };

    const result = await createRide(rideParams);

    setIsBooking(false);

    if (result.success && result.rideId) {
      // Subscribe to ride updates in RideContext
      subscribeToRide(result.rideId);

      // Navigate to tracking screen
      router.push('/(customer)/tracking');
    } else if (!result.success) {
      Alert.alert('Erreur', result.error || 'Impossible de créer la réservation.');
    }
  }, [
    user,
    pickupLocation,
    dropoffLocation,
    routeInfo,
    selectedVehicleType,
    paymentMethod,
    estimatedFare,
    surgeMultiplier,
    subscribeToRide,
    router,
  ]);

  // Get ETA info
  const etaInfo = routeInfo
    ? getETA(routeInfo.distanceKm, selectedVehicleType as 'moto' | 'berline' | 'suv')
    : null;

  // Can book only if we have both locations and a route
  const canBook = pickupLocation && dropoffLocation && routeInfo && !isLoadingRoute;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        darkMode={mode === 'dark'}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={
          currentLocation
            ? {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }
            : undefined
        }
      >
        {/* Location markers */}
        <LocationMarkers
          pickup={pickupLocation || undefined}
          dropoff={dropoffLocation || undefined}
        />

        {/* Route polyline */}
        {routeInfo && <RoutePolyline coordinates={routeInfo.coordinates} />}
      </MapView>

      {/* My location button */}
      <TouchableOpacity
        style={[styles.myLocationButton, { backgroundColor: colors.surface }]}
        onPress={handleUseCurrentLocation}
      >
        <Ionicons name="locate" size={24} color={colors.primary} />
      </TouchableOpacity>

      {/* Address input panel */}
      <GlassPanel position="top" style={styles.addressPanel}>
        {/* Pickup input */}
        <View style={styles.inputRow}>
          <View style={[styles.inputDot, { backgroundColor: '#00C853' }]} />
          <TextInput
            style={[
              styles.addressInput,
              {
                color: colors.text,
                backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              },
            ]}
            placeholder="Point de départ"
            placeholderTextColor={colors.textSecondary}
            value={pickupAddress}
            onChangeText={setPickupAddress}
            onFocus={() => setIsPickupFocused(true)}
            onBlur={() => setIsPickupFocused(false)}
            onSubmitEditing={handlePickupSearch}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={handleUseCurrentLocation} style={styles.inputButton}>
            <Ionicons name="locate-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Dropoff input */}
        <View style={styles.inputRow}>
          <View style={[styles.inputDot, { backgroundColor: '#FF3B30' }]} />
          <TextInput
            style={[
              styles.addressInput,
              {
                color: colors.text,
                backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              },
            ]}
            placeholder="Destination"
            placeholderTextColor={colors.textSecondary}
            value={dropoffAddress}
            onChangeText={setDropoffAddress}
            onFocus={() => setIsDropoffFocused(true)}
            onBlur={() => setIsDropoffFocused(false)}
            onSubmitEditing={handleDropoffSearch}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={handleDropoffSearch} style={styles.inputButton}>
            <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </GlassPanel>

      {/* Booking panel */}
      <GlassPanel position="bottom" style={styles.bookingPanel}>
        {/* Route info */}
        {isLoadingRoute && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Calcul de l'itinéraire...
            </Text>
          </View>
        )}

        {routeInfo && !isLoadingRoute && (
          <View style={styles.routeInfo}>
            <View style={styles.routeInfoItem}>
              <Ionicons name="navigate-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.routeInfoText, { color: colors.text }]}>
                {routeInfo.distanceKm.toFixed(1)} km
              </Text>
            </View>
            <View style={styles.routeInfoItem}>
              <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.routeInfoText, { color: colors.text }]}>
                {etaInfo?.formatted || `${Math.round(routeInfo.durationMinutes)} min`}
              </Text>
            </View>
          </View>
        )}

        {/* Vehicle selection button */}
        <TouchableOpacity
          style={[
            styles.vehicleSelector,
            {
              backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              borderColor: colors.border,
            },
          ]}
          onPress={() => setShowVehicleModal(true)}
          disabled={!canBook}
        >
          <View style={styles.vehicleSelectorLeft}>
            <Ionicons
              name={selectedVehicleType === 'moto' ? 'bicycle' : 'car-outline'}
              size={24}
              color={colors.primary}
            />
            <View style={styles.vehicleSelectorText}>
              <Text style={[styles.vehicleName, { color: colors.text }]}>
                {selectedVehicleType === 'moto'
                  ? 'Moto'
                  : selectedVehicleType === 'berline'
                  ? 'Berline'
                  : 'SUV'}
              </Text>
              <Text style={[styles.vehicleEta, { color: colors.textSecondary }]}>
                {routeInfo ? `~ ${Math.round(routeInfo.durationMinutes)} min` : 'Sélectionner'}
              </Text>
            </View>
          </View>
          <View style={styles.vehicleSelectorRight}>
            {estimatedFare > 0 && (
              <Text style={[styles.fareText, { color: colors.text }]}>
                {estimatedFare.toLocaleString()} F
              </Text>
            )}
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

        {/* Book button */}
        <Button
          title={isBooking ? 'Réservation...' : 'Réserver maintenant'}
          onPress={handleBookRide}
          variant="primary"
          size="large"
          fullWidth
          loading={isBooking}
          disabled={!canBook || isBooking}
        />

        {/* Payment method indicator */}
        <View style={styles.paymentInfo}>
          <Ionicons name="cash-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.paymentText, { color: colors.textSecondary }]}>
            Paiement en espèces
          </Text>
        </View>
      </GlassPanel>

      {/* Vehicle category modal */}
      <VehicleCategoryModal
        visible={showVehicleModal}
        onClose={() => setShowVehicleModal(false)}
        onConfirm={handleVehicleConfirm}
        selectedType={selectedVehicleType}
        onSelectType={handleVehicleSelect}
        distanceKm={routeInfo?.distanceKm || 5}
      />
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
  myLocationButton: {
    position: 'absolute',
    right: 16,
    top: 200,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  addressPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  addressInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  inputButton: {
    padding: 8,
  },
  divider: {
    paddingLeft: 6,
    paddingVertical: 4,
  },
  dividerLine: {
    width: 2,
    height: 16,
    marginLeft: 4,
    borderRadius: 1,
  },
  bookingPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    gap: 16,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 14,
  },
  routeInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 8,
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeInfoText: {
    fontSize: 15,
    fontWeight: '500',
  },
  vehicleSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  vehicleSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vehicleSelectorText: {
    gap: 2,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '600',
  },
  vehicleEta: {
    fontSize: 13,
  },
  vehicleSelectorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fareText: {
    fontSize: 18,
    fontWeight: '700',
  },
  paymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 4,
  },
  paymentText: {
    fontSize: 13,
  },
});
