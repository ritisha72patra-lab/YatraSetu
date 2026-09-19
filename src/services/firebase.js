const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let firebaseAuth;

function getServiceAccount() {
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!configured) return null;
  try {
    if (configured.startsWith('{')) return JSON.parse(configured);
    const filePath = path.resolve(configured);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getFirebaseAuth() {
  if (firebaseAuth) return firebaseAuth;

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) return null;

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  firebaseAuth = admin.auth();
  return firebaseAuth;
}

function getFirebaseProjectId() {
  return getServiceAccount()?.project_id || null;
}

/**
 * Public Firebase *web* config for the browser SDK (apiKey etc.).
 * This is public by design (Firebase docs) — it only identifies the project;
 * real security comes from server-side ID-token verification + auth rules.
 * Set FIREBASE_WEB_CONFIG_JSON in .env to the JSON from
 * Firebase console > Project settings > Your apps > Web app.
 */
function getFirebaseWebConfig() {
  const raw = process.env.FIREBASE_WEB_CONFIG_JSON?.trim();
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw);
    if (!cfg.apiKey || !cfg.projectId) return null;
    return {
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain || `${cfg.projectId}.firebaseapp.com`,
      projectId: cfg.projectId,
      appId: cfg.appId || undefined,
      messagingSenderId: cfg.messagingSenderId || undefined,
      storageBucket: cfg.storageBucket || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Shared identity resolution for Google/email AND phone ID tokens.
 * Email tokens -> use the email directly (existing behaviour, unchanged).
 * Phone tokens (no email, has phone_number) -> stable synthetic email so the
 * existing User(email unique) model keeps working with zero migration:
 *   phone_+919876543210@phone.yatrasetu.local
 * Real phone is also returned so callers can store it in preferences.
 *
 * NOTE (post-rebrand YatraSetu -> Panthan): the "phone.yatrasetu.local"
 * domain below is an internal synthetic-email identifier, not user-facing
 * branding. It is intentionally left unchanged so existing phone-auth
 * users' email lookups keep resolving to the same account after the
 * rename. Do not change this string without a data migration.
 */
function resolveFirebaseIdentity(decoded, nameOverride) {
  const phone = decoded.phone_number || null;
  if (decoded.email) {
    const displayName = nameOverride || decoded.name || String(decoded.email).split('@')[0];
    return { email: decoded.email, displayName: String(displayName).slice(0, 80), phone, isPhone: false };
  }
  if (phone) {
    const digits = String(phone).replace(/[^0-9+]/g, '');
    const safe = digits.replace('+', 'plus');
    const displayName = nameOverride || phone;
    return { email: `phone_${safe}@phone.yatrasetu.local`.toLowerCase(), displayName: String(displayName).slice(0, 80), phone, isPhone: true };
  }
  return { email: null, displayName: null, phone: null, isPhone: false };
}

module.exports = { getFirebaseAuth, getFirebaseProjectId, getFirebaseWebConfig, resolveFirebaseIdentity };
