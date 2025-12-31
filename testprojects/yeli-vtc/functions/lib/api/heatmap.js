"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHeatmap = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/**
 * GET endpoint returning demand zones from system/heatmap document.
 * Each zone includes center (lat/lng), radius, and intensity.
 */
exports.getHeatmap = functions.https.onRequest(async (req, res) => {
    // Only allow GET requests
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    try {
        const db = admin.firestore();
        const heatmapDoc = await db.collection("system").doc("heatmap").get();
        if (!heatmapDoc.exists) {
            const response = {
                zones: [],
                updatedAt: null,
            };
            res.status(200).json(response);
            return;
        }
        const data = heatmapDoc.data();
        const zones = data?.zones || [];
        const updatedAt = data?.updatedAt?.toDate?.()?.toISOString() || null;
        const response = {
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
    }
    catch (error) {
        console.error("Error fetching heatmap:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=heatmap.js.map