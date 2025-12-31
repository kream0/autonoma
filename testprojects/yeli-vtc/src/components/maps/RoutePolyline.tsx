/**
 * RoutePolyline - Blue polyline component for displaying routes on the map
 * Renders a polyline from an array of coordinates
 */

import React from 'react';
import { Polyline } from 'react-native-maps';
import type { Coordinates } from '../../types/ride';

// Route colors
const ROUTE_COLOR = '#2196F3'; // Blue
const ROUTE_COLOR_SECONDARY = '#64B5F6'; // Light blue for alternative routes
const ROUTE_COLOR_COMPLETED = '#4CAF50'; // Green for completed segments

interface RoutePolylineProps {
  coordinates: Coordinates[];
  color?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  geodesic?: boolean;
  tappable?: boolean;
  onPress?: () => void;
}

interface MultiRoutePolylineProps {
  routes: {
    coordinates: Coordinates[];
    color?: string;
    strokeWidth?: number;
    isActive?: boolean;
    isCompleted?: boolean;
  }[];
  onRoutePress?: (index: number) => void;
}

/**
 * Single route polyline component
 */
export const RoutePolyline: React.FC<RoutePolylineProps> = ({
  coordinates,
  color = ROUTE_COLOR,
  strokeWidth = 5,
  lineDashPattern,
  lineCap = 'round',
  lineJoin = 'round',
  geodesic = true,
  tappable = false,
  onPress,
}) => {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  return (
    <Polyline
      coordinates={coordinates}
      strokeColor={color}
      strokeWidth={strokeWidth}
      lineDashPattern={lineDashPattern}
      lineCap={lineCap}
      lineJoin={lineJoin}
      geodesic={geodesic}
      tappable={tappable}
      onPress={onPress}
    />
  );
};

/**
 * Multiple routes polyline component
 * Useful for showing main route and alternatives
 */
export const MultiRoutePolyline: React.FC<MultiRoutePolylineProps> = ({
  routes,
  onRoutePress,
}) => {
  return (
    <>
      {routes.map((route, index) => {
        const routeColor = route.isCompleted
          ? ROUTE_COLOR_COMPLETED
          : route.isActive
          ? route.color || ROUTE_COLOR
          : route.color || ROUTE_COLOR_SECONDARY;

        const routeWidth = route.isActive ? (route.strokeWidth || 5) : (route.strokeWidth || 3);
        const opacity = route.isActive ? 1 : 0.6;

        return (
          <Polyline
            key={`route-${index}`}
            coordinates={route.coordinates}
            strokeColor={routeColor}
            strokeWidth={routeWidth}
            lineCap="round"
            lineJoin="round"
            geodesic
            tappable={!route.isActive}
            onPress={() => onRoutePress?.(index)}
            strokeColors={undefined}
            zIndex={route.isActive ? 1 : 0}
          />
        );
      })}
    </>
  );
};

/**
 * Dashed polyline for walking segments or pending routes
 */
export const DashedRoutePolyline: React.FC<Omit<RoutePolylineProps, 'lineDashPattern'>> = (props) => {
  return (
    <RoutePolyline
      {...props}
      lineDashPattern={[10, 10]}
      strokeWidth={props.strokeWidth || 3}
    />
  );
};

/**
 * Trip route component with pickup-to-dropoff styling
 * Shows the route from pickup to dropoff with optional waypoints
 */
interface TripRoutePolylineProps {
  routeCoordinates: Coordinates[];
  completedCoordinates?: Coordinates[];
  remainingCoordinates?: Coordinates[];
  showProgress?: boolean;
  strokeWidth?: number;
}

export const TripRoutePolyline: React.FC<TripRoutePolylineProps> = ({
  routeCoordinates,
  completedCoordinates,
  remainingCoordinates,
  showProgress = false,
  strokeWidth = 5,
}) => {
  if (showProgress && completedCoordinates && remainingCoordinates) {
    return (
      <>
        {completedCoordinates.length >= 2 && (
          <RoutePolyline
            coordinates={completedCoordinates}
            color={ROUTE_COLOR_COMPLETED}
            strokeWidth={strokeWidth}
          />
        )}
        {remainingCoordinates.length >= 2 && (
          <RoutePolyline
            coordinates={remainingCoordinates}
            color={ROUTE_COLOR}
            strokeWidth={strokeWidth}
          />
        )}
      </>
    );
  }

  return (
    <RoutePolyline
      coordinates={routeCoordinates}
      color={ROUTE_COLOR}
      strokeWidth={strokeWidth}
    />
  );
};

export default RoutePolyline;
