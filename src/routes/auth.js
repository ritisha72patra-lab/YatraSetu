const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const auth = require('../middleware/auth');

const credentials = z.object({ name: z.string().min(2).optional(), email: z.string().email(), password: z.string().min(8) });
const tokenFor = user => jwt.sign({ sub: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, preferences: user.preferences || null });

function friendlyRegisterError(e, email) {
  // Prisma unique violation -> email already taken
  if (e?.code === 'P2002') {
    const err = new Error(`This email (${email}) is already registered. Please Sign in instead. If you registered with Firebase/Google using the same email, just Sign in — your accounts share the same email.`);
    err.status = 409; err.code = 'EMAIL_TAKEN'; throw err;
  }
  throw e;
}

router.post('/register', async (req, res, next) => {
  try {
    const data = credentials.extend({ name: z.string().min(2) }).parse(req.body);
    const existing = await req.app.get('prisma').user.findUnique({ where: { email: data.email } }).catch(() => null);
    if (existing) {
      // Firebase-linked placeholder accounts can be "claimed" by setting a password
      if (String(existing.passwordHash || '').startsWith('firebase:')) {
        const user = await req.app.get('prisma').user.update({
          where: { id: existing.id },
          data: { name: data.name, passwordHash: await bcrypt.hash(data.password, 12) },
        });
        return res.status(200).json({ token: tokenFor(user), user: publicUser(user), notice: 'Your Firebase/Google email was already on file — a password has now been set so email+password sign-in works too.' });
      }
      const err = new Error(`This email (${data.email}) is already registered. Please Sign in instead.`);
      err.status = 409; err.code = 'EMAIL_TAKEN'; throw err;
    }
    const user = await req.app.get('prisma').user.create({ data: { name: data.name, email: data.email, passwordHash: await bcrypt.hash(data.password, 12) } });
    res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) {
    if (e?.code === 'P2002') return next(friendlyRegisterError(e, req.body?.email));
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const data = credentials.pick({ email: true, password: true }).parse(req.body);
    const user = await req.app.get('prisma').user.findUnique({ where: { email: data.email } });
    if (!user) return res.status(401).json({ error: 'Incorrect email or password. If you registered with Firebase/Google, use “Continue with Firebase” with the same email, or Register first.', code: 'INVALID_CREDENTIALS' });
    const ok = await bcrypt.compare(data.password, user.passwordHash).catch(() => false);
    if (!ok) {
      if (String(user.passwordHash || '').startsWith('firebase:')) {
        return res.status(401).json({ error: 'This email was registered via Firebase/Google (no password set). Use “Continue with Firebase” with the same email, or Register again with a password to link it.', code: 'FIREBASE_PASSWORD_MISSING' });
      }
      return res.status(401).json({ error: 'Incorrect email or password', code: 'INVALID_CREDENTIALS' });
    }
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

/**
 * Public Firebase web config for the browser SDK + admin status.
 * The web apiKey is public by design; the Admin SDK secret never leaves the server.
 */
router.get('/firebase-config', async (req, res) => {
  const { getFirebaseAuth, getFirebaseProjectId, getFirebaseWebConfig } = require('../services/firebase');
  const web = getFirebaseWebConfig();
  res.json({
    adminConfigured: Boolean(getFirebaseAuth()),
    webConfigured: Boolean(web),
    projectId: web?.projectId || getFirebaseProjectId() || null,
    authDomain: web?.authDomain || null,
    // Returned so the browser can firebase.initializeApp(config) directly.
    // Safe to expose: Firebase web keys are public identifiers, not secrets.
    config: web || null,
  });
});

/**
 * Firebase bridge: frontend sends a Firebase ID token (Google popup or phone
 * OTP via the Firebase client SDK). Backend verifies it, finds-or-creates the
 * YatraSetu user (by email, or synthetic phone email), and returns the
 * standard YatraSetu JWT so /api/trips, /api/safety, etc. keep working
 * unchanged. Same email/phone always maps to one YatraSetu account.
 * Body: { idToken: string, name?: string }
 */
router.post('/firebase', async (req, res, next) => {
  try {
    const { idToken, name } = z.object({ idToken: z.string().min(10), name: z.string().min(1).max(80).optional() }).parse(req.body);
    const { getFirebaseAuth, resolveFirebaseIdentity } = require('../services/firebase');
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) {
      const err = new Error('Firebase is not configured on the server. Set FIREBASE_SERVICE_ACCOUNT_JSON in .env, then restart the API.');
      err.status = 503; err.code = 'FIREBASE_NOT_CONFIGURED'; throw err;
    }
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const identity = resolveFirebaseIdentity(decoded, name);
    if (!identity.email) {
      const err = new Error('This Firebase account has neither an email nor a phone number, so it cannot be linked. Sign in with Google or phone OTP and retry.');
      err.status = 400; err.code = 'FIREBASE_NO_EMAIL'; throw err;
    }
    const prisma = req.app.get('prisma');
    let user = await prisma.user.findUnique({ where: { email: identity.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: identity.displayName,
          email: identity.email,
          // Placeholder — real auth is the Firebase ID token. Prefix lets /login explain this.
          passwordHash: 'firebase:' + decoded.uid,
          ...(identity.phone ? { preferences: { phone: identity.phone, firebaseUid: decoded.uid } } : {}),
        },
      });
    } else if (identity.phone && !(user.preferences?.phone)) {
      // Backfill phone on first phone sign-in for an existing email-matched row.
      try {
        await prisma.user.update({ where: { id: user.id }, data: { preferences: { ...(user.preferences || {}), phone: identity.phone } } });
      } catch {}
    }
    res.json({ token: tokenFor(user), user: publicUser(user), firebaseUid: decoded.uid });
  } catch (e) { next(e); }
});

router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await req.app.get('prisma').user.findUnique({
      where: { id: req.user.sub },
      include: {
        _count: { select: { bookings: true, alerts: true, feedback: true } },
        guideProfile: { select: { id: true, licenceNumber: true, approvalStatus: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ ...publicUser(user), stats: user._count, guideProfile: user.guideProfile || null });
  } catch (e) { next(e); }
});

const preferencesSchema = z.object({
  interests: z.array(z.string()).default([]),
  budget: z.number().int().positive().optional(),
  travelStyle: z.string().optional(),
  foodPreferences: z.array(z.string()).default([]),
  pace: z.enum(['fast', 'balanced', 'slow']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
});

router.put('/me/preferences', auth, async (req, res, next) => {
  try {
    const data = preferencesSchema.parse(req.body);
    const user = await req.app.get('prisma').user.update({ where: { id: req.user.sub }, data: { preferences: data } });
    res.json(publicUser(user));
  } catch (e) { next(e); }
});

module.exports = router;