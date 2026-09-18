const router = require('express').Router();
const { getCrowdPrediction } = require('../services/prediction');
const { getEnvironment } = require('../services/environment');
const { computeTripTotal } = require('../services/pricing');
const { z } = require('zod');

// Personalised search aliases (feature 5): beach, hill station, etc.
const TYPE_ALIASES = {
  beach: ['beach', 'island', 'coast', 'backwaters'],
  'hill station': ['mountains', 'nature', 'wellness', 'tea'],
  hills: ['mountains', 'nature', 'wellness', 'tea'],
  mountain: ['mountains', 'nature', 'adventure'],
  heritage: ['heritage', 'culture', 'history'],
  culture: ['culture', 'heritage', 'spirituality', 'food'],
  adventure: ['adventure', 'wildlife', 'nature'],
  wildlife: ['wildlife', 'nature', 'adventure'],
  wellness: ['wellness', 'nature', 'backwaters'],
  food: ['food', 'culture'],
  spiritual: ['spirituality', 'culture', 'heritage'],
  city: ['city', 'food', 'heritage'],
  island: ['island', 'beach', 'adventure'],
  desert: ['desert', 'heritage', 'adventure'],
};

function tagsForType(type) {
  if (!type) return null;
  const key = String(type).trim().toLowerCase();
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  return [key]; // fall back to raw tag
}

router.get('/environment', async (req, res, next) => {
  try {
    const latitude = Number(req.query.latitude || 24.5854), longitude = Number(req.query.longitude || 73.7125);
    res.json(await getEnvironment(latitude, longitude));
  } catch (_) { res.json(await getEnvironment(24.5854, 73.7125)); }
});

// List available interest types with live counts for filter chips.
router.get('/types', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const spots = await prisma.touristSpot.findMany({ select: { tags: true } });
    const counts = {};
    for (const s of spots) for (const t of (s.tags || [])) counts[String(t).toLowerCase()] = (counts[String(t).toLowerCase()] || 0) + 1;
    res.json({
      aliases: Object.keys(TYPE_ALIASES),
      tags: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count })),
    });
  } catch (e) { next(e); }
});

// Personalised ranking: interests + budget + safety (feature 5).
router.get('/personalised', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const interests = String(req.query.interests || req.query.type || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const budget = Number(req.query.budget || 0);
    const expand = new Set();
    for (const i of interests) (tagsForType(i) || [i]).forEach((t) => expand.add(t));
    const rows = await prisma.touristSpot.findMany({
      take: 100, orderBy: { name: 'asc' },
      include: { crowdReports: { orderBy: { recordedAt: 'desc' }, take: 1 } },
    });
    const scored = rows.map((s) => {
      const tags = (s.tags || []).map((t) => String(t).toLowerCase());
      const hits = [...expand].filter((t) => tags.includes(t)).length;
      const interestScore = expand.size ? hits / expand.size : 0.3;
      const safetyScore = (Number(s.safetyScore) || 80) / 100;
      const budgetScore = budget > 0 ? Math.max(0, 1 - Math.abs(Number(s.averageCost) - budget) / budget) : 0.5;
      const crowdPenalty = ((s.crowdReports[0]?.level ?? 3) - 1) / 4 * 0.25;
      const score = Math.round((interestScore * 0.5 + safetyScore * 0.25 + budgetScore * 0.25 - crowdPenalty) * 100);
      return { ...s, liveCrowd: s.crowdReports[0]?.level ?? null, matchScore: score, matchedTags: tags.filter((t) => expand.has(t)) };
    });
    scored.sort((a, b) => b.matchScore - a.matchScore);
    res.json({ items: scored.slice(0, Number(req.query.limit || 20)), interests: [...expand] });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 100)));
    const search = String(req.query.search || '').trim();
    const type = String(req.query.type || req.query.interest || '').trim();
    const state = String(req.query.state || '').trim();
    const maxCost = Number(req.query.maxCost || 0);
    const minSafety = Number(req.query.minSafety || 0);
    const featuredOnly = String(req.query.featured || '').toLowerCase() === 'true';
    const and = [];
    if (featuredOnly) and.push({ isFeatured: true });
    if (search) and.push({ OR: [{ name: { contains: search, mode: 'insensitive' } }, { city: { contains: search, mode: 'insensitive' } }, { state: { contains: search, mode: 'insensitive' } }, { tags: { has: search.toLowerCase() } }] });
    if (type) {
      const tags = tagsForType(type) || [type.toLowerCase()];
      and.push({ tags: { hasSome: tags } });
    }
    if (state) and.push({ state: { equals: state, mode: 'insensitive' } });
    if (maxCost > 0) and.push({ averageCost: { lte: maxCost } });
    if (minSafety > 0) and.push({ safetyScore: { gte: minSafety } });
    const where = and.length ? { AND: and } : {};
    const [spots, total] = await Promise.all([
      prisma.touristSpot.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { crowdReports: { orderBy: { recordedAt: 'desc' }, take: 1 }, hotels: { orderBy: { pricePerNight: 'asc' }, take: 3 } },
        orderBy: [{ isFeatured: 'desc' }, { popularity: 'desc' }, { name: 'asc' }]
      }),
      prisma.touristSpot.count({ where })
    ]);
    res.json({ items: spots.map(s => ({ ...s, liveCrowd: s.crowdReports[0]?.level ?? null, cheapestHotel: s.hotels?.[0] || null })), page, limit, total, hasMore: page * limit < total, appliedType: type || null, resolvedTags: type ? tagsForType(type) : null });
  } catch (e) { next(e); }
});

// Featured 3 — powers the home screen. One call, no auth needed.
router.get('/featured/list', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const spots = await prisma.touristSpot.findMany({
      where: { isFeatured: true },
      orderBy: { popularity: 'desc' },
      include: {
        crowdReports: { orderBy: { recordedAt: 'desc' }, take: 1 },
        hotels: { orderBy: { pricePerNight: 'asc' }, take: 3 },
      },
    });
    res.json({
      items: spots.map((s) => ({
        ...s,
        liveCrowd: s.crowdReports[0]?.level ?? null,
        cheapestHotel: s.hotels?.[0] || null,
      })),
    });
  } catch (e) { next(e); }
});

// Minimum-price comparison for a spot (feature 9).
router.get('/:id/price-compare', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const spot = await prisma.touristSpot.findUnique({ where: { id: req.params.id } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });
    const days = Math.max(1, Number(req.query.days || 3));
    let guide = null;
    if (req.query.guideId) guide = await prisma.guideProfile.findUnique({ where: { id: String(req.query.guideId) } });
    const quote = computeTripTotal({ spot, guide, cab: null, cabKm: 0, days });
    res.json({ spot: { id: spot.id, name: spot.name, averageCost: spot.averageCost }, ...quote });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const spot = await req.app.get('prisma').touristSpot.findUnique({ where: { id: req.params.id }, include: { crowdReports: { orderBy: { recordedAt: 'desc' }, take: 20 }, hotels: { orderBy: { pricePerNight: 'asc' } } } });
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
