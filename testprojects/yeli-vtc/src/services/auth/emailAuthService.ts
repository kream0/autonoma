import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as firebaseUpdateProfile,
  updateEmail,
  updatePassword,
  UserCredential,
  User,
} from 'firebase/auth';
import { auth } from '../../config/firebase';

export interface RegisterResult {
  user: User;
  success: boolean;
}

export interface LoginResult {
  user: User;
  success: boolean;
}

export interface ProfileUpdateData {
  displayName?: string;
  photoURL?: string;
  email?: string;
  password?: string;
}

/**
 * Register a new user with email and password
 */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<RegisterResult> {
  const userCredential: UserCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  if (displayName && userCredential.user) {
    await firebaseUpdateProfile(userCredential.user, { displayName });
  }

  return {
    user: userCredential.user,
    success: true,
  };
}

/**
 * Login user with email and password
 */
export async function loginWithEmail(
  email: string,
  password: string
): Promise<LoginResult> {
  const userCredential: UserCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return {
    user: userCredential.user,
    success: true,
  };
}

/**
 * Send password reset email to user
 */
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Update user profile information
 */
export async function updateProfile(data: ProfileUpdateData): Promise<void> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('No authenticated user found');
  }

  const promises: Promise<void>[] = [];

  // Update display name and/or photo URL
  if (data.displayName !== undefined || data.photoURL !== undefined) {
    promises.push(
      firebaseUpdateProfile(user, {
        displayName: data.displayName,
        photoURL: data.photoURL,
      })
    );
  }

  // Update email if provided
  if (data.email !== undefined) {
    promises.push(updateEmail(user, data.email));
  }

  // Update password if provided
  if (data.password !== undefined) {
    promises.push(updatePassword(user, data.password));
  }

  await Promise.all(promises);
}
