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
exports.onUserDeleted = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/**
 * Firebase Auth trigger that runs when a user is deleted.
 * Marks the user document as deleted and cleans up related data.
 */
exports.onUserDeleted = functions.auth.user().onDelete(async (user) => {
    const { uid, email } = user;
    functions.logger.info(`User deleted: ${uid}`, { email });
    const db = admin.firestore();
    try {
        // Mark user document as deleted (soft delete)
        const userRef = db.collection("users").doc(uid);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            await userRef.update({
                isActive: false,
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            functions.logger.info(`User document marked as deleted for ${uid}`);
        }
        // If user was a driver, mark driver profile as inactive
        const driverRef = db.collection("drivers").doc(uid);
        const driverDoc = await driverRef.get();
        if (driverDoc.exists) {
            await driverRef.update({
                isActive: false,
                isAvailable: false,
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            functions.logger.info(`Driver document marked as deleted for ${uid}`);
        }
    }
    catch (error) {
        functions.logger.error(`Error cleaning up user data for ${uid}:`, error);
        throw error;
    }
});
//# sourceMappingURL=onUserDeleted.js.map