/**
 * Gemini AI integration for YatraSetu recommendations.
 * The API key stays server-side (GEMINI_API_KEY). Frontend calls /api/ai/recommend.
 * Without a key, callers fall back to the local heuristic so the app keeps working.
 */

function getGeminiModel() {
  return (process.env.GEMINI_MODEL || 'gemini-3.6-flash').trim() || 'gemini-3.6-flash';
}

function isGeminiEnabled() {
  const key = process.env.GEMINI_API_KEY || '';
  return Boolean(key) && !key.startsWith('replace-') && !key.startsWith('your-') && key.length >= 20;
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!isGeminiEnabled()) throw new Error('Gemini is not configured. Set GEMINI_API_KEY in .env.');
  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini request failed (${response.status})`;
    throw new Error(message);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  if (!text.trim()) throw new Error('Gemini returned an empty response.');
  return text.trim();
}

function buildRecommendationPrompt({ spots, mode, interest, query }) {
  const lines = spots.map((s, i) => {
    const env = s.environment || {};
    return `${i + 1}. ${s.name}, ${s.state} — ${s.description || 'Popular destination.'}\n   Crowd signal: ${s.liveCrowd ?? 'unknown'}/5 (recent avg ${s.crowdAverage ?? 'n/a'}/5) · Safety score: ${s.safetyScore ?? 'n/a'}/100 · Best visit: ${s.bestVisitTime || 'morning'}\n   AQI: ${env.aqi ?? 'n/a'} (${env.aqiLabel || 'unknown'}) · Weather: ${env.temperature ?? 'n/a'}°C, ${env.weather || 'unknown'} · Typical cost ₹${s.averageCost ?? 'n/a'} · Tags: ${(s.tags || []).join(', ') || 'general'}`;
  }).join('\n');
  const task = mode === 'timing'
    ? 'For each place, recommend the best time window to visit today/tomorrow and one caution (heat, rain, crowds, or air quality).'
    : 'Rank the best 3-4 places for this traveller and explain each pick in one line, weighing low crowds, clean air, pleasant weather, and safety.';
  return `You are YatraSetu, a travel safety assistant for India. Use ONLY the live signals below (crowd alerts, AQI, weather, safety scores) to advise the traveller.\nTraveller filter: ${query || 'anywhere in India'} · interest: ${interest || 'all'}.\n\nLive signals:\n${lines}\n\nTask: ${task}\nSafety rule: if AQI > 100 advise limiting outdoor exertion; if crowd >= 4 advise early-morning slots; never invent data not listed above.\n\nReply as compact JSON only (no markdown fences, no preamble, no self-check — output ONLY the JSON object, with summary written as 2-3 sentences of traveller-facing guidance): {"summary":"2-3 sentence overall guidance","recommendations":[{"name":"Place","reason":"one line tied to crowd/AQI/weather","bestTime":"time window","caution":"one caution or null"}]}`;
}

function extractJson(text) {
  const cleaned = String(text).replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('No JSON found');
  // Largest slice first (pure-JSON replies), then balanced-brace scan for
  // replies with preamble/trailing text or doubled output.
  const end = cleaned.lastIndexOf('}');
  if (end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; }
    else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1)); }
  }
  throw new Error('No JSON found');
}

function sanitizeSummary(s) {
  let t = String(s || '').trim().replace(/```json|```/g, '').trim();
  if (t.startsWith('{')) {
    try {
      const inner = extractJson(t);
      if (inner && typeof inner.summary === 'string') return String(inner.summary).slice(0, 900);
    } catch {}
    try {
      const inner = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
      if (inner && typeof inner.summary === 'string') t = String(inner.summary);
    } catch {}
    t = t.replace(/^\{\s*"(summary|text|guidance)"\s*:\s*"/, '').replace(/"\s*\}\s*$/, '').replace(/\\"/g, '"').trim();
  }
  return t.slice(0, 900);
}

/**
 * spotsEnriched: [{name, state, description, liveCrowd, crowdAverage, safetyScore, bestVisitTime, averageCost, tags, environment}]
 */
async function getAiRecommendations({ spotsEnriched, mode = 'recommend', interest = 'all', query = '' }) {
  const prompt = buildRecommendationPrompt({ spots: spotsEnriched, mode, interest, query });
  const raw = await callGemini(prompt);
  try {
    const parsed = extractJson(raw);
    return { source: 'gemini', model: getGeminiModel(), summary: sanitizeSummary(parsed.summary), recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 4) : [], raw };
  } catch (_) {
    return { source: 'gemini', model: getGeminiModel(), summary: sanitizeSummary(raw), recommendations: [], raw };
  }
}

module.exports = { isGeminiEnabled, getGeminiModel, callGemini, buildRecommendationPrompt, getAiRecommendations, extractJson, sanitizeSummary };
