/**
 * Driver Dashboard Screen
 * Shows today's earnings, rides count, hours online, and average rating
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../../config/firebase';
import { formatCFA } from '../../utils/currency';
import { TRIP_STATUS } from '../../constants';
import type { Trip } from '../../types/ride';

interface DashboardStats {
  todayEarnings: number;
  ridesCount: number;
  hoursOnline: number;
  averageRating: number;
}

export default function DriverDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    todayEarnings: 0,
    ridesCount: 0,
    hoursOnline: 0,
    averageRating: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardStats = async () => {
    try {
      const driverId = auth.currentUser?.uid;
      if (!driverId) {
        setLoading(false);
        return;
      }

      // Get start of today (midnight)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = Timestamp.fromDate(today);

      // Query completed trips for today
      const tripsRef = collection(db, 'trips');
      const tripsQuery = query(
        tripsRef,
        where('driver.id', '==', driverId),
        where('status', '==', TRIP_STATUS.COMPLETED),
        where('tripCompletedAt', '>=', todayTimestamp.toDate().toISOString())
      );

      const tripsSnapshot = await getDocs(tripsQuery);
      const trips = tripsSnapshot.docs.map((doc) => doc.data() as Trip);

      // Calculate stats
      let totalEarnings = 0;
      let totalRating = 0;
      let ratedTripsCount = 0;
      let totalDurationMinutes = 0;

      trips.forEach((trip) => {
        // Sum earnings (use finalFare if available, else estimatedFare)
        totalEarnings += trip.finalFare ?? trip.estimatedFare;

        // Sum ratings (only if customer rated the driver)
        if (trip.driverRating !== undefined && trip.driverRating > 0) {
          totalRating += trip.driverRating;
          ratedTripsCount++;
        }

        // Sum duration for hours online estimation
        totalDurationMinutes += trip.actualDurationMinutes ?? trip.estimatedDurationMinutes;
      });

      // Calculate average rating
      const avgRating = ratedTripsCount > 0 ? totalRating / ratedTripsCount : 0;

      // Convert minutes to hours (rounded to 1 decimal)
      const hoursOnline = Math.round((totalDurationMinutes / 60) * 10) / 10;

      setStats({
        todayEarnings: totalEarnings,
        ridesCount: trips.length,
        hoursOnline,
        averageRating: Math.round(avgRating * 10) / 10,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardStats();
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#FFD700"
          colors={['#FFD700']}
        />
      }
    >
      <Text style={styles.title}>Tableau de bord</Text>
      <Text style={styles.subtitle}>Aujourd'hui</Text>

      <View style={styles.statsGrid}>
        {/* Today's Earnings */}
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Gains du jour</Text>
          <Text style={styles.statValueLarge}>{formatCFA(stats.todayEarnings)}</Text>
        </View>

        {/* Rides Count */}
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Courses effectuées</Text>
          <Text style={styles.statValue}>{stats.ridesCount}</Text>
        </View>

        {/* Hours Online */}
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Heures en ligne</Text>
          <Text style={styles.statValue}>
            {stats.hoursOnline.toFixed(1)} h
          </Text>
        </View>

        {/* Average Rating */}
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Note moyenne</Text>
          <Text style={styles.statValue}>
            {stats.averageRating > 0 ? `${stats.averageRating.toFixed(1)} ★` : '—'}
          </Text>
        </View>
      </View>

      {stats.ridesCount === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Aucune course complétée aujourd'hui
          </Text>
          <Text style={styles.emptyStateSubtext}>
            Commencez à accepter des courses pour voir vos statistiques
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333333',
  },
  statLabel: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statValueLarge: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFD700',
  },
  emptyState: {
    marginTop: 32,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginTop: 8,
  },
});
