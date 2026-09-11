const jwt = require('jsonwebtoken');
const { getFirebaseAuth, resolveFirebaseIdentity } = require('../services/firebase');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Sign-in required. Please sign in to use trips, SOS and safety features.', code: 'TOKEN_MISSING' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (jwtError) {
    // Fall through to Firebase ID-token check below. Keep the JWT reason for logging.
    req._jwtError = jwtError?.message;
  }

  try {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) {
      return res.status(401).json({
        error: 'Session expired or invalid. Please sign in again with email + password.',
        code: 'TOKEN_INVALID',
        hint: 'Server Firebase bridge is off (FIREBASE_SERVICE_ACCOUNT_JSON missing) so only YatraSetu JWTs are accepted.',
      });
    }
    let decoded;
    try {
      decoded = await firebaseAuth.verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.', code: 'TOKEN_INVALID' });
    }
    if (!decoded.email && !decoded.phone_number) {
      return res.status(401).json({ error: 'This Firebase account has neither email nor phone number, so it cannot be linked. Sign in with Google or phone OTP and retry.', code: 'FIREBASE_NO_EMAIL' });
    }
    const { email: lookupEmail } = resolveFirebaseIdentity(decoded);
    const prisma = req.app.get('prisma');
    let user;
    try {
      user = await prisma.user.findUnique({ where: { email: lookupEmail } });
    } catch (dbError) {
      return res.status(503).json({ error: 'Account database is unavailable. Connect the database and run `npx prisma migrate deploy` + seed, then retry.', code: 'DB_UNAVAILABLE' });
    }
    // Auto-provision: a Firebase Google/phone identity gets a YatraSetu row on
    // first authenticated call, so SOS/trips work without a separate register.
    if (!user) {
      try {
        const { email, displayName, phone } = resolveFirebaseIdentity(decoded);
        user = await prisma.user.create({
          data: {
            name: displayName,
            email,
            passwordHash: 'firebase:' + decoded.uid,
            ...(phone ? { preferences: { phone, firebaseUid: decoded.uid } } : {}),
          },
        });
      } catch {
        return res.status(401).json({ error: `Firebase sign-in OK (${lookupEmail}) but no YatraSetu profile exists yet. Register once with the same email to link it.`, code: 'FIREBASE_NOT_REGISTERED', email: lookupEmail });
      }
    }
    req.user = { sub: user.id, role: user.role, name: user.name, firebaseUid: decoded.uid };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication token. Please sign in again.', code: 'TOKEN_INVALID' });
  }
};
