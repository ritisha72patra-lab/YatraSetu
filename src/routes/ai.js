const router = require('express').Router();
const { z } = require('zod');
const { getEnvironment, envFallback } = require('../services/environment');
const { isGeminiEnabled, getGeminiModel, getAiRecommendations } = require('../services/gemini');

router.get('/status', (req, res) => {
  const enabled = isGeminiEnabled();
  res.json({
    enabled,
    model: getGeminiModel(),
    message: enabled
      ? 'Gemini AI recommendations are live.'
      : 'GEMINI_API_KEY is missing — assistant uses the local heuristic. Add the key in .env to enable Gemini.'
  });
});

const recommendBody = z.object({
  query: z.string().max(120).optional().default(''),
  state: z.string().max(80).optional().default(''),
  interest: z.string().max(30).optional().default('all'),
  mode: z.enum(['recommend', 'timing']).optional().default('recommend'),
  spotName: z.string().max(80).optional().default(''),
  limit: z.number().int().min(1).max(6).optional().default(4)
});

function crowdTime(crowd, bestVisitTime) {
  if (bestVisitTime) return bestVisitTime;
  return crowd >= 4 ? 'early morning, 6:30–9:00 AM' : '8:00–11:00 AM or after 4:00 PM';
}

function heuristicReason(spot, env) {
  return `Crowd ${spot.liveCrowd ?? 3}/5 · AQI ${env.aqi} (${env.aqiLabel}) · ${env.temperature}°C, ${env.weather} · Safety ${spot.safetyScore ?? '—'}/100`;
}

router.post('/recommend', async (req, res, next) => {
  try {
    const { query, state, interest, mode, spotName, limit } = recommendBody.parse(req.body || {});
    const prisma = req.app.get('prisma');

    let rows = [];
    try {
      rows = await prisma.touristSpot.findMany({
        take: 100,
        orderBy: { name: 'asc' },
        include: { crowdReports: { orderBy: { recordedAt: 'desc' }, take: 5 } }
      });
    } catch (dbError) {
      return res.status(503).json({ error: 'Destination database is unavailable. Connect the database and run prisma:seed, then retry.' });
    }

    const needle = String(spotName || query || '').trim().toLowerCase();
    const stateNeedle = String(state || '').trim().toLowerCase();

    let filtered = rows.map(r => {
      const levels = (r.crowdReports || []).map(c => c.level);
      const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null;
      return { ...r, crowdReports: undefined, liveCrowd: r.crowdReports?.[0]?.level ?? null, crowdAverage: avg != null ? Math.round(avg * 10) / 10 : null };
    });

    if (spotName && spotName.trim()) {
      const exact = filtered.filter(s => s.name.toLowerCase() === needle);
      filtered = exact.length ? exact : filtered.filter(s => s.name.toLowerCase().includes(needle));
    } else {
      if (stateNeedle) filtered = filtered.filter(s => (s.state || '').toLowerCase() === stateNeedle);
      if (needle) filtered = filtered.filter(s => `${s.name} ${s.state} ${(s.tags || []).join(' ')}`.toLowerCase().includes(needle));
      if (interest && interest !== 'all') filtered = filtered.filter(s => (s.tags || []).map(t => String(t).toLowerCase()).includes(String(interest).toLowerCase()));
    }

    if (!filtered.length) return res.status(404).json({ error: 'No matching places yet. Try Kerala, Rajasthan, Goa, or Himachal Pradesh.' });

    const ranked = [...filtered].sort((a, b) => (a.liveCrowd ?? 3) - (b.liveCrowd ?? 3));
    const candidates = ranked.slice(0, Math.min(limit, 6));

    let activeAlerts = [];
    try {
      activeAlerts = await prisma.safetyAlert.findMany({
        where: { resolved: false, type: { in: ['CROWD', 'AQI', 'WEATHER'] } },
        orderBy: { createdAt: 'desc' },
        take: 5
      });
    } catch (_) { activeAlerts = []; }

    const enriched = await Promise.all(candidates.map(async (s) => {
      let environment = envFallback();
      try {
        if (Number.isFinite(s.latitude) && Number.isFinite(s.longitude)) environment = await getEnvironment(s.latitude, s.longitude);
      } catch (_) { environment = envFallback(); }
      return {
        id: s.id, name: s.name, state: s.state, city: s.city, description: s.description,
        latitude: s.latitude, longitude: s.longitude, tags: s.tags || [],
        averageCost: s.averageCost, safetyScore: s.safetyScore, bestVisitTime: s.bestVisitTime,
        liveCrowd: s.liveCrowd ?? 3, crowdAverage: s.crowdAverage ?? s.liveCrowd ?? 3,
        environment
      };
    }));

    const alertNote = activeAlerts.length
      ? ` Active control-room alerts (${activeAlerts.length}): ${activeAlerts.map(a => `${a.type}${a.message ? ' — ' + String(a.message).slice(0, 80) : ''}`).join('; ')}. Weigh these cautions.`
      : '';

    const toCard = (s) => ({
      name: s.name, state: s.state,
      reason: heuristicReason(s, s.environment),
      bestTime: crowdTime(Number(s.liveCrowd ?? 3), s.bestVisitTime),
      caution: Number(s.environment?.aqi) > 100 ? 'AQI is elevated — limit prolonged outdoor exertion.' : Number(s.liveCrowd ?? 3) >= 4 ? 'Expect rush — prefer early morning.' : null,
      crowd: s.liveCrowd, crowdAverage: s.crowdAverage,
      aqi: s.environment.aqi, aqiLabel: s.environment.aqiLabel,
      weather: s.environment.weather, temperature: s.environment.temperature,
      safetyScore: s.safetyScore, averageCost: s.averageCost
    });

    if (isGeminiEnabled()) {
      try {
        const ai = await getAiRecommendations({
          spotsEnriched: enriched,
          mode, interest,
          query: `${spotName || query || state || 'India'}${alertNote}`
        });
        const byName = new Map(enriched.map(s => [s.name.toLowerCase(), s]));
        const merged = (ai.recommendations || []).map(r => {
          const live = byName.get(String(r.name || '').toLowerCase());
          return { ...(live ? toCard(live) : { name: r.name }), reason: r.reason || live?.description || '', bestTime: r.bestTime || undefined, caution: r.caution ?? null };
        });
        const cards = merged.length ? merged : enriched.map(toCard);
        return res.json({
          source: 'gemini', model: getGeminiModel(), summary: ai.summary,
          recommendations: cards, generatedAt: new Date().toISOString()
        });
      } catch (geminiError) {
        return res.json({
          source: 'heuristic-fallback', model: getGeminiModel(),
          summary: `Gemini is configured but the request failed (${geminiError.message}). Showing the local ranking from live crowd, AQI and weather signals instead.`,
          recommendations: enriched.map(toCard), generatedAt: new Date().toISOString()
        });
      }
    }

    const place = spotName || query || state || 'India';
    return res.json({
      source: 'heuristic',
      summary: mode === 'timing'
        ? `Best-time guidance for ${place} from live signals (crowd, AQI, weather). Add GEMINI_API_KEY in .env for Gemini-written advice.`
        : `Top picks for ${place} ranked by live crowd, AQI and weather. Add GEMINI_API_KEY in .env for Gemini-written recommendations.`,
      recommendations: enriched.map(toCard),
      generatedAt: new Date().toISOString(),
      note: 'Set GEMINI_API_KEY to switch this endpoint to Gemini.'
    });
  } catch (e) { next(e); }
});

module.exports = router;
