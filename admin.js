// Server-side Firebase Admin SDK setup.
// This runs ONLY on the backend. It verifies ID tokens issued by the Firebase
// client SDK (used in index.html) — it never handles user passwords itself,
// and it must never be bundled into anything served to the browser.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not set. Paste the full contents of your Firebase ' +
      'service-account JSON (Firebase Console > Project settings > Service accounts > Generate ' +
      'new private key) into that environment variable as a single-line JSON string.'
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Check how it was pasted into .env.');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
