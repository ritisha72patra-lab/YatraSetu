const admin = require('../firebase/admin');

// Verifies the Firebase ID token sent by the client (Authorization: Bearer <idToken>),
// then resolves it to this app's Prisma User row so the rest of the API can keep
// using req.user.sub / req.user.role exactly as before.
module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (err) {
    console.error('Firebase ID token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  try {
    const prisma = req.app.get('prisma');
    let user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });

    if (!user && decoded.email) {
      // Links a pre-existing app profile (e.g. seeded demo accounts) to this
      // Firebase account the first time someone signs in with that email.
      const existingByEmail = await prisma.user.findUnique({ where: { email: decoded.email } });
      if (existingByEmail) {
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: { firebaseUid: decoded.uid },
        });
      }
    }

    if (!user) {
      // First time this Firebase account has ever hit the API: create the
      // app-level profile automatically. Role defaults to TOURIST; admins/guides
      // are promoted separately (see README).
      user = await prisma.user.create({
        data: {
          firebaseUid: decoded.uid,
          email: decoded.email || `${decoded.uid}@no-email.yatrasetu.in`,
          name: decoded.name || decoded.email?.split('@')[0] || 'Traveller',
        },
      });
    }

    req.user = { sub: user.id, role: user.role, name: user.name, uid: decoded.uid };
    next();
  } catch (err) {
    next(err);
  }
};
