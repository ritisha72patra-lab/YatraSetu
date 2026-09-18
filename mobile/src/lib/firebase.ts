import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { api } from './api';

/**
 * Lazily initializes the Firebase client SDK using the *public* web config
 * already served by the backend at GET /api/auth/firebase-config (see
 * src/services/firebase.js + src/routes/auth.js on the server — this
 * endpoint already exists and is used by ProfileScreen). Firebase web
 * config (apiKey, authDomain, etc.) is a public identifier by design, not
 * a secret — the backend's Admin SDK service account is what stays
 * server-side and private.
 *
 * This keeps the mobile app from needing its own copy of the Firebase
 * config in an env file: one source of truth (the backend .env), reused
 * automatically by every client.
 */

let appPromise: Promise<FirebaseApp> | null = null;

async function getFirebaseApp(): Promise<FirebaseApp> {
  if (getApps().length) return getApp();
  if (!appPromise) {
    appPromise = (async () => {
      const cfg: any = await api('/api/auth/firebase-config', {}, false);
      if (!cfg?.config) {
        throw new Error(
          'Firebase is not configured on the server yet. Ask the admin to set FIREBASE_WEB_CONFIG_JSON and FIREBASE_SERVICE_ACCOUNT_JSON, then restart the API.'
        );
      }
      return initializeApp(cfg.config);
    })();
  }
  return appPromise;
}

export async function getFirebaseAuthClient(): Promise<Auth> {
  const app = await getFirebaseApp();
  return getAuth(app);
}
