/**
 * Customer Rides Screen
 * Displays paginated list of past rides with filtering, pull-to-refresh, and detail navigation
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { MapPin, Calendar, Star, ChevronRight, X, Filter } from 'lucide-react-native';
import { db, auth } from '../../config/firebase';
import { formatCFA } from '../../utils/currency';
import { TRIP_STATUS, TripStatus } from '../../constants';
import type { Trip, Location } from '../../types/ride';

const PAGE_SIZE = 20;

interface RideItemProps {
  trip: Trip;
  onPress: () => void;
}

type StatusFilter = TripStatus | 'all';

const STATUS_LABELS: Record<TripStatus, string> = {
  [TRIP_STATUS.PENDING]: 'En attente',
  [TRIP_STATUS.SEARCHING]: 'Recherche',
  [TRIP_STATUS.DRIVER_ASSIGNED]: 'Chauffeur assigné',
  [TRIP_STATUS.DRIVER_ARRIVING]: 'En route',
  [TRIP_STATUS.IN_PROGRESS]: 'En cours',
  [TRIP_STATUS.COMPLETED]: 'Terminée',
  [TRIP_STATUS.CANCELLED]: 'Annulée',
};

const STATUS_COLORS: Record<TripStatus, { bg: string; text: string }> = {
  [TRIP_STATUS.PENDING]: { bg: '#FFA50033', text: '#FFA500' },
  [TRIP_STATUS.SEARCHING]: { bg: '#3498DB33', text: '#3498DB' },
  [TRIP_STATUS.DRIVER_ASSIGNED]: { bg: '#9B59B633', text: '#9B59B6' },
  [TRIP_STATUS.DRIVER_ARRIVING]: { bg: '#1ABC9C33', text: '#1ABC9C' },
  [TRIP_STATUS.IN_PROGRESS]: { bg: '#3498DB33', text: '#3498DB' },
  [TRIP_STATUS.COMPLETED]: { bg: '#27AE6033', text: '#27AE60' },
  [TRIP_STATUS.CANCELLED]: { bg: '#E74C3C33', text: '#E74C3C' },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateAddress(address: string, maxLength = 30): string {
  if (address.length <= maxLength) return address;
  return address.substring(0, maxLength - 3) + '...';
}

function StatusBadge({ status }: { status: TripStatus }) {
  const colors = STATUS_COLORS[status] || { bg: '#66666633', text: '#666666' };
  const label = STATUS_LABELS[status] || status;

  return (
    <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.statusBadgeText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

function RideItem({ trip, onPress }: RideItemProps) {
  const fare = trip.finalFare ?? trip.estimatedFare;
  const dateStr = trip.tripCompletedAt || trip.createdAt;

  return (
    <TouchableOpacity style={styles.rideCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rideHeader}>
        <View style={styles.dateContainer}>
          <Calendar size={14} color="#888888" />
          <Text style={styles.dateText}>{formatDate(dateStr)}</Text>
        </View>
        <StatusBadge status={trip.status} />
      </View>

      <View style={styles.addressContainer}>
        <View style={styles.addressRow}>
          <View style={[styles.addressDot, { backgroundColor: '#27AE60' }]} />
          <Text style={styles.addressText} numberOfLines={1}>
            {truncateAddress(trip.pickup.address)}
          </Text>
        </View>
        <View style={styles.addressLine} />
        <View style={styles.addressRow}>
          <View style={[styles.addressDot, { backgroundColor: '#E74C3C' }]} />
          <Text style={styles.addressText} numberOfLines={1}>
            {truncateAddress(trip.dropoff.address)}
          </Text>
        </View>
      </View>

      <View style={styles.rideFooter}>
        <Text style={styles.fareText}>{formatCFA(fare)}</Text>
        {trip.driverRating !== undefined && trip.driverRating > 0 && (
          <View style={styles.ratingContainer}>
            <Star size={14} color="#FFD700" fill="#FFD700" />
            <Text style={styles.ratingText}>{trip.driverRating.toFixed(1)}</Text>
          </View>
        )}
        <ChevronRight size={20} color="#888888" />
      </View>
    </TouchableOpacity>
  );
}

function RideDetailModal({
  trip,
  visible,
  onClose,
}: {
  trip: Trip | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!trip) return null;

  const fare = trip.finalFare ?? trip.estimatedFare;
  const dateStr = trip.tripCompletedAt || trip.createdAt;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Détails de la course</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <X size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDate(dateStr)}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Statut</Text>
              <StatusBadge status={trip.status} />
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Départ</Text>
              <View style={styles.detailAddressRow}>
                <MapPin size={16} color="#27AE60" />
                <Text style={styles.detailAddressText}>{trip.pickup.address}</Text>
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Destination</Text>
              <View style={styles.detailAddressRow}>
                <MapPin size={16} color="#E74C3C" />
                <Text style={styles.detailAddressText}>{trip.dropoff.address}</Text>
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Tarif</Text>
              <Text style={styles.detailFare}>{formatCFA(fare)}</Text>
            </View>

            {trip.driver && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Chauffeur</Text>
                <Text style={styles.detailValue}>
                  {trip.driver.firstName} {trip.driver.lastName}
                </Text>
              </View>
            )}

            {trip.driverRating !== undefined && trip.driverRating > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Note du chauffeur</Text>
                <View style={styles.ratingContainer}>
                  <Star size={18} color="#FFD700" fill="#FFD700" />
                  <Text style={styles.detailRatingText}>
                    {trip.driverRating.toFixed(1)}
                  </Text>
                </View>
              </View>
            )}

            {trip.actualDistanceKm !== undefined && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Distance</Text>
                <Text style={styles.detailValue}>
                  {trip.actualDistanceKm.toFixed(1)} km
                </Text>
              </View>
            )}

            {trip.actualDurationMinutes !== undefined && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Durée</Text>
                <Text style={styles.detailValue}>
                  {trip.actualDurationMinutes} min
                </Text>
              </View>
            )}

            {trip.paymentMethod && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Paiement</Text>
                <Text style={styles.detailValue}>{trip.paymentMethod}</Text>
              </View>
            )}

            {trip.cancellationReason && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Raison d'annulation</Text>
                <Text style={styles.detailValueError}>{trip.cancellationReason}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FilterModal({
  visible,
  currentFilter,
  onSelect,
  onClose,
}: {
  visible: boolean;
  currentFilter: StatusFilter;
  onSelect: (filter: StatusFilter) => void;
  onClose: () => void;
}) {
  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Toutes les courses' },
    { value: TRIP_STATUS.COMPLETED, label: 'Terminées' },
    { value: TRIP_STATUS.CANCELLED, label: 'Annulées' },
    { value: TRIP_STATUS.IN_PROGRESS, label: 'En cours' },
    { value: TRIP_STATUS.PENDING, label: 'En attente' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.filterModalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.filterModalContent}>
          <Text style={styles.filterModalTitle}>Filtrer par statut</Text>
          {filterOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.filterOption,
                currentFilter === option.value && styles.filterOptionActive,
              ]}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
            >
              <Text
                style={[
                  styles.filterOptionText,
                  currentFilter === option.value && styles.filterOptionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function CustomerRidesScreen() {
  const [rides, setRides] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedRide, setSelectedRide] = useState<Trip | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchRides = useCallback(
    async (isRefresh = false) => {
      try {
        const customerId = auth.currentUser?.uid;
        if (!customerId) {
          setLoading(false);
          return;
        }

        const tripsRef = collection(db, 'trips');
        let tripsQuery;

        if (statusFilter === 'all') {
          tripsQuery = query(
            tripsRef,
            where('customer.id', '==', customerId),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE)
          );
        } else {
          tripsQuery = query(
            tripsRef,
            where('customer.id', '==', customerId),
            where('status', '==', statusFilter),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE)
          );
        }

        const snapshot = await getDocs(tripsQuery);
        const fetchedRides = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Trip[];

        setRides(fetchedRides);
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length === PAGE_SIZE);
      } catch (error) {
        console.error('Error fetching rides:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter]
  );

  const loadMoreRides = async () => {
    if (loadingMore || !hasMore || !lastDoc) return;

    setLoadingMore(true);
    try {
      const customerId = auth.currentUser?.uid;
      if (!customerId) return;

      const tripsRef = collection(db, 'trips');
      let tripsQuery;

      if (statusFilter === 'all') {
        tripsQuery = query(
          tripsRef,
          where('customer.id', '==', customerId),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
      } else {
        tripsQuery = query(
          tripsRef,
          where('customer.id', '==', customerId),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
      }

      const snapshot = await getDocs(tripsQuery);
      const moreRides = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Trip[];

      setRides((prev) => [...prev, ...moreRides]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error loading more rides:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setRides([]);
    setLastDoc(null);
    setHasMore(true);
    fetchRides();
  }, [statusFilter, fetchRides]);

  const onRefresh = () => {
    setRefreshing(true);
    setLastDoc(null);
    setHasMore(true);
    fetchRides(true);
  };

  const handleRidePress = (trip: Trip) => {
    setSelectedRide(trip);
    setDetailModalVisible(true);
  };

  const renderRideItem = ({ item }: { item: Trip }) => (
    <RideItem trip={item} onPress={() => handleRidePress(item)} />
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color="#FFD700" />
      </View>
    );
  };

  const renderEmptyState = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>Aucune course trouvée</Text>
        <Text style={styles.emptyStateSubtext}>
          {statusFilter === 'all'
            ? "Vos courses apparaîtront ici"
            : 'Aucune course avec ce statut'}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes courses</Text>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterModalVisible(true)}
        >
          <Filter size={20} color="#FFD700" />
          <Text style={styles.filterButtonText}>
            {statusFilter === 'all' ? 'Filtrer' : STATUS_LABELS[statusFilter as TripStatus]}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rides}
        renderItem={renderRideItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFD700"
            colors={['#FFD700']}
          />
        }
        onEndReached={loadMoreRides}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      <FilterModal
        visible={filterModalVisible}
        currentFilter={statusFilter}
        onSelect={setStatusFilter}
        onClose={() => setFilterModalVisible(false)}
      />

      <RideDetailModal
        trip={selectedRide}
        visible={detailModalVisible}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedRide(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    marginTop: 12,
    color: '#AAAAAA',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  filterButtonText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  rideCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    color: '#888888',
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addressContainer: {
    marginBottom: 12,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  addressLine: {
    width: 2,
    height: 16,
    backgroundColor: '#444444',
    marginLeft: 4,
    marginVertical: 4,
  },
  addressText: {
    color: '#FFFFFF',
    fontSize: 14,
    flex: 1,
  },
  rideFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#333333',
    paddingTop: 12,
  },
  fareText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 12,
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#888888',
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginTop: 8,
  },
  // Filter Modal
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterModalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 300,
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  filterOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#2A2A2A',
  },
  filterOptionActive: {
    backgroundColor: '#FFD70033',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  filterOptionText: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
  },
  filterOptionTextActive: {
    color: '#FFD700',
    fontWeight: '600',
  },
  // Detail Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 13,
    color: '#888888',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  detailValueError: {
    fontSize: 16,
    color: '#E74C3C',
  },
  detailFare: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFD700',
  },
  detailAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailAddressText: {
    fontSize: 16,
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 22,
  },
  detailRatingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
