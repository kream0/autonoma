import Constants from 'expo-constants';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

const extra = Constants.expoConfig?.extra ?? {};

export const firebaseConfig: FirebaseConfig = {
  apiKey: extra.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: extra.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: extra.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: extra.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: extra.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: extra.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  measurementId: extra.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};
