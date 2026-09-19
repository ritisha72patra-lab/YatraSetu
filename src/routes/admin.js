const router = require('express').Router();
const { z } = require('zod');
const requireRole = require('../middleware/requireRole');
const { liveTourists } = require('../services/touristPresence');

router.use(requireRole('ADMIN'));

const review = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  documentUrl: z.string().url().optional(),
});

router.get('/overview', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const [guides, cabs, alerts, feedback, scans, liveGuides, guideRequests, trips] = await Promise.all([
      prisma.guideProfile.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { id: 'desc' } }),
      prisma.cabProfile.findMany({ orderBy: { id: 'desc' } }),
      prisma.safetyAlert.findMany({ where: { resolved: false }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.feedback.findMany({ include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.verificationLog.findMany({ include: { guide: { include: { user: { select: { name: true } } } }, cab: true }, orderBy: { scannedAt: 'desc' }, take: 20 }),
      prisma.liveLocation.findMany({ include: { guide: { include: { user: { select: { name: true, email: true } } } } }, orderBy: { updatedAt: 'desc' } }),
      prisma.guideChangeRequest.findMany({
        include: {
          tourist: { select: { name: true, email: true } },
          booking: { include: { spot: true } },
          currentGuide: { include: { user: { select: { name: true } } } },
          requestedGuide: { include: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.booking.findMany({
        include: { tourist: { select: { name: true, email: true } }, spot: { select: { name: true } } },
        where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 30,
      }),
    ]);
    res.json({ guides, cabs, alerts, feedback, scans, liveTourists: liveTourists(), liveGuides, guideRequests, trips });
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

router.get('/guide-requests', async (req, res, next) => {
  try {
    res.json(await req.app.get('prisma').guideChangeRequest.findMany({
      include: {
        tourist: { select: { name: true, email: true } },
        booking: { include: { spot: true } },
        currentGuide: { include: { user: { select: { name: true } } } },
        requestedGuide: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }));
  } catch (e) { next(e); }
});

router.put('/guide-requests/:id/decision', async (req, res, next) => {
  try {
    const data = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), adminNote: z.string().max(500).optional(), newGuideId: z.string().optional() }).parse(req.body);
    const prisma = req.app.get('prisma');
    const r = await prisma.guideChangeRequest.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (r.status !== 'PENDING') return res.status(409).json({ error: 'This request was already decided' });
    if (data.decision === 'REJECTED') {
      return res.json(await prisma.guideChangeRequest.update({ where: { id: r.id }, data: { status: 'REJECTED', adminNote: data.adminNote, decidedAt: new Date() } }));
    }
    const gid = data.newGuideId || r.requestedGuideId;
    if (!gid) return res.status(400).json({ error: 'Choose a guide to assign' });
    const g = await prisma.guideProfile.findUnique({ where: { id: gid } });
    if (!g || g.approvalStatus !== 'APPROVED') return res.status(400).json({ error: 'Guide is not available for assignment' });
    const [booking, request] = await prisma.$transaction([
      prisma.booking.update({ where: { id: r.bookingId }, data: { guideId: g.id, agreedRate: g.officialDailyRate } }),
      prisma.guideChangeRequest.update({ where: { id: r.id }, data: { status: 'APPROVED', requestedGuideId: g.id, adminNote: data.adminNote, decidedAt: new Date() } }),
    ]);
    res.json({ request, booking, message: `${g.id === r.currentGuideId ? 'Request approved' : 'Guide reassigned'} at ₹${g.officialDailyRate}/day.` });
  } catch (e) { next(e); }
});

router.put('/guides/:id/location', async (req, res, next) => {
  try {
    const point = z.object({ latitude: z.number().gte(-90).lte(90), longitude: z.number().gte(-180).lte(180) }).parse(req.body);
    res.json(await req.app.get('prisma').liveLocation.upsert({ where: { guideId: req.params.id }, create: { guideId: req.params.id, ...point }, update: point }));
  } catch (e) { next(e); }
});

module.exports = router;
