/** Calls the isolated Python service so the Node API stays the single client-facing backend. */
async function getCrowdPrediction(spot, reports, dateValue, weatherRisk = 0) {
  const date = new Date(dateValue || Date.now());
  const recent = reports.slice(0, 30);
  const reportAverage = recent.length ? recent.reduce((sum, item) => sum + item.level, 0) / recent.length : 3;
  // Convert 1–5 tourist reports to a 0–100 historical baseline. This can be replaced by aggregation from real data.
  const historical_average = Math.round((reportAverage / 5) * 100);
  const body = { historical_average, weekend: [0, 6].includes(date.getDay()), holiday: false, weather_risk: weatherRisk, spot_name: spot.name, forecast_date: date.toISOString().slice(0, 10) };
  const url = `${process.env.PREDICTION_SERVICE_URL || 'http://localhost:8001'}/predict`;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error('Prediction service did not respond');
    return await response.json();
  } catch (_) {
    return { crowdScore: historical_average, level: historical_average >= 70 ? 'High' : historical_average >= 40 ? 'Medium' : 'Low', explanation: ['Based on recent traveller crowd confirmations.', 'Prediction service is unavailable; showing local-data estimate.'], model: 'local-fallback' };
  }
}
module.exports = { getCrowdPrediction };
