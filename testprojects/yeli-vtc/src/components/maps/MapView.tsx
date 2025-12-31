/**
 * MapView - Configured Google Maps wrapper component
 * Provides a reusable map container with default settings for the VTC app
 */

import React, { useRef, useCallback, ReactNode } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import MapViewComponent, {
  MapViewProps as RNMapViewProps,
  PROVIDER_GOOGLE,
  Region,
  Camera,
} from 'react-native-maps';
import type { Coordinates } from '../../types/ride';

// Default region centered on Dakar, Senegal
const DEFAULT_REGION: Region = {
  latitude: 14.6928,
  longitude: -17.4467,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Default map styling for dark mode
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

export interface MapViewComponentProps extends Partial<RNMapViewProps> {
  children?: ReactNode;
  style?: ViewStyle;
  initialRegion?: Region;
  darkMode?: boolean;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  showsCompass?: boolean;
  showsTraffic?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  scrollEnabled?: boolean;
  pitchEnabled?: boolean;
  onMapReady?: () => void;
  onRegionChange?: (region: Region) => void;
  onRegionChangeComplete?: (region: Region) => void;
}

export interface MapViewRef {
  animateToRegion: (region: Region, duration?: number) => void;
  animateToCoordinate: (coordinate: Coordinates, duration?: number) => void;
  animateCamera: (camera: Partial<Camera>, duration?: number) => void;
  fitToCoordinates: (coordinates: Coordinates[], edgePadding?: { top: number; right: number; bottom: number; left: number }, animated?: boolean) => void;
  getCamera: () => Promise<Camera>;
  getMapBoundaries: () => Promise<{ northEast: Coordinates; southWest: Coordinates }>;
}

export const MapView = React.forwardRef<MapViewRef, MapViewComponentProps>(
  (
    {
      children,
      style,
      initialRegion = DEFAULT_REGION,
      darkMode = true,
      showsUserLocation = true,
      showsMyLocationButton = true,
      showsCompass = true,
      showsTraffic = false,
      zoomEnabled = true,
      rotateEnabled = true,
      scrollEnabled = true,
      pitchEnabled = true,
      onMapReady,
      onRegionChange,
      onRegionChangeComplete,
      ...restProps
    },
    ref
  ) => {
    const mapRef = useRef<MapViewComponent>(null);

    React.useImperativeHandle(ref, () => ({
      animateToRegion: (region: Region, duration = 1000) => {
        mapRef.current?.animateToRegion(region, duration);
      },
      animateToCoordinate: (coordinate: Coordinates, duration = 1000) => {
        const region: Region = {
          ...coordinate,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        mapRef.current?.animateToRegion(region, duration);
      },
      animateCamera: (camera: Partial<Camera>, duration = 1000) => {
        mapRef.current?.animateCamera(camera, { duration });
      },
      fitToCoordinates: (
        coordinates: Coordinates[],
        edgePadding = { top: 50, right: 50, bottom: 50, left: 50 },
        animated = true
      ) => {
        mapRef.current?.fitToCoordinates(coordinates, { edgePadding, animated });
      },
      getCamera: () => {
        return mapRef.current?.getCamera() ?? Promise.reject('Map not ready');
      },
      getMapBoundaries: () => {
        return mapRef.current?.getMapBoundaries() ?? Promise.reject('Map not ready');
      },
    }));

    const handleMapReady = useCallback(() => {
      onMapReady?.();
    }, [onMapReady]);

    return (
      <MapViewComponent
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={[styles.map, style]}
        initialRegion={initialRegion}
        customMapStyle={darkMode ? DARK_MAP_STYLE : undefined}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={showsMyLocationButton}
        showsCompass={showsCompass}
        showsTraffic={showsTraffic}
        zoomEnabled={zoomEnabled}
        rotateEnabled={rotateEnabled}
        scrollEnabled={scrollEnabled}
        pitchEnabled={pitchEnabled}
        onMapReady={handleMapReady}
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        mapPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
        loadingEnabled
        loadingIndicatorColor="#FF6B00"
        loadingBackgroundColor="#1E1E1E"
        {...restProps}
      >
        {children}
      </MapViewComponent>
    );
  }
);

MapView.displayName = 'MapView';

const styles = StyleSheet.create({
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});

export default MapView;
