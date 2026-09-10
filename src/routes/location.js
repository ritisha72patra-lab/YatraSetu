const router = require('express').Router();
const { z } = require('zod');
const point = z.object({ latitude: z.number().gte(-90).lte(90), longitude: z.number().gte(-180).lte(180) });

router.post('/me', async (req, res, next) => {
  try {
    if (req.user.role !== 'GUIDE') return res.status(403).json({ error: 'Only a guide can publish a live location' });
    const data = point.parse(req.body), prisma = req.app.get('prisma');
    const guide = await prisma.guideProfile.findUnique({ where: { userId: req.user.sub } });
    if (!guide) return res.status(404).json({ error: 'Guide profile not found' });
    const location = await prisma.liveLocation.upsert({ where: { guideId: guide.id }, create: { guideId: guide.id, ...data }, update: data });
    res.json({ guideId: guide.id, location });
  } catch (e) { next(e); }
});

router.delete('/me', async (req, res, next) => {
  try {
    if (req.user.role !== 'GUIDE') return res.status(403).json({ error: 'Only a guide can stop location sharing' });
    const prisma = req.app.get('prisma');
    const guide = await prisma.guideProfile.findUnique({ where: { userId: req.user.sub } });
    if (guide) await prisma.liveLocation.deleteMany({ where: { guideId: guide.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

router.get('/guide/:guideId', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const ownGuide = req.user.role === 'GUIDE' && await prisma.guideProfile.findFirst({ where: { id: req.params.guideId, userId: req.user.sub } });
    const permitted = req.user.role === 'ADMIN' || ownGuide || await prisma.booking.findFirst({ where: { touristId: req.user.sub, guideId: req.params.guideId, status: 'CONFIRMED' } });
    if (!permitted) return res.status(403).json({ error: 'You do not have access to this trip location' });
    const location = await prisma.liveLocation.findUnique({ where: { guideId: req.params.guideId }, include: { guide: { include: { user: true } } } });
    if (!location) return res.status(404).json({ error: 'Guide is not sharing location right now' });
    res.json({ guide: { id: location.guide.id, name: location.guide.user.name }, latitude: location.latitude, longitude: location.longitude, updatedAt: location.updatedAt });
  } catch (e) { next(e); }
});
module.exports = router;
