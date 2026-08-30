/**
 * Firebase Admin SDK initialization.
 * Isolated here so the main service only imports `getFirebaseApp()`.
 */
import { initializeApp, getApps, getApp, App, cert } from 'firebase-admin/app';
import { getErrorMessage } from '../utils/error.util';

let firebaseApp: App;

try {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (!projectId || !privateKey || !clientEmail) {
      throw new Error('Missing Firebase environment variables');
    }

    firebaseApp = initializeApp({
      credential: cert({
        projectId,
        privateKey,
        clientEmail,
      }),
    });

    console.log('✅ Firebase Admin initialized successfully');
  } else {
    firebaseApp = getApp();
  }
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', getErrorMessage(error));
  console.log('⚠️ Notifications will not work without Firebase environment variables');
  console.log('⚠️ Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
}

export function getFirebaseApp(): App | undefined {
  return firebaseApp;
}
