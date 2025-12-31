/**
 * OSRM Routing Service
 * Provides routing functionality using the open-source OSRM API
 */

/**
 * OSRM API base URL (public demo server)
 * For production, deploy your own OSRM instance
 */
const OSRM_BASE_URL = 'https://router.project-osrm.org';

/**
 * Geographic coordinates
 */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Route information returned by OSRM
 */
export interface Route {
  /** Total distance in meters */
  distance: number;
  /** Total duration in seconds */
  duration: number;
  /** Decoded polyline coordinates */
  polyline: LatLng[];
  /** Encoded polyline string (Google format) */
  encodedPolyline: string;
}

/**
 * Route step information
 */
export interface RouteStep {
  /** Distance of this step in meters */
  distance: number;
  /** Duration of this step in seconds */
  duration: number;
  /** Maneuver type (turn left, straight, etc.) */
  maneuver: string;
  /** Human-readable instruction */
  instruction: string;
  /** Name of the road/street */
  name: string;
}

/**
 * Detailed route with step-by-step directions
 */
export interface DetailedRoute extends Route {
  /** Step-by-step navigation instructions */
  steps: RouteStep[];
}

/**
 * OSRM API response structure
 */
interface OSRMResponse {
  code: string;
  routes: Array<{
    distance: number;
    duration: number;
    geometry: string;
    legs: Array<{
      distance: number;
      duration: number;
      steps: Array<{
        distance: number;
        duration: number;
        name: string;
        maneuver: {
          type: string;
          modifier?: string;
          location: [number, number];
        };
      }>;
    }>;
  }>;
  waypoints: Array<{
    name: string;
    location: [number, number];
  }>;
}

/**
 * Decode a polyline encoded string into an array of coordinates
 * Uses the Google Polyline Algorithm
 *
 * @param encoded - Polyline encoded string
 * @returns Array of LatLng coordinates
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    // Decode longitude
    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return points;
}

/**
 * Encode an array of coordinates into a polyline string
 * Uses the Google Polyline Algorithm
 *
 * @param coordinates - Array of LatLng coordinates
 * @returns Encoded polyline string
 */
export function encodePolyline(coordinates: LatLng[]): string {
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const coord of coordinates) {
    const lat = Math.round(coord.lat * 1e5);
    const lng = Math.round(coord.lng * 1e5);

    encoded += encodeNumber(lat - prevLat);
    encoded += encodeNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

/**
 * Encode a single number for polyline
 */
function encodeNumber(num: number): string {
  let sgn_num = num << 1;
  if (num < 0) {
    sgn_num = ~sgn_num;
  }

  let encoded = '';
  while (sgn_num >= 0x20) {
    encoded += String.fromCharCode((0x20 | (sgn_num & 0x1f)) + 63);
    sgn_num >>= 5;
  }
  encoded += String.fromCharCode(sgn_num + 63);

  return encoded;
}

/**
 * Get a route between two points using OSRM
 *
 * @param origin - Starting point coordinates
 * @param destination - Ending point coordinates
 * @returns Route information or null if routing fails
 *
 * @example
 * ```typescript
 * const route = await getRoute(
 *   { lat: 14.6928, lng: -17.4467 }, // Dakar
 *   { lat: 14.7645, lng: -17.3660 }  // Parcelles Assainies
 * );
 * if (route) {
 *   console.log(`Distance: ${route.distance / 1000} km`);
 *   console.log(`Duration: ${route.duration / 60} minutes`);
 * }
 * ```
 */
export async function getRoute(
  origin: LatLng,
  destination: LatLng
): Promise<Route | null> {
  try {
    const url = `${OSRM_BASE_URL}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=polyline`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error('[OSRM] Request failed:', response.status);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('[OSRM] No routes found:', data.code);
      return null;
    }

    const route = data.routes[0];
    const polyline = decodePolyline(route.geometry);

    return {
      distance: route.distance,
      duration: route.duration,
      polyline,
      encodedPolyline: route.geometry,
    };
  } catch (error) {
    console.error('[OSRM] Error fetching route:', error);
    return null;
  }
}

/**
 * Get a route with multiple waypoints
 *
 * @param waypoints - Array of coordinates (origin, waypoints..., destination)
 * @returns Route information or null if routing fails
 */
export async function getRouteWithWaypoints(
  waypoints: LatLng[]
): Promise<Route | null> {
  if (waypoints.length < 2) {
    console.error('[OSRM] At least 2 waypoints required');
    return null;
  }

  try {
    const coordsString = waypoints
      .map((wp) => `${wp.lng},${wp.lat}`)
      .join(';');

    const url = `${OSRM_BASE_URL}/route/v1/driving/${coordsString}?overview=full&geometries=polyline`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error('[OSRM] Request failed:', response.status);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('[OSRM] No routes found:', data.code);
      return null;
    }

    const route = data.routes[0];
    const polyline = decodePolyline(route.geometry);

    return {
      distance: route.distance,
      duration: route.duration,
      polyline,
      encodedPolyline: route.geometry,
    };
  } catch (error) {
    console.error('[OSRM] Error fetching route:', error);
    return null;
  }
}

/**
 * Get detailed route with step-by-step navigation instructions
 *
 * @param origin - Starting point coordinates
 * @param destination - Ending point coordinates
 * @returns Detailed route with navigation steps or null if routing fails
 */
export async function getDetailedRoute(
  origin: LatLng,
  destination: LatLng
): Promise<DetailedRoute | null> {
  try {
    const url = `${OSRM_BASE_URL}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=polyline&steps=true`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error('[OSRM] Request failed:', response.status);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('[OSRM] No routes found:', data.code);
      return null;
    }

    const route = data.routes[0];
    const polyline = decodePolyline(route.geometry);

    // Extract steps from all legs
    const steps: RouteStep[] = [];
    for (const leg of route.legs) {
      for (const step of leg.steps) {
        steps.push({
          distance: step.distance,
          duration: step.duration,
          maneuver: step.maneuver.modifier
            ? `${step.maneuver.type} ${step.maneuver.modifier}`
            : step.maneuver.type,
          instruction: formatInstruction(step.maneuver.type, step.maneuver.modifier, step.name),
          name: step.name || 'Route',
        });
      }
    }

    return {
      distance: route.distance,
      duration: route.duration,
      polyline,
      encodedPolyline: route.geometry,
      steps,
    };
  } catch (error) {
    console.error('[OSRM] Error fetching detailed route:', error);
    return null;
  }
}

/**
 * Format navigation instruction in French
 */
function formatInstruction(type: string, modifier: string | undefined, name: string): string {
  const streetName = name || 'la route';

  switch (type) {
    case 'depart':
      return `Partez sur ${streetName}`;
    case 'arrive':
      return `Arrivez a ${streetName}`;
    case 'turn':
      switch (modifier) {
        case 'left':
          return `Tournez a gauche sur ${streetName}`;
        case 'right':
          return `Tournez a droite sur ${streetName}`;
        case 'slight left':
          return `Tournez legerement a gauche sur ${streetName}`;
        case 'slight right':
          return `Tournez legerement a droite sur ${streetName}`;
        case 'sharp left':
          return `Tournez fortement a gauche sur ${streetName}`;
        case 'sharp right':
          return `Tournez fortement a droite sur ${streetName}`;
        case 'straight':
          return `Continuez tout droit sur ${streetName}`;
        case 'uturn':
          return `Faites demi-tour sur ${streetName}`;
        default:
          return `Tournez sur ${streetName}`;
      }
    case 'continue':
      return `Continuez sur ${streetName}`;
    case 'merge':
      return `Rejoignez ${streetName}`;
    case 'on ramp':
      return `Prenez la bretelle vers ${streetName}`;
    case 'off ramp':
      return `Sortez vers ${streetName}`;
    case 'fork':
      if (modifier === 'left') {
        return `Prenez a gauche vers ${streetName}`;
      } else if (modifier === 'right') {
        return `Prenez a droite vers ${streetName}`;
      }
      return `Prenez la bifurcation vers ${streetName}`;
    case 'roundabout':
      return `Au rond-point, prenez ${streetName}`;
    case 'rotary':
      return `Au rond-point, prenez ${streetName}`;
    case 'end of road':
      if (modifier === 'left') {
        return `En fin de route, tournez a gauche sur ${streetName}`;
      } else if (modifier === 'right') {
        return `En fin de route, tournez a droite sur ${streetName}`;
      }
      return `En fin de route, continuez sur ${streetName}`;
    case 'new name':
      return `Continuez sur ${streetName}`;
    default:
      return `Continuez sur ${streetName}`;
  }
}

/**
 * Get estimated time of arrival
 *
 * @param durationSeconds - Route duration in seconds
 * @returns ETA as a Date object
 */
export function getETA(durationSeconds: number): Date {
  return new Date(Date.now() + durationSeconds * 1000);
}

/**
 * Format duration for display
 *
 * @param durationSeconds - Duration in seconds
 * @returns Formatted string like "15 min" or "1h 30min"
 */
export function formatDuration(durationSeconds: number): string {
  const minutes = Math.round(durationSeconds / 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}min`;
}

/**
 * Format distance for display
 *
 * @param distanceMeters - Distance in meters
 * @returns Formatted string like "500 m" or "2.5 km"
 */
export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  const km = distanceMeters / 1000;
  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }

  return `${Math.round(km)} km`;
}

/**
 * OSRM service object providing all routing functionality
 */
export const osrmService = {
  getRoute,
  getRouteWithWaypoints,
  getDetailedRoute,
  decodePolyline,
  encodePolyline,
  getETA,
  formatDuration,
  formatDistance,
} as const;

export default osrmService;
