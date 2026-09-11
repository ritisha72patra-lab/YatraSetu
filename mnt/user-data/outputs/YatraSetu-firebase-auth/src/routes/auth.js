const router = require('express').Router();
const { z } = require('zod');
const auth = require('../middleware/auth');

// Credentials (email/password) are owned entirely by Firebase Authentication now —
// this backend never sees or stores a password. The `auth` middleware verifies the
// Firebase ID token and auto-creates/links the matching Prisma User row.
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, preferences: user.preferences || null });

// Called once by the client right after Firebase createUserWithEmailAndPassword
// succeeds, to record the display name the traveller entered at signup.
const syncSchema = z.object({ name: z.string().min(2).optional() });

router.post('/sync', auth, async (req, res, next) => {
  try {
    const data = syncSchema.parse(req.body);
    const user = await req.app.get('prisma').user.update({
      where: { id: req.user.sub },
      data: data.name ? { name: data.name } : {},
    });
    res.json(publicUser(user));
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
