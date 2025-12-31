import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

interface DemandZone {
  center: {
    lat: number;
    lng: number;
  };
  radius: number;
  intensity: number;
}

interface HeatmapResponse {
  zones: DemandZone[];
  updatedAt: string | null;
}

/**
 * GET endpoint returning demand zones from system/heatmap document.
 * Each zone includes center (lat/lng), radius, and intensity.
 */
export const getHeatmap = functions.https.onRequest(async (req, res) => {
  // Only allow GET requests
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const db = admin.firestore();
    const heatmapDoc = await db.collection("system").doc("heatmap").get();

    if (!heatmapDoc.exists) {
      const response: HeatmapResponse = {
        zones: [],
        updatedAt: null,
      };
      res.status(200).json(response);
      return;
    }

    const data = heatmapDoc.data();
    const zones: DemandZone[] = data?.zones || [];
    const updatedAt = data?.updatedAt?.toDate?.()?.toISOString() || null;

    const response: HeatmapResponse = {
      zones: zones.map((zone) => ({
        center: {
          lat: zone.center?.lat || 0,
          lng: zone.center?.lng || 0,
        },
        radius: zone.radius || 0,
        intensity: zone.intensity || 0,
      })),
      updatedAt,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching heatmap:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
