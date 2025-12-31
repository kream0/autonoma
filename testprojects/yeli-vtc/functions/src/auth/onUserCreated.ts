import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * Firebase Auth trigger that runs when a new user is created.
 * Creates a corresponding user document in Firestore with default values.
 */
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  const { uid, email, displayName, photoURL, phoneNumber } = user;

  functions.logger.info(`New user created: ${uid}`, {
    email,
    displayName,
  });

  const db = admin.firestore();
  const userRef = db.collection("users").doc(uid);

  const userData = {
    uid,
    email: email || null,
    displayName: displayName || null,
    photoURL: photoURL || null,
    phoneNumber: phoneNumber || null,
    role: "rider", // Default role for new users
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    await userRef.set(userData);
    functions.logger.info(`User document created for ${uid}`);
  } catch (error) {
    functions.logger.error(`Failed to create user document for ${uid}:`, error);
    throw error;
  }
});
