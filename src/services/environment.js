/** Shared AQI + weather lookup. Keys stay server-side; frontend calls /api/spots/environment. */

function envFallback() {
  return { aqi: 42, aqiLabel: 'Good', temperature: 28, weather: 'Clear skies', source: 'demo-fallback', updatedAt: new Date().toISOString() };
}

async function getEnvironment(latitude, longitude) {
  const lat = Number(latitude), lon = Number(longitude);
  const result = envFallback();
  try {
    if (process.env.OPENWEATHER_API_KEY && !process.env.OPENWEATHER_API_KEY.startsWith('replace-')) {
      const weatherResponse = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`, { signal: AbortSignal.timeout(2500) });
      if (weatherResponse.ok) {
        const weather = await weatherResponse.json();
        result.temperature = Math.round(weather.main?.temp ?? 28);
        result.weather = weather.weather?.[0]?.description || 'Clear skies';
        result.source = 'OpenWeather';
      }
    }
    if (process.env.WAQI_API_TOKEN && !process.env.WAQI_API_TOKEN.startsWith('replace-')) {
      const aqiResponse = await fetch(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${process.env.WAQI_API_TOKEN}`, { signal: AbortSignal.timeout(2500) });
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
  } catch (_) { /* keep fallback values */ }
  return result;
}

module.exports = { envFallback, getEnvironment };
