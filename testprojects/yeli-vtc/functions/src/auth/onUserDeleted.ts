import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * Firebase Auth trigger that runs when a user is deleted.
 * Marks the user document as deleted and cleans up related data.
 */
export const onUserDeleted = functions.auth.user().onDelete(async (user) => {
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
  } catch (error) {
    functions.logger.error(`Error cleaning up user data for ${uid}:`, error);
    throw error;
  }
});
