import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { GlassPanel } from './GlassPanel';
import { Button } from './Button';
import { VEHICLE_TYPES, PRICING, VehicleTypeId } from '../../constants';

interface VehicleCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (vehicleType: VehicleTypeId) => void;
  selectedType: VehicleTypeId;
  onSelectType: (vehicleType: VehicleTypeId) => void;
  distanceKm?: number;
}

interface VehicleCardProps {
  type: VehicleTypeId;
  isSelected: boolean;
  onSelect: () => void;
  distanceKm?: number;
}

const VEHICLE_ICONS: Record<VehicleTypeId, keyof typeof Ionicons.glyphMap> = {
  moto: 'bicycle',
  berline: 'car-outline',
  suv: 'car-sport',
};

function getEstimatedPrice(type: VehicleTypeId, distanceKm: number): number {
  const pricing = PRICING[type];
  const distancePrice = pricing.baseFare + pricing.perKmRate * distanceKm;
  return Math.max(distancePrice, pricing.minimumFare) + pricing.bookingFee;
}

function getEstimatedETA(type: VehicleTypeId): string {
  // Mock ETA based on vehicle type availability
  const etaMinutes: Record<VehicleTypeId, number> = {
    moto: 3,
    berline: 5,
    suv: 8,
  };
  return `${etaMinutes[type]} min`;
}

function VehicleCard({
  type,
  isSelected,
  onSelect,
  distanceKm = 5,
}: VehicleCardProps) {
  const { theme } = useTheme();
  const { colors, mode } = theme;
  const vehicle = VEHICLE_TYPES[type];
  const pricing = PRICING[type];
  const estimatedPrice = getEstimatedPrice(type, distanceKm);
  const eta = getEstimatedETA(type);

  const getCardBackground = (): string => {
    if (isSelected) {
      return mode === 'dark'
        ? 'rgba(255, 193, 7, 0.2)'
        : 'rgba(255, 193, 7, 0.15)';
    }
    return mode === 'dark'
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(0, 0, 0, 0.03)';
  };

  const getBorderColor = (): string => {
    if (isSelected) {
      return colors.primary;
    }
    return mode === 'dark'
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.1)';
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onSelect}
      style={[
        styles.vehicleCard,
        {
          backgroundColor: getCardBackground(),
          borderColor: getBorderColor(),
          borderWidth: isSelected ? 2 : 1,
        },
      ]}
    >
      <View style={styles.vehicleIconContainer}>
        <Ionicons
          name={VEHICLE_ICONS[type]}
          size={32}
          color={isSelected ? colors.primary : colors.text}
        />
      </View>

      <View style={styles.vehicleInfo}>
        <View style={styles.vehicleHeader}>
          <Text
            style={[
              styles.vehicleName,
              { color: isSelected ? colors.primary : colors.text },
            ]}
          >
            {vehicle.name}
          </Text>
          <View style={styles.capacityBadge}>
            <Ionicons name="person" size={12} color={colors.textSecondary} />
            <Text style={[styles.capacityText, { color: colors.textSecondary }]}>
              {vehicle.capacity}
            </Text>
          </View>
        </View>
        <Text style={[styles.vehicleDescription, { color: colors.textSecondary }]}>
          {vehicle.description}
        </Text>
      </View>

      <View style={styles.vehiclePricing}>
        <Text style={[styles.priceText, { color: colors.text }]}>
          {estimatedPrice.toLocaleString()} F
        </Text>
        <View style={styles.etaContainer}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.etaText, { color: colors.textSecondary }]}>
            {eta}
          </Text>
        </View>
      </View>

      {isSelected && (
        <View style={[styles.selectedIndicator, { backgroundColor: colors.primary }]}>
          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export function VehicleCategoryModal({
  visible,
  onClose,
  onConfirm,
  selectedType,
  onSelectType,
  distanceKm = 5,
}: VehicleCategoryModalProps) {
  const { theme } = useTheme();
  const { colors } = theme;

  const handleConfirm = () => {
    onConfirm(selectedType);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayBackground}
          activeOpacity={1}
          onPress={onClose}
        />
        <GlassPanel position="bottom" style={styles.modalContent} padding={0}>
          <View style={styles.header}>
            <View style={styles.dragIndicator} />
            <Text style={[styles.title, { color: colors.text }]}>
              Choose Your Ride
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.vehicleList}>
            {(Object.keys(VEHICLE_TYPES) as VehicleTypeId[]).map((type) => (
              <VehicleCard
                key={type}
                type={type}
                isSelected={selectedType === type}
                onSelect={() => onSelectType(type)}
                distanceKm={distanceKm}
              />
            ))}
          </View>

          <View style={styles.footer}>
            <View style={styles.pricingNote}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={[styles.pricingNoteText, { color: colors.textSecondary }]}>
                Prices include booking fee. Final fare may vary.
              </Text>
            </View>
            <Button
              title="Confirm Ride"
              onPress={handleConfirm}
              variant="primary"
              size="large"
              fullWidth
            />
          </View>
        </GlassPanel>
      </View>
    </Modal>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    maxHeight: '80%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 2,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 24,
    padding: 4,
  },
  vehicleList: {
    padding: 16,
    gap: 12,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    position: 'relative',
  },
  vehicleIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  vehicleName: {
    fontSize: 18,
    fontWeight: '600',
  },
  capacityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  capacityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  vehicleDescription: {
    fontSize: 14,
  },
  vehiclePricing: {
    alignItems: 'flex-end',
  },
  priceText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  etaText: {
    fontSize: 13,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: 20,
    paddingTop: 12,
    gap: 12,
  },
  pricingNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  pricingNoteText: {
    fontSize: 12,
  },
});
