/**
 * LocationMarkers - Pickup and dropoff markers for map display
 * Green marker for pickup, red marker for dropoff
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import type { Location } from '../../types/ride';

// Marker colors
const PICKUP_COLOR = '#00C853'; // Green
const DROPOFF_COLOR = '#FF3B30'; // Red
const WAYPOINT_COLOR = '#FF6B00'; // Orange (brand color)

interface MarkerProps {
  location: Location;
  title?: string;
  description?: string;
  draggable?: boolean;
  onDragEnd?: (coordinate: { latitude: number; longitude: number }) => void;
  onPress?: () => void;
}

interface PickupMarkerProps extends MarkerProps {}

interface DropoffMarkerProps extends MarkerProps {}

interface WaypointMarkerProps extends MarkerProps {
  index: number;
}

interface LocationMarkersProps {
  pickup?: Location;
  dropoff?: Location;
  waypoints?: Location[];
  showCallouts?: boolean;
  draggablePickup?: boolean;
  draggableDropoff?: boolean;
  onPickupDragEnd?: (coordinate: { latitude: number; longitude: number }) => void;
  onDropoffDragEnd?: (coordinate: { latitude: number; longitude: number }) => void;
  onPickupPress?: () => void;
  onDropoffPress?: () => void;
  onWaypointPress?: (index: number) => void;
}

/**
 * Custom marker pin component
 */
const MarkerPin: React.FC<{ color: string; label?: string }> = ({ color, label }) => (
  <View style={styles.markerContainer}>
    <View style={[styles.markerPin, { backgroundColor: color }]}>
      {label && <Text style={styles.markerLabel}>{label}</Text>}
    </View>
    <View style={[styles.markerStem, { backgroundColor: color }]} />
    <View style={[styles.markerDot, { backgroundColor: color }]} />
  </View>
);

/**
 * Pickup marker (green)
 */
export const PickupMarker: React.FC<PickupMarkerProps> = ({
  location,
  title = 'Point de prise en charge',
  description,
  draggable = false,
  onDragEnd,
  onPress,
}) => {
  return (
    <Marker
      coordinate={location}
      title={title}
      description={description || location.address}
      draggable={draggable}
      onDragEnd={(e) => onDragEnd?.(e.nativeEvent.coordinate)}
      onPress={onPress}
      anchor={{ x: 0.5, y: 1 }}
    >
      <MarkerPin color={PICKUP_COLOR} />
      <Callout tooltip>
        <View style={styles.calloutContainer}>
          <Text style={styles.calloutTitle}>{title}</Text>
          <Text style={styles.calloutAddress} numberOfLines={2}>
            {location.address}
          </Text>
          {location.name && (
            <Text style={styles.calloutName} numberOfLines={1}>
              {location.name}
            </Text>
          )}
        </View>
      </Callout>
    </Marker>
  );
};

/**
 * Dropoff marker (red)
 */
export const DropoffMarker: React.FC<DropoffMarkerProps> = ({
  location,
  title = 'Destination',
  description,
  draggable = false,
  onDragEnd,
  onPress,
}) => {
  return (
    <Marker
      coordinate={location}
      title={title}
      description={description || location.address}
      draggable={draggable}
      onDragEnd={(e) => onDragEnd?.(e.nativeEvent.coordinate)}
      onPress={onPress}
      anchor={{ x: 0.5, y: 1 }}
    >
      <MarkerPin color={DROPOFF_COLOR} />
      <Callout tooltip>
        <View style={styles.calloutContainer}>
          <Text style={styles.calloutTitle}>{title}</Text>
          <Text style={styles.calloutAddress} numberOfLines={2}>
            {location.address}
          </Text>
          {location.name && (
            <Text style={styles.calloutName} numberOfLines={1}>
              {location.name}
            </Text>
          )}
        </View>
      </Callout>
    </Marker>
  );
};

/**
 * Waypoint marker (orange with index number)
 */
export const WaypointMarker: React.FC<WaypointMarkerProps> = ({
  location,
  index,
  title,
  description,
  draggable = false,
  onDragEnd,
  onPress,
}) => {
  const waypointTitle = title || `Arrêt ${index + 1}`;

  return (
    <Marker
      coordinate={location}
      title={waypointTitle}
      description={description || location.address}
      draggable={draggable}
      onDragEnd={(e) => onDragEnd?.(e.nativeEvent.coordinate)}
      onPress={onPress}
      anchor={{ x: 0.5, y: 1 }}
    >
      <MarkerPin color={WAYPOINT_COLOR} label={String(index + 1)} />
      <Callout tooltip>
        <View style={styles.calloutContainer}>
          <Text style={styles.calloutTitle}>{waypointTitle}</Text>
          <Text style={styles.calloutAddress} numberOfLines={2}>
            {location.address}
          </Text>
          {location.name && (
            <Text style={styles.calloutName} numberOfLines={1}>
              {location.name}
            </Text>
          )}
        </View>
      </Callout>
    </Marker>
  );
};

/**
 * Combined component for displaying pickup, dropoff, and waypoint markers
 */
export const LocationMarkers: React.FC<LocationMarkersProps> = ({
  pickup,
  dropoff,
  waypoints = [],
  draggablePickup = false,
  draggableDropoff = false,
  onPickupDragEnd,
  onDropoffDragEnd,
  onPickupPress,
  onDropoffPress,
  onWaypointPress,
}) => {
  return (
    <>
      {pickup && (
        <PickupMarker
          location={pickup}
          draggable={draggablePickup}
          onDragEnd={onPickupDragEnd}
          onPress={onPickupPress}
        />
      )}
      {waypoints.map((waypoint, index) => (
        <WaypointMarker
          key={`waypoint-${index}`}
          location={waypoint}
          index={index}
          onPress={() => onWaypointPress?.(index)}
        />
      ))}
      {dropoff && (
        <DropoffMarker
          location={dropoff}
          draggable={draggableDropoff}
          onDragEnd={onDropoffDragEnd}
          onPress={onDropoffPress}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  markerContainer: {
    alignItems: 'center',
    width: 40,
    height: 50,
  },
  markerPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  markerStem: {
    width: 3,
    height: 10,
    marginTop: -2,
  },
  markerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -2,
  },
  calloutContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  calloutTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  calloutAddress: {
    color: '#CCCCCC',
    fontSize: 12,
    lineHeight: 16,
  },
  calloutName: {
    color: '#888888',
    fontSize: 11,
    marginTop: 4,
  },
});

export default LocationMarkers;
