/**
 * Driver Profile Screen
 * Displays editable profile fields, vehicle info, rating, and account status
 * Includes profile photo upload functionality
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { db, auth, storage } from '../../config/firebase';
import { VEHICLE_TYPES, DRIVER_STATUS } from '../../constants';
import type { Driver, DriverVehicle } from '../../types/driver';

type AccountStatus = 'active' | 'pending' | 'suspended' | 'inactive';

interface DriverProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  profileImageUrl?: string;
  vehicle: DriverVehicle;
  rating: number;
  totalTrips: number;
  status: string;
  accountStatus: AccountStatus;
  licenseNumber: string;
  licenseExpiry: string;
  isVerified: boolean;
}

export default function DriverProfileScreen() {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  const fetchProfile = async () => {
    try {
      const driverId = auth.currentUser?.uid;
      if (!driverId) {
        setLoading(false);
        return;
      }

      const driverDoc = await getDoc(doc(db, 'drivers', driverId));
      if (driverDoc.exists()) {
        const data = driverDoc.data() as Driver;
        const driverProfile: DriverProfile = {
          id: driverId,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          phoneNumber: data.phoneNumber || '',
          profileImageUrl: data.profileImageUrl,
          vehicle: data.vehicle || {
            id: '',
            type: 'berline',
            make: '',
            model: '',
            year: 0,
            color: '',
            licensePlate: '',
            capacity: 4,
            isVerified: false,
          },
          rating: data.rating || 0,
          totalTrips: data.totalTrips || 0,
          status: data.status || DRIVER_STATUS.OFFLINE,
          accountStatus: (data as { accountStatus?: AccountStatus }).accountStatus || 'pending',
          licenseNumber: data.licenseNumber || '',
          licenseExpiry: data.licenseExpiry || '',
          isVerified: data.isVerified || false,
        };

        setProfile(driverProfile);
        setFirstName(driverProfile.firstName);
        setLastName(driverProfile.lastName);
        setEmail(driverProfile.email);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      Alert.alert('Erreur', 'Impossible de charger le profil');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const handleSaveProfile = async () => {
    if (!profile) return;

    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Erreur', 'Le nom et le prénom sont obligatoires');
      return;
    }

    setSaving(true);
    try {
      const driverRef = doc(db, 'drivers', profile.id);
      await updateDoc(driverRef, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        updatedAt: serverTimestamp(),
      });

      setProfile({
        ...profile,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });

      setIsEditing(false);
      Alert.alert('Succès', 'Profil mis à jour');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder le profil');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setEmail(profile.email);
    }
    setIsEditing(false);
  };

  const handlePickImage = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          'Permission requise',
          'Veuillez autoriser l\'accès à la galerie pour changer votre photo de profil'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadProfilePhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
    }
  };

  const uploadProfilePhoto = async (uri: string) => {
    if (!profile) return;

    setUploadingPhoto(true);
    try {
      // Fetch the image as blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Upload to Firebase Storage
      const filename = `profile_${profile.id}_${Date.now()}.jpg`;
      const storageRef = ref(storage, `drivers/${profile.id}/${filename}`);

      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      // Update Firestore
      const driverRef = doc(db, 'drivers', profile.id);
      await updateDoc(driverRef, {
        profileImageUrl: downloadURL,
        updatedAt: serverTimestamp(),
      });

      setProfile({
        ...profile,
        profileImageUrl: downloadURL,
      });

      Alert.alert('Succès', 'Photo de profil mise à jour');
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Erreur', 'Impossible de télécharger la photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const getAccountStatusLabel = (status: AccountStatus): string => {
    switch (status) {
      case 'active':
        return 'Actif';
      case 'pending':
        return 'En attente de vérification';
      case 'suspended':
        return 'Suspendu';
      case 'inactive':
        return 'Inactif';
      default:
        return 'Inconnu';
    }
  };

  const getAccountStatusColor = (status: AccountStatus): string => {
    switch (status) {
      case 'active':
        return '#4CAF50';
      case 'pending':
        return '#FFC107';
      case 'suspended':
        return '#F44336';
      case 'inactive':
        return '#9E9E9E';
      default:
        return '#888888';
    }
  };

  const getVehicleTypeName = (typeId: string): string => {
    const vehicleType = VEHICLE_TYPES[typeId as keyof typeof VEHICLE_TYPES];
    return vehicleType?.name || typeId;
  };

  const renderRatingStars = (rating: number): string => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating - fullStars >= 0.5;
    let stars = '★'.repeat(fullStars);
    if (hasHalfStar && fullStars < 5) {
      stars += '☆';
    }
    stars += '☆'.repeat(Math.max(0, 5 - fullStars - (hasHalfStar ? 1 : 0)));
    return stars;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.loadingText}>Chargement du profil...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Profil non trouvé</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProfile}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </TouchableOpacity>
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
      {/* Profile Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.photoContainer}
          onPress={handlePickImage}
          disabled={uploadingPhoto}
        >
          {uploadingPhoto ? (
            <View style={styles.photoPlaceholder}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          ) : profile.profileImageUrl ? (
            <Image
              source={{ uri: profile.profileImageUrl }}
              style={styles.profilePhoto}
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>
                {firstName.charAt(0).toUpperCase()}
                {lastName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.cameraIcon}>
            <Text style={styles.cameraIconText}>📷</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.profileName}>
          {profile.firstName} {profile.lastName}
        </Text>
        <Text style={styles.phoneNumber}>{profile.phoneNumber}</Text>

        {/* Rating Display */}
        <View style={styles.ratingContainer}>
          <Text style={styles.ratingStars}>{renderRatingStars(profile.rating)}</Text>
          <Text style={styles.ratingValue}>
            {profile.rating > 0 ? profile.rating.toFixed(1) : 'N/A'}
          </Text>
          <Text style={styles.totalTrips}>({profile.totalTrips} courses)</Text>
        </View>
      </View>

      {/* Account Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statut du compte</Text>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: getAccountStatusColor(profile.accountStatus) },
              ]}
            />
            <Text style={styles.statusText}>
              {getAccountStatusLabel(profile.accountStatus)}
            </Text>
          </View>
          {profile.isVerified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓ Vérifié</Text>
            </View>
          )}
        </View>
      </View>

      {/* Personal Information */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Informations personnelles</Text>
          {!isEditing ? (
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Text style={styles.editButton}>Modifier</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity onPress={handleCancelEdit}>
                <Text style={styles.cancelButton}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveProfile} disabled={saving}>
                <Text style={styles.saveButton}>
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.inputCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Prénom</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Votre prénom"
                placeholderTextColor="#666666"
              />
            ) : (
              <Text style={styles.inputValue}>{profile.firstName}</Text>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nom</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Votre nom"
                placeholderTextColor="#666666"
              />
            ) : (
              <Text style={styles.inputValue}>{profile.lastName}</Text>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                placeholderTextColor="#666666"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : (
              <Text style={styles.inputValue}>
                {profile.email || 'Non renseigné'}
              </Text>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Téléphone</Text>
            <Text style={[styles.inputValue, styles.readOnly]}>
              {profile.phoneNumber}
            </Text>
          </View>
        </View>
      </View>

      {/* Vehicle Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Véhicule</Text>
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleHeader}>
            <Text style={styles.vehicleType}>
              {getVehicleTypeName(profile.vehicle.type)}
            </Text>
            {profile.vehicle.isVerified && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>✓ Vérifié</Text>
              </View>
            )}
          </View>

          <View style={styles.vehicleDetails}>
            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Marque</Text>
              <Text style={styles.vehicleValue}>
                {profile.vehicle.make || 'Non renseigné'}
              </Text>
            </View>

            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Modèle</Text>
              <Text style={styles.vehicleValue}>
                {profile.vehicle.model || 'Non renseigné'}
              </Text>
            </View>

            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Année</Text>
              <Text style={styles.vehicleValue}>
                {profile.vehicle.year > 0 ? profile.vehicle.year : 'Non renseigné'}
              </Text>
            </View>

            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Couleur</Text>
              <Text style={styles.vehicleValue}>
                {profile.vehicle.color || 'Non renseigné'}
              </Text>
            </View>

            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Plaque</Text>
              <Text style={styles.vehicleValue}>
                {profile.vehicle.licensePlate || 'Non renseigné'}
              </Text>
            </View>

            <View style={styles.vehicleRow}>
              <Text style={styles.vehicleLabel}>Capacité</Text>
              <Text style={styles.vehicleValue}>
                {profile.vehicle.capacity} passager{profile.vehicle.capacity > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* License Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permis de conduire</Text>
        <View style={styles.inputCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Numéro de permis</Text>
            <Text style={styles.inputValue}>
              {profile.licenseNumber || 'Non renseigné'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Date d'expiration</Text>
            <Text style={styles.inputValue}>
              {profile.licenseExpiry
                ? new Date(profile.licenseExpiry).toLocaleDateString('fr-FR')
                : 'Non renseigné'}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistiques</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.totalTrips}</Text>
            <Text style={styles.statLabel}>Courses totales</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {profile.rating > 0 ? profile.rating.toFixed(1) : '—'}
            </Text>
            <Text style={styles.statLabel}>Note moyenne</Text>
          </View>
        </View>
      </View>

      {/* Footer spacing */}
      <View style={styles.footer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    paddingTop: 20,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 20,
  },
  errorText: {
    color: '#F44336',
    fontSize: 18,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  photoContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profilePhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  photoPlaceholderText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFD700',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#1E1E1E',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333333',
  },
  cameraIconText: {
    fontSize: 14,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  phoneNumber: {
    fontSize: 16,
    color: '#888888',
    marginBottom: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingStars: {
    fontSize: 18,
    color: '#FFD700',
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  totalTrips: {
    fontSize: 14,
    color: '#888888',
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  editButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  editActions: {
    flexDirection: 'row',
    gap: 16,
  },
  cancelButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
  },
  saveButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  statusCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  verifiedBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  inputCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    overflow: 'hidden',
  },
  inputGroup: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 6,
  },
  inputValue: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  input: {
    fontSize: 16,
    color: '#FFFFFF',
    backgroundColor: '#2A2A2A',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444444',
  },
  readOnly: {
    color: '#888888',
  },
  divider: {
    height: 1,
    backgroundColor: '#333333',
    marginLeft: 16,
  },
  vehicleCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
    overflow: 'hidden',
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    backgroundColor: '#252525',
  },
  vehicleType: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFD700',
  },
  vehicleDetails: {
    padding: 16,
  },
  vehicleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  vehicleLabel: {
    fontSize: 14,
    color: '#888888',
  },
  vehicleValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFD700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
  },
  footer: {
    height: 40,
  },
});
