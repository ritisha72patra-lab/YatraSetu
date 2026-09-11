const router = require('express').Router();
const { getCrowdPrediction } = require('../services/prediction');
const { getEnvironment } = require('../services/environment');
const { z } = require('zod');

router.get('/environment', async (req, res, next) => {
  try {
    const latitude = Number(req.query.latitude || 24.5854), longitude = Number(req.query.longitude || 73.7125);
    res.json(await getEnvironment(latitude, longitude));
  } catch (_) { res.json(await getEnvironment(24.5854, 73.7125)); }
});

router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)));
    const search = String(req.query.search || '').trim();
    const where = search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { city: { contains: search, mode: 'insensitive' } }, { state: { contains: search, mode: 'insensitive' } }, { tags: { has: search.toLowerCase() } }] } : {};
    const [spots, total] = await Promise.all([
      prisma.touristSpot.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { crowdReports: { orderBy: { recordedAt: 'desc' }, take: 1 } },
        orderBy: { name: 'asc' }
      }),
      prisma.touristSpot.count({ where })
    ]);
    res.json({ items: spots.map(s => ({ ...s, liveCrowd: s.crowdReports[0]?.level ?? null })), page, limit, total, hasMore: page * limit < total });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const spot = await req.app.get('prisma').touristSpot.findUnique({ where: { id: req.params.id }, include: { crowdReports: { orderBy: { recordedAt: 'desc' }, take: 20 } } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });
    res.json(spot);
  } catch (e) { next(e); }
});

router.get('/:id/crowd-prediction', async (req, res, next) => {
  try {
    const spot = await req.app.get('prisma').touristSpot.findUnique({ where: { id: req.params.id }, include: { crowdReports: { orderBy: { recordedAt: 'desc' }, take: 30 } } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });
    res.json(await getCrowdPrediction(spot, spot.crowdReports, req.query.date, Number(req.query.weatherRisk || 0)));
  } catch (e) { next(e); }
});

router.get('/:id/guides', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const spot = await prisma.touristSpot.findUnique({ where: { id: req.params.id } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });
    const guides = await prisma.guideProfile.findMany({
      where: { approvalStatus: 'APPROVED', OR: [{ region: spot.state }, { region: spot.city }, { region: null }] },
      include: { user: true }
    });
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const available = guides.map(g => {
      const calendar = (g.availability && typeof g.availability === 'object') ? g.availability : {};
      const onDay = calendar[date] !== undefined ? calendar[date] !== false && calendar[date] !== 'unavailable' : true;
      return { ...g, user: undefined, guideName: g.user.name, availableOnDate: Boolean(onDay) };
    });
    res.json({ guides: available });
  } catch (e) { next(e); }
});

const crowdReport = z.object({ level: z.number().int().min(1).max(5), source: z.string().max(20).default('tourist') });
router.post('/:id/crowd', async (req, res, next) => {
  try {
    const data = crowdReport.parse(req.body);
    const report = await req.app.get('prisma').crowdReport.create({ data: { spotId: req.params.id, level: data.level, source: data.source } });
    res.status(201).json({ report, message: 'Crowd confirmation recorded. It will improve the next forecast.' });
  } catch (e) { next(e); }
});

module.exports = router;