import { describe, expect, it } from 'vitest';
import { haversineDistance, isWithinRadius, formatDistance, GeoPoint } from '../src/utils/distance';

describe('haversineDistance', () => {
  it('should return 0 for the same point', () => {
    const distance = haversineDistance(48.8566, 2.3522, 48.8566, 2.3522);
    expect(distance).toBe(0);
  });

  it('should calculate distance between Paris and London correctly', () => {
    // Paris: 48.8566, 2.3522
    // London: 51.5074, -0.1278
    // Expected distance: ~344 km (haversine calculation)
    const distance = haversineDistance(48.8566, 2.3522, 51.5074, -0.1278);
    expect(distance).toBeCloseTo(343.56, 1);
  });

  it('should calculate distance between New York and Los Angeles correctly', () => {
    // New York: 40.7128, -74.0060
    // Los Angeles: 34.0522, -118.2437
    // Expected distance: ~3936 km (haversine calculation)
    const distance = haversineDistance(40.7128, -74.006, 34.0522, -118.2437);
    expect(distance).toBeCloseTo(3935.75, 1);
  });

  it('should calculate distance between Tokyo and Sydney correctly', () => {
    // Tokyo: 35.6762, 139.6503
    // Sydney: -33.8688, 151.2093
    // Expected distance: ~7826 km (haversine calculation)
    const distance = haversineDistance(35.6762, 139.6503, -33.8688, 151.2093);
    expect(distance).toBeCloseTo(7825.82, 1);
  });

  it('should be symmetric (A to B equals B to A)', () => {
    const distanceAB = haversineDistance(48.8566, 2.3522, 51.5074, -0.1278);
    const distanceBA = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
    expect(distanceAB).toBe(distanceBA);
  });

  it('should handle antipodal points', () => {
    // Distance between opposite sides of Earth should be about half circumference
    // Using equator points: (0, 0) and (0, 180)
    // Expected: ~20015 km (half of Earth's circumference at equator)
    const distance = haversineDistance(0, 0, 0, 180);
    expect(distance).toBeCloseTo(20015, 0);
  });

  it('should handle crossing the prime meridian', () => {
    // A point west of Greenwich to a point east
    const distance = haversineDistance(51.5, -1, 51.5, 1);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(200); // Should be a short distance
  });

  it('should handle crossing the equator', () => {
    // A point north of equator to a point south
    const distance = haversineDistance(1, 0, -1, 0);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeCloseTo(222, 0); // ~222 km for 2 degrees latitude
  });
});

describe('isWithinRadius', () => {
  const paris: GeoPoint = { lat: 48.8566, lon: 2.3522 };
  const versailles: GeoPoint = { lat: 48.8049, lon: 2.1204 }; // ~18 km from Paris
  const london: GeoPoint = { lat: 51.5074, lon: -0.1278 }; // ~343 km from Paris

  it('should return true when point is within radius', () => {
    expect(isWithinRadius(versailles, paris, 20)).toBe(true);
  });

  it('should return false when point is outside radius', () => {
    expect(isWithinRadius(london, paris, 100)).toBe(false);
  });

  it('should return true when point is exactly at the center', () => {
    expect(isWithinRadius(paris, paris, 0)).toBe(true);
  });

  it('should return true when point is at exactly the radius boundary', () => {
    const distance = haversineDistance(
      versailles.lat,
      versailles.lon,
      paris.lat,
      paris.lon
    );
    expect(isWithinRadius(versailles, paris, distance)).toBe(true);
  });

  it('should return false when radius is 0 and points are different', () => {
    expect(isWithinRadius(versailles, paris, 0)).toBe(false);
  });

  it('should handle large radius values', () => {
    expect(isWithinRadius(london, paris, 500)).toBe(true);
  });
});

describe('formatDistance', () => {
  describe('meters formatting (< 1 km)', () => {
    it('should format 0 km as 0 m', () => {
      expect(formatDistance(0)).toBe('0 m');
    });

    it('should format 0.1 km as 100 m', () => {
      expect(formatDistance(0.1)).toBe('100 m');
    });

    it('should format 0.5 km as 500 m', () => {
      expect(formatDistance(0.5)).toBe('500 m');
    });

    it('should format 0.999 km as 999 m', () => {
      expect(formatDistance(0.999)).toBe('999 m');
    });

    it('should round meters correctly', () => {
      expect(formatDistance(0.1234)).toBe('123 m');
      expect(formatDistance(0.5678)).toBe('568 m');
    });
  });

  describe('kilometers formatting (1-10 km)', () => {
    it('should format 1 km with one decimal place', () => {
      expect(formatDistance(1)).toBe('1.0 km');
    });

    it('should format 5.5 km with one decimal place', () => {
      expect(formatDistance(5.5)).toBe('5.5 km');
    });

    it('should format 9.9 km with one decimal place', () => {
      expect(formatDistance(9.9)).toBe('9.9 km');
    });

    it('should round to one decimal place', () => {
      expect(formatDistance(3.456)).toBe('3.5 km');
      expect(formatDistance(7.891)).toBe('7.9 km');
    });
  });

  describe('large distances formatting (>= 10 km)', () => {
    it('should format 10 km as whole number', () => {
      expect(formatDistance(10)).toBe('10 km');
    });

    it('should format 100 km as whole number', () => {
      expect(formatDistance(100)).toBe('100 km');
    });

    it('should format 1000 km as whole number', () => {
      expect(formatDistance(1000)).toBe('1000 km');
    });

    it('should round large distances to whole number', () => {
      expect(formatDistance(15.7)).toBe('16 km');
      expect(formatDistance(99.4)).toBe('99 km');
    });
  });

  describe('negative values handling', () => {
    it('should handle negative distance by using absolute value', () => {
      expect(formatDistance(-5)).toBe('5.0 km');
    });

    it('should handle negative meters', () => {
      expect(formatDistance(-0.5)).toBe('500 m');
    });

    it('should handle negative large distance', () => {
      expect(formatDistance(-100)).toBe('100 km');
    });
  });
});
