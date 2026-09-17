/** Signal-aware day-to-day planner (feature 2).
 * Ranks each day's slots from live signals: crowd forecast, AQI/weather,
 * safety score. Pure functions + one async enricher. No new deps.
 */

const { getEnvironment } = require('./environment');
const { getCrowdPrediction } = require('./prediction');

function slotAdvice({ crowdScore, aqi, temperature, weather, safetyScore }) {
  const w = String(weather || '').toLowerCase();
  const rainy = /rain|storm|thunder|drizzle|shower/.test(w);
  const hot = Number(temperature) >= 35;
  const badAir = Number(aqi) >= 150;
  const moderateAir = Number(aqi) >= 100;
  const crowded = Number(crowdScore) >= 70;
  const unsafeEvening = Number(safetyScore) < 80;
  return { rainy, hot, badAir, moderateAir, crowded, unsafeEvening };
}

function buildDaySlots({ spot, guideName, signals, budgetPerDay }) {
  const a = slotAdvice(signals);
  const slots = [];
  const push = (time, activity, mode, spendFrac, reason, tag) =>
    slots.push({ time, activity, mode, spend: Math.round(budgetPerDay * spendFrac), reason, tag });
  const guide = guideName ? ` with ${guideName}` : '';

  // Optimised full-day template: breakfast → attraction → lunch → attraction
  // → scenic sunset → dinner → return. Signal-aware swaps keep times stable.
  const breakfastTime = a.crowded ? '07:30' : '08:30';
  push(breakfastTime, `Breakfast near stay — local ${spot.city} specialities`, 'Food', 0.10,
    a.crowded ? 'Early breakfast — gates open soon and crowds build by 9:30.' : 'Fuel up before the main site opens.', 'food');

  push(a.crowded ? '08:30' : '09:30',
    a.rainy || a.badAir ? `Indoor attraction: museum / palace interiors${guide}` : `Attraction A: main ${spot.name} sight${guide}`,
    a.rainy || a.badAir ? 'Indoor' : 'Walk', 0.18,
    a.crowded ? 'High crowd expected — early slot beats 1–2 hrs of queue.' : a.rainy || a.badAir ? 'Air/rain call — interiors first, outdoors later if it clears.' : 'Prime morning light, moderate crowds.', 'outdoor');

  push('12:30', a.rainy || a.badAir || a.hot || a.moderateAir ? 'Lunch in air-conditioned local restaurant + rest' : 'Lunch at a local favourite + short rest', 'Food', 0.14,
    a.badAir ? `AQI ${signals.aqi} — stay indoors midday, carry a mask.` : a.rainy ? 'Rain window — indoor lunch keeps the day on track.' : a.hot ? 'Heat peak — cool indoor break 12:30–2 PM.' : 'Pleasant midday — relaxed local lunch.', 'indoor');

  push('14:00', a.crowded ? `Attraction B: offbeat quarter / lesser-known trail near ${spot.name}` : `Attraction B: second ${spot.name} highlight`, 'Vehicle', 0.18,
    a.crowded ? 'Main gate is packed — offbeat route saves hours of queue.' : 'Crowd easing — best light for the second site.', 'mixed');

  push('17:30', a.unsafeEvening ? 'Scenic verified market / lakefront promenade (well-lit) near stay' : 'Scenic location — sunset point + photos',
    'Walk', 0.12,
    a.unsafeEvening ? `Safety ${signals.safetyScore}/100 — sunset from a verified, well-lit zone.` : 'Evening signals look good — golden-hour slot is safe.', 'outdoor');

  push('19:30', `Dinner — ${spot.city} dinner${guide ? ' + day debrief' : ''}`, 'Food', 0.14,
    'Refuel and review tomorrow\'s plan over a local dinner.', 'food');

  push('21:00', 'Return to hotel — rest for an early start', 'Rest', 0.04,
    'Wind down; tomorrow starts sharp.', 'rest');
  return slots;
}

/** Enrich each trip day with crowd + environment signals (parallel, capped). */
async function enrichDailySignals({ spot, startDate, days }) {
  let baseEnv;
  try { baseEnv = await getEnvironment(spot.latitude, spot.longitude); }
  catch { baseEnv = { aqi: 42, aqiLabel: 'Good', temperature: 28, weather: 'Clear skies' }; }
  const perDay = await Promise.all(Array.from({ length: days }, async (_, d) => {
    const date = new Date(new Date(startDate).getTime() + d * 86400000);
    const iso = date.toISOString().slice(0, 10);
    let crowd = { crowdScore: 45, level: 'Medium' };
    try {
      const prisma = global.__ysPrismaForPlanner;
      if (prisma) {
        const reports = await prisma.crowdReport.findMany({ where: { spotId: spot.id }, orderBy: { recordedAt: 'desc' }, take: 30 });
        crowd = await getCrowdPrediction(spot, reports, iso, 0);
      } else {
        crowd = await getCrowdPrediction(spot, [], iso, 0);
      }
    } catch { /* keep default */ }
    return {
      date: iso,
      crowdScore: Number(crowd.crowdScore ?? 45),
      crowdLevel: crowd.level || 'Medium',
      aqi: Number(baseEnv.aqi ?? 42),
      aqiLabel: baseEnv.aqiLabel || 'Good',
      temperature: Number(baseEnv.temperature ?? 28),
      weather: baseEnv.weather || 'Clear skies',
      safetyScore: Number(spot.safetyScore ?? 82),
    };
  }));
  return perDay;
}

function buildSmartRoadmap({ spot, guideName, days, startDate, preferences = [], budget, dailySignals }) {
  const budgetPerDay = Math.round(budget / days);
  return dailySignals.map((signals, d) => {
    const dayTitle = d === 0 ? `Arrival & ${spot.name} orientation`
      : d === days - 1 ? `${spot.name} highlights & departure`
      : `Explore ${spot.name} in depth`;
    const slots = buildDaySlots({ spot, guideName, signals, budgetPerDay });
    const notes = [];
    if (signals.crowdScore >= 70) notes.push(`Crowd HIGH (${signals.crowdScore}) — early start + offbeat afternoon.`);
    if (Number(signals.aqi) >= 100) notes.push(`AQI ${signals.aqi} (${signals.aqiLabel}) — midday indoors.`);
    if (/rain|storm/i.test(String(signals.weather))) notes.push(`Weather: ${signals.weather} — carry rain cover; indoor backup ready.`);
    if (Number(signals.safetyScore) < 80) notes.push('Evening kept to verified well-lit zones.');
    if (preferences.length) notes.push(`Matched to: ${preferences.slice(0, 3).join(', ')}.`);
    return { day: d + 1, date: signals.date, dayTitle, signals, slots, estimatedSpend: budgetPerDay, note: notes.join(' ') || 'Balanced day.' };
  });
}

module.exports = { buildSmartRoadmap, enrichDailySignals, buildDaySlots };
