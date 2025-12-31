import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export all cloud functions
// Auth functions
export * from "./auth";

// API functions
export * from "./api";

// Firestore trigger functions
export * from "./triggers";

// Scheduled functions
export * from "./scheduled";
