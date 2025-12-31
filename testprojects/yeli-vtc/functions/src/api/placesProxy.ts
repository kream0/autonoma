import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * Rate limit configuration for Google Places API
 * Limits: 200 requests/day, 50 requests/hour
 */
interface RateLimitState {
  hourlyCount: number;
  dailyCount: number;
  hourWindowStart: FirebaseFirestore.Timestamp;
  dayWindowStart: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  hourlyRemaining: number;
  dailyRemaining: number;
}

const HOURLY_LIMIT = 50;
const DAILY_LIMIT = 200;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const RATE_LIMIT_DOC = "system_safety/places_rate_limit";

// West Africa region bias (centered roughly on Ghana/Togo/Benin area)
const WEST_AFRICA_BIAS = {
  lat: 7.5,
  lng: 1.0,
  radius: 500000, // 500km radius
};

/**
 * Check and increment rate limit counters
 */
async function checkAndIncrementRateLimit(): Promise<RateLimitCheckResult> {
  const db = admin.firestore();
  const docRef = db.doc(RATE_LIMIT_DOC);

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();

    let state: RateLimitState;

    if (!doc.exists) {
      state = {
        hourlyCount: 0,
        dailyCount: 0,
        hourWindowStart: now,
        dayWindowStart: now,
        updatedAt: now,
      };
    } else {
      state = doc.data() as RateLimitState;
    }

    // Reset hourly counter if hour window expired
    const hourWindowAge = nowMs - state.hourWindowStart.toMillis();
    if (hourWindowAge >= HOUR_MS) {
      state.hourlyCount = 0;
      state.hourWindowStart = now;
    }

    // Reset daily counter if day window expired
    const dayWindowAge = nowMs - state.dayWindowStart.toMillis();
    if (dayWindowAge >= DAY_MS) {
      state.dailyCount = 0;
      state.dayWindowStart = now;
    }

    // Check if limits exceeded
    if (state.dailyCount >= DAILY_LIMIT) {
      return {
        allowed: false,
        reason: "Daily rate limit exceeded (200/day)",
        hourlyRemaining: Math.max(0, HOURLY_LIMIT - state.hourlyCount),
        dailyRemaining: 0,
      };
    }

    if (state.hourlyCount >= HOURLY_LIMIT) {
      return {
        allowed: false,
        reason: "Hourly rate limit exceeded (50/hour)",
        hourlyRemaining: 0,
        dailyRemaining: Math.max(0, DAILY_LIMIT - state.dailyCount),
      };
    }

    // Increment counters
    state.hourlyCount += 1;
    state.dailyCount += 1;
    state.updatedAt = now;

    transaction.set(docRef, state);

    return {
      allowed: true,
      hourlyRemaining: HOURLY_LIMIT - state.hourlyCount,
      dailyRemaining: DAILY_LIMIT - state.dailyCount,
    };
  });
}

/**
 * Fetch from Google Places API with proper error handling
 */
async function fetchFromGooglePlaces(
  url: string
): Promise<{ data: unknown; status: number }> {
  const apiKey = functions.config().google?.places_api_key;

  if (!apiKey) {
    throw new Error("Google Places API key not configured");
  }

  const response = await fetch(`${url}&key=${apiKey}`);

  if (!response.ok) {
    throw new Error(`Google Places API error: ${response.status}`);
  }

  const data = await response.json();
  return { data, status: response.status };
}

/**
 * GET /places/autocomplete
 * Proxy to Google Places Autocomplete API with West Africa bias
 *
 * Query params:
 * - input: The text input specifying which place to search for
 * - sessiontoken: (optional) Session token for billing
 */
export const placesAutocomplete = functions.https.onRequest(async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { input, sessiontoken } = req.query;

  if (!input || typeof input !== "string") {
    res.status(400).json({ error: "Missing required 'input' parameter" });
    return;
  }

  try {
    // Check rate limit
    const rateLimitCheck = await checkAndIncrementRateLimit();

    if (!rateLimitCheck.allowed) {
      res.status(429).json({
        error: rateLimitCheck.reason,
        hourlyRemaining: rateLimitCheck.hourlyRemaining,
        dailyRemaining: rateLimitCheck.dailyRemaining,
      });
      return;
    }

    // Build Google Places Autocomplete URL with West Africa bias
    const baseUrl = "https://maps.googleapis.com/maps/api/place/autocomplete/json";
    const params = new URLSearchParams({
      input: input,
      location: `${WEST_AFRICA_BIAS.lat},${WEST_AFRICA_BIAS.lng}`,
      radius: WEST_AFRICA_BIAS.radius.toString(),
      strictbounds: "false", // Allow results outside radius but rank nearby higher
    });

    if (sessiontoken && typeof sessiontoken === "string") {
      params.append("sessiontoken", sessiontoken);
    }

    const { data } = await fetchFromGooglePlaces(`${baseUrl}?${params.toString()}`);

    res.status(200).json({
      ...data as object,
      _rateLimit: {
        hourlyRemaining: rateLimitCheck.hourlyRemaining,
        dailyRemaining: rateLimitCheck.dailyRemaining,
      },
    });
  } catch (error) {
    console.error("Places autocomplete error:", error);

    if (error instanceof Error && error.message.includes("API key")) {
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    res.status(500).json({ error: "Failed to fetch place suggestions" });
  }
});

/**
 * GET /places/details
 * Proxy to Google Places Details API
 *
 * Query params:
 * - place_id: The place ID to get details for
 * - sessiontoken: (optional) Session token for billing
 * - fields: (optional) Comma-separated list of fields to return
 */
export const placesDetails = functions.https.onRequest(async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { place_id, sessiontoken, fields } = req.query;

  if (!place_id || typeof place_id !== "string") {
    res.status(400).json({ error: "Missing required 'place_id' parameter" });
    return;
  }

  try {
    // Check rate limit
    const rateLimitCheck = await checkAndIncrementRateLimit();

    if (!rateLimitCheck.allowed) {
      res.status(429).json({
        error: rateLimitCheck.reason,
        hourlyRemaining: rateLimitCheck.hourlyRemaining,
        dailyRemaining: rateLimitCheck.dailyRemaining,
      });
      return;
    }

    // Build Google Places Details URL
    const baseUrl = "https://maps.googleapis.com/maps/api/place/details/json";
    const params = new URLSearchParams({
      place_id: place_id,
    });

    if (sessiontoken && typeof sessiontoken === "string") {
      params.append("sessiontoken", sessiontoken);
    }

    // Default to common fields if not specified
    const requestedFields =
      typeof fields === "string"
        ? fields
        : "formatted_address,geometry,name,place_id";
    params.append("fields", requestedFields);

    const { data } = await fetchFromGooglePlaces(`${baseUrl}?${params.toString()}`);

    res.status(200).json({
      ...data as object,
      _rateLimit: {
        hourlyRemaining: rateLimitCheck.hourlyRemaining,
        dailyRemaining: rateLimitCheck.dailyRemaining,
      },
    });
  } catch (error) {
    console.error("Places details error:", error);

    if (error instanceof Error && error.message.includes("API key")) {
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    res.status(500).json({ error: "Failed to fetch place details" });
  }
});
