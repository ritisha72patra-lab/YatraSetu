/** Calls the isolated Python service so the Node API stays the single client-facing backend.
 * Sends rich features (weather, AQI, temp, holiday/festival, day/time) for the
 * scikit-learn model (feature 8). Falls back locally if Python is down.
 */
const { getEnvironment } = require('./environment');

// Fixed Indian public holidays + major festivals (2025-2027). Small, dependency-free,
// good enough for crowd uplift until a holiday API key is configured.
const HOLIDAYS = new Set([
  '2025-10-02', '2025-10-20', '2025-10-21', '2025-12-25',
  '2026-01-26', '2026-03-04', '2026-08-15', '2026-10-12', '2026-10-20', '2026-11-08', '2026-12-25',
  '2027-01-26', '2027-08-15', '2027-10-02', '2027-12-25',
]);

function isHoliday(isoDate) {
  if (HOLIDAYS.has(isoDate)) return true;
  // Optional: Calendarific/HolidayAPI via HOLIDAY_API_KEY (server-side only).
  return false;
}

async function getCrowdPrediction(spot, reports, dateValue, weatherRisk = 0) {
  const date = new Date(dateValue || Date.now());
  const iso = date.toISOString().slice(0, 10);
  const recent = reports.slice(0, 30);
  const reportAverage = recent.length ? recent.reduce((sum, item) => sum + item.level, 0) / recent.length : 3;
  const historical_average = Math.round((reportAverage / 5) * 100);
  const weekend = [0, 6].includes(date.getDay());
  const holiday = isHoliday(iso);

  let temperature = 28, aqi = 42, weatherMain = 'clear';
  try {
    const env = await getEnvironment(spot.latitude, spot.longitude);
    temperature = Number(env.temperature ?? 28);
    aqi = Number(env.aqi ?? 42);
    weatherMain = String(env.weather || 'clear').toLowerCase();
  } catch { /* keep defaults */ }

  const body = {
    spot_name: spot.name,
    forecast_date: iso,
    historical_average,
    weekend,
    holiday,
    weather_risk: Number(weatherRisk) || (/rain|storm|thunder/.test(weatherMain) ? 0.7 : 0),
    temperature_c: temperature,
    aqi,
    day_of_week: date.getDay(),
    month: date.getMonth() + 1,
  };
  const url = `${process.env.PREDICTION_SERVICE_URL || 'http://localhost:8001'}/predict`;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error('Prediction service did not respond');
    return await response.json();
  } catch (_) {
    const score = Math.min(100, Math.max(0, historical_average + (weekend ? 16 : 0) + (holiday ? 24 : 0)));
    return { crowdScore: score, level: score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low', explanation: ['Based on recent traveller crowd confirmations.', 'Prediction service is unavailable; showing local-data estimate.'], model: 'local-fallback' };
  }
}

module.exports = { getCrowdPrediction, isHoliday };
