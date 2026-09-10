const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const credentials = z.object({ name: z.string().min(2).optional(), email: z.string().email(), password: z.string().min(8) });
const tokenFor = user => jwt.sign({ sub: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, preferences: user.preferences || null });

router.post('/register', async (req, res, next) => {
  try {
    const data = credentials.extend({ name: z.string().min(2) }).parse(req.body);
    const user = await req.app.get('prisma').user.create({ data: { name: data.name, email: data.email, passwordHash: await bcrypt.hash(data.password, 12) } });
    res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const data = credentials.pick({ email: true, password: true }).parse(req.body);
    const user = await req.app.get('prisma').user.findUnique({ where: { email: data.email } });
    if (!user || !await bcrypt.compare(data.password, user.passwordHash)) return res.status(401).json({ error: 'Incorrect email or password' });
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get('/me', async (req, res, next) => {
  try {
    const user = await req.app.get('prisma').user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(publicUser(user));
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

router.put('/me/preferences', async (req, res, next) => {
  try {
    const data = preferencesSchema.parse(req.body);
    const user = await req.app.get('prisma').user.update({ where: { id: req.user.sub }, data: { preferences: data } });
    res.json(publicUser(user));
  } catch (e) { next(e); }
});

module.exports = router;