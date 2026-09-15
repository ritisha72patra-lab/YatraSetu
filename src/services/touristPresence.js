/**
 * In-memory live-presence store for tourist locations.
 *
 * Why in-memory (and scalable):
 * - Tourist heartbeats are high-frequency, low-value writes. Hitting Postgres
 *   on every 15s ping does not scale; this store is O(1) per update with TTL
 *   expiry and no DB round-trip.
 * - For multi-instance production, swap the Map with Redis (SETEX + GEOADD)
 *   behind the same three functions — callers do not change.
 *
 * TTL: entries expire after PRESENCE_TTL_MS (default 5 min). A sweeper runs
 * lazily on read + on a 60s interval to avoid unbounded growth.
 */
const store = new Map(); // userId -> { userId, name, latitude, longitude, accuracy, updatedAt }
const PRESENCE_TTL_MS = Number(process.env.TOURIST_PRESENCE_TTL_MS || 5 * 60 * 1000);
const MIN_UPDATE_INTERVAL_MS = 5000; // server-side throttle: ignore pings faster than this

function isExpired(entry, now = Date.now()) {
  return !entry || now - new Date(entry.updatedAt).getTime() > PRESENCE_TTL_MS;
}

function sweep() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (isExpired(entry, now)) store.delete(key);
  }
}

// Lazy + periodic sweep keeps memory bounded even with no reads.
if (!global.__ysPresenceSweep) {
  global.__ysPresenceSweep = setInterval(sweep, 60 * 1000);
  if (global.__ysPresenceSweep.unref) global.__ysPresenceSweep.unref();
}

function upsertPresence({ userId, name, latitude, longitude, accuracy }) {
  const prev = store.get(userId);
  const now = Date.now();
  if (prev && now - new Date(prev.updatedAt).getTime() < MIN_UPDATE_INTERVAL_MS) {
    return { location: prev, throttled: true };
  }
  const location = {
    userId,
    name: name || 'Traveller',
    latitude,
    longitude,
    accuracy: accuracy ?? null,
    updatedAt: new Date().toISOString(),
  };
  store.set(userId, location);
  return { location, throttled: false };
}

function liveTourists() {
  sweep();
  return [...store.values()];
}

function clearPresence(userId) {
  store.delete(userId);
}

module.exports = { upsertPresence, liveTourists, clearPresence, PRESENCE_TTL_MS };
