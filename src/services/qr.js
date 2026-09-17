/** Signed QR payloads (feature 4) — prevents forged guide/cab QR stickers.
 * Uses Node built-in crypto only (no new deps, works on any system).
 * Format: JSON { v, type:'YATRASETU_VERIFICATION', service, id, iat, sig }
 * where sig = HMAC-SHA256(canonical payload, QR_SECRET||JWT_SECRET).
 * Legacy unsigned payloads { type, service, id } are still accepted but
 * flagged signed:false so the app can warn.
 */
const crypto = require('crypto');

function qrSecret() {
  return process.env.QR_SECRET || process.env.JWT_SECRET || 'dev-qr-secret-change-me';
}

function qrTtlMs() {
  const days = Number(process.env.QR_TTL_DAYS || 730); // printed cards live ~2y
  return days * 86400000;
}

function canonical(service, id, iat) {
  return JSON.stringify({ v: 1, type: 'YATRASETU_VERIFICATION', service, id, iat });
}

function signQr(service, id, iat = Date.now()) {
  const body = canonical(service, id, iat);
  const sig = crypto.createHmac('sha256', qrSecret()).update(body).digest('hex');
  return JSON.stringify({ v: 1, type: 'YATRASETU_VERIFICATION', service, id, iat, sig });
}

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

/** Parse raw QR text from a mobile camera. Never throws — returns { ok, ... }. */
function verifyQrText(qrText) {
  let obj;
  try { obj = JSON.parse(String(qrText || '').trim()); }
  catch { return { ok: false, error: 'This QR is not a YatraSetu code. Look for the YatraSetu registry card.' }; }
  const service = String(obj.service || '').toUpperCase();
  if (obj.type !== 'YATRASETU_VERIFICATION' || !['GUIDE', 'CAB'].includes(service) || !obj.id) {
    return { ok: false, error: 'This QR is not a YatraSetu registry code.' };
  }
  // Legacy unsigned QR (issued before signing) — accept but flag.
  if (!obj.sig || !obj.iat) return { ok: true, service, id: String(obj.id), signed: false, legacy: true };
  const expected = crypto.createHmac('sha256', qrSecret()).update(canonical(service, String(obj.id), Number(obj.iat))).digest('hex');
  if (!safeEqual(expected, obj.sig)) return { ok: false, error: 'QR signature mismatch — possible forgery. Do not pay; ask for the registry card.' };
  if (Number(obj.iat) > Date.now() + 5 * 60000) return { ok: false, error: 'QR timestamp is in the future — possible forgery.' };
  if (Date.now() - Number(obj.iat) > qrTtlMs()) return { ok: false, error: 'This QR card has expired. Ask the provider for a fresh registry card.' };
  return { ok: true, service, id: String(obj.id), signed: true, issuedAt: new Date(Number(obj.iat)).toISOString() };
}

/** Overcharge / scam analysis (feature 3). Pure + explainable. */
function analysePrice({ service, record, booking, chargedAmount }) {
  const official = service === 'GUIDE' ? Number(record.officialDailyRate) : Number(record.officialRatePerKm);
  const agreed = booking && service === 'GUIDE' ? Number(booking.agreedRate || official) : official;
  const charged = chargedAmount != null && chargedAmount !== '' ? Number(chargedAmount) : null;
  const result = {
    officialPrice: official,
    agreedPrice: agreed,
    chargedPrice: Number.isFinite(charged) ? charged : null,
    unit: service === 'GUIDE' ? 'per day' : 'per km',
    isOvercharge: false,
    overchargePct: 0,
    severity: 'none', // none | warn | danger
    alerts: [],
  };
  if (!record.governmentVerified) {
    result.severity = 'danger';
    result.alerts.push('NOT APPROVED in the YatraSetu registry. Do not pay in advance; ask admin to review this provider.');
  }
  if (booking && !isAssigned(booking, service, record.id)) {
    if (result.severity !== 'danger') result.severity = 'warn';
    result.alerts.push('This provider is NOT assigned to your trip. If they claim to be your guide/driver, treat it as a scam risk.');
  }
  if (Number.isFinite(charged)) {
    const base = Number.isFinite(agreed) && agreed > 0 ? agreed : official;
    const pct = base > 0 ? Math.round(((charged - base) / base) * 100) : 0;
    result.overchargePct = pct;
    if (pct > 10) {
      result.isOvercharge = true;
      result.severity = 'danger';
      result.alerts.push(`OVERCHARGE: quoted ₹${charged} vs fixed ₹${base} (${pct}% extra). Pay only ₹${base} ${result.unit}. Report from the scan screen.`);
    } else if (pct > 0) {
      result.severity = result.severity === 'none' ? 'warn' : result.severity;
      result.alerts.push(`Slightly above fixed price (+${pct}%). You should pay ₹${base} ${result.unit}.`);
    }
  }
  if (!result.alerts.length) {
    result.alerts.push(`Fair price confirmed: ₹${agreed ?? official} ${result.unit}. No scam signals.`);
  }
  return result;
}

function isAssigned(booking, service, recordId) {
  if (!booking) return true; // no trip context -> cannot judge assignment
  return service === 'GUIDE' ? booking.guideId === recordId : booking.cabId === recordId;
}

module.exports = { signQr, verifyQrText, analysePrice, qrTtlMs };
