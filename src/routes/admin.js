const router = require('express').Router();
const { z } = require('zod');
const requireRole = require('../middleware/requireRole');

router.use(requireRole('ADMIN'));

const review = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  documentUrl: z.string().url().optional(),
});

router.get('/overview', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const [guides, cabs, alerts, feedback, scans] = await Promise.all([
      prisma.guideProfile.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { id: 'desc' } }),
      prisma.cabProfile.findMany({ orderBy: { id: 'desc' } }),
      prisma.safetyAlert.findMany({ where: { resolved: false }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.feedback.findMany({ include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.verificationLog.findMany({ include: { guide: { include: { user: { select: { name: true } } } }, cab: true }, orderBy: { scannedAt: 'desc' }, take: 20 }),
    ]);
    res.json({ guides, cabs, alerts, feedback, scans });
  } catch (e) { next(e); }
});

router.put('/guides/:id/review', async (req, res, next) => {
  try {
    const data = review.parse(req.body);
    const guide = await req.app.get('prisma').guideProfile.update({ where: { id: req.params.id }, data: { approvalStatus: data.decision, governmentVerified: data.decision === 'APPROVED', ...(data.documentUrl ? { documentUrl: data.documentUrl } : {}) }, include: { user: true } });
    res.json(guide);
  } catch (e) { next(e); }
});

router.put('/cabs/:id/review', async (req, res, next) => {
  try {
    const data = review.parse(req.body);
    const cab = await req.app.get('prisma').cabProfile.update({ where: { id: req.params.id }, data: { approvalStatus: data.decision, governmentVerified: data.decision === 'APPROVED', ...(data.documentUrl ? { documentUrl: data.documentUrl } : {}) } });
    res.json(cab);
  } catch (e) { next(e); }
});

router.put('/guides/:id/pricing', async (req, res, next) => {
  try {
    const data = z.object({ officialDailyRate: z.number().int().positive() }).parse(req.body);
    res.json(await req.app.get('prisma').guideProfile.update({ where: { id: req.params.id }, data }));
  } catch (e) { next(e); }
});

router.put('/cabs/:id/pricing', async (req, res, next) => {
  try {
    const data = z.object({ officialRatePerKm: z.number().positive() }).parse(req.body);
    res.json(await req.app.get('prisma').cabProfile.update({ where: { id: req.params.id }, data }));
  } catch (e) { next(e); }
});

router.put('/alerts/:id/resolve', async (req, res, next) => {
  try { res.json(await req.app.get('prisma').safetyAlert.update({ where: { id: req.params.id }, data: { resolved: true } })); }
  catch (e) { next(e); }
});

router.put('/guides/:id/location', async (req, res, next) => {
  try {
    const point = z.object({ latitude: z.number().gte(-90).lte(90), longitude: z.number().gte(-180).lte(180) }).parse(req.body);
    res.json(await req.app.get('prisma').liveLocation.upsert({ where: { guideId: req.params.id }, create: { guideId: req.params.id, ...point }, update: point }));
  } catch (e) { next(e); }
});

module.exports = router;