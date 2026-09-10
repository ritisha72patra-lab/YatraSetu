const router = require('express').Router();
const { getCrowdPrediction } = require('../services/prediction');
const { z } = require('zod');

function envFallback() {
  return { aqi: 42, aqiLabel: 'Good', temperature: 28, weather: 'Clear skies', source: 'demo-fallback', updatedAt: new Date().toISOString() };
}

router.get('/environment', async (req, res, next) => {
  try {
    const latitude = Number(req.query.latitude || 24.5854), longitude = Number(req.query.longitude || 73.7125);
    const result = envFallback();
    if (process.env.OPENWEATHER_API_KEY && !process.env.OPENWEATHER_API_KEY.startsWith('replace-')) {
      const weatherResponse = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`, { signal: AbortSignal.timeout(2500) });
      if (weatherResponse.ok) {
        const weather = await weatherResponse.json();
        result.temperature = Math.round(weather.main?.temp ?? 28);
        result.weather = weather.weather?.[0]?.description || 'Clear skies';
        result.source = 'OpenWeather';
      }
    }
    if (process.env.WAQI_API_TOKEN && !process.env.WAQI_API_TOKEN.startsWith('replace-')) {
      const aqiResponse = await fetch(`https://api.waqi.info/feed/geo:${latitude};${longitude}/?token=${process.env.WAQI_API_TOKEN}`, { signal: AbortSignal.timeout(2500) });
      if (aqiResponse.ok) {
        const air = await aqiResponse.json();
        const value = Number(air.data?.aqi);
        if (air.status === 'ok' && Number.isFinite(value)) {
          result.aqi = value;
          result.aqiLabel = value <= 50 ? 'Good' : value <= 100 ? 'Moderate' : 'Needs care';
          result.source = result.source === 'demo-fallback' ? 'WAQI' : `${result.source} + WAQI`;
        }
      }
    }
    res.json(result);
  } catch (_) { res.json(envFallback()); }
});

router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 24)));
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