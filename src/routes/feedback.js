const router = require('express').Router();
const { z } = require('zod');

const feedback = z.object({
  bookingId: z.string().optional(), guideId: z.string().optional(),
  rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional(),
  crowdLevel: z.number().int().min(1).max(5).optional(), spotId: z.string().optional()
});

// Submit (tourist). Keeps old shape; now also links spot + crowd report.
router.post('/', async (req, res, next) => {
  try {
    const data = feedback.parse(req.body), prisma = req.app.get('prisma');
    // Resolve spot from booking if not given (so spot pages show the review).
    let spotId = data.spotId || null;
    if (!spotId && data.bookingId) {
      const b = await prisma.booking.findFirst({ where: { id: data.bookingId, touristId: req.user.sub } });
      if (b) spotId = b.spotId;
    }
    const item = await prisma.feedback.create({
      data: { userId: req.user.sub, bookingId: data.bookingId, guideId: data.guideId, spotId, rating: data.rating, comment: data.comment, crowdLevel: data.crowdLevel },
      include: { user: { select: { name: true } } },
    });
    if (spotId && data.crowdLevel) await prisma.crowdReport.create({ data: { spotId, level: data.crowdLevel } }).catch(() => {});
    if (data.guideId) {
      const avg = await prisma.feedback.aggregate({ where: { guideId: data.guideId }, _avg: { rating: true } });
      await prisma.guideProfile.update({ where: { id: data.guideId }, data: { rating: avg._avg.rating || 0 } }).catch(() => {});
    }
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// Public wall for a spot/guide (used by mobile SpotDetail + guide cards).
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const where = {};
    if (req.query.spotId) where.spotId = String(req.query.spotId);
    if (req.query.guideId) where.guideId = String(req.query.guideId);
    res.json(await prisma.feedback.findMany({
      where, include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: Math.min(50, Number(req.query.limit || 20)),
    }));
  } catch (e) { next(e); }
});

// Aggregate header: avg rating, count, crowd avg.
router.get('/summary', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const where = {};
    if (req.query.spotId) where.spotId = String(req.query.spotId);
    if (req.query.guideId) where.guideId = String(req.query.guideId);
    const [agg, count, crowd] = await Promise.all([
      prisma.feedback.aggregate({ where, _avg: { rating: true } }),
      prisma.feedback.count({ where }),
      prisma.feedback.aggregate({ where: { ...where, crowdLevel: { not: null } }, _avg: { crowdLevel: true } }),
    ]);
    res.json({ count, avgRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null, avgCrowd: crowd._avg.crowdLevel ? Math.round(crowd._avg.crowdLevel * 10) / 10 : null });
  } catch (e) { next(e); }
});

router.get('/mine', async (req, res, next) => {
  try {
    res.json(await req.app.get('prisma').feedback.findMany({
      where: { userId: req.user.sub },
      include: { spot: { select: { name: true } }, guide: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' }, take: 50,
    }));
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = z.object({ rating: z.number().int().min(1).max(5).optional(), comment: z.string().max(1000).nullable().optional() }).parse(req.body);
    const prisma = req.app.get('prisma');
    const existing = await prisma.feedback.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
    if (!existing) return res.status(404).json({ error: 'Review not found' });
    res.json(await prisma.feedback.update({ where: { id: existing.id }, data }));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const existing = await prisma.feedback.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
    if (!existing) return res.status(404).json({ error: 'Review not found' });
    await prisma.feedback.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
