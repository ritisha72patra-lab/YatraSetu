const router = require('express').Router();
const QRCode = require('qrcode');
const { z } = require('zod');
const { signQr, verifyQrText, analysePrice } = require('../services/qr');

async function serviceRecord(prisma, service, id) {
  return service === 'GUIDE'
    ? prisma.guideProfile.findUnique({ where: { id }, include: { user: true } })
    : prisma.cabProfile.findUnique({ where: { id } });
}

// Signed QR for printing on registry cards (feature 4).
router.get('/:service/:id/qr', async (req, res, next) => {
  try {
    const service = String(req.params.service || '').toUpperCase();
    if (!['GUIDE', 'CAB'].includes(service)) return res.status(400).json({ error: 'Service must be guide or cab' });
    const record = await serviceRecord(req.app.get('prisma'), service, req.params.id);
    if (!record) return res.status(404).json({ error: `${service} record not found` });
    const payload = signQr(service, record.id);
    res.json({ payload, qrDataUrl: await QRCode.toDataURL(payload), signed: true, expires: `Signed card · valid ${process.env.QR_TTL_DAYS || 730} days · registry re-checked at scan time.` });
  } catch (e) { next(e); }
});

const scanBody = z.object({
  service: z.enum(['GUIDE', 'CAB']).optional(),
  id: z.string().optional(),
  qrText: z.string().max(2000).optional(),
  bookingId: z.string().optional(),
  chargedAmount: z.number().int().nonnegative().max(1000000).optional(),
});

async function doScan(prisma, { service, id, bookingId, chargedAmount, scannedById }) {
  const record = await serviceRecord(prisma, service, id);
  if (!record) return { status: 404, body: { error: 'Registry record not found — treat as unverified.' } };
  let booking = null;
  if (bookingId) {
    booking = await prisma.booking.findFirst({ where: { id: bookingId, touristId: scannedById } });
    if (!booking) return { status: 404, body: { error: 'Your booking was not found' } };
  }
  const assigned = !booking || (service === 'GUIDE' ? booking.guideId === record.id : booking.cabId === record.id);
  const officialPrice = service === 'GUIDE' ? record.officialDailyRate : record.officialRatePerKm;
  const fixedPriceConfirmed = Boolean(booking && assigned && (service === 'GUIDE' ? booking.agreedRate === officialPrice : true));
  const scam = analysePrice({ service, record, booking, chargedAmount });
  const verified = Boolean(record.governmentVerified) && scam.severity !== 'danger' ? record.governmentVerified : record.governmentVerified;
  await prisma.verificationLog.create({
    data: {
      service, guideId: service === 'GUIDE' ? record.id : undefined, cabId: service === 'CAB' ? record.id : undefined,
      scannedById, bookingId: booking?.id, verified: record.governmentVerified, fixedPriceConfirmed,
      chargedAmount: scam.chargedPrice ?? undefined, overchargeFlag: scam.isOvercharge,
      note: scam.alerts.join(' | ').slice(0, 500),
    },
  }).catch(() => {});
  return {
    status: 200,
    body: {
      verified: record.governmentVerified, assignedToTrip: assigned, fixedPriceConfirmed,
      service, signedQr: undefined,
      details: service === 'GUIDE'
        ? { name: record.user.name, licenceNumber: record.licenceNumber, officialDailyRate: officialPrice, rating: record.rating }
        : { driverName: record.driverName, registrationNumber: record.registrationNumber, permitNumber: record.permitNumber, officialRatePerKm: officialPrice, rating: record.rating },
      scam, // overcharge + scam alerts (feature 3)
      message: record.governmentVerified
        ? (scam.isOvercharge ? `Registry approved BUT overcharging detected — pay only ₹${scam.agreedPrice ?? officialPrice}.` : 'YatraSetu registry approved. The official price is shown below.')
        : 'This service is NOT approved in the YatraSetu registry. Do not pay; report it.',
    },
  };
}

// Legacy + manual scan (kept for compat).
router.post('/scan', async (req, res, next) => {
  try {
    const data = scanBody.parse(req.body);
    let service = data.service, id = data.id, signed = false;
    if (data.qrText) {
      const parsed = verifyQrText(data.qrText);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error, code: 'QR_INVALID' });
      service = parsed.service; id = parsed.id; signed = parsed.signed;
      if (parsed.legacy) res.set('X-QR-Legacy', '1');
    }
    if (!service || !id) return res.status(400).json({ error: 'Provide { service, id } or { qrText } from the camera.' });
    const out = await doScan(req.app.get('prisma'), { service, id, bookingId: data.bookingId, chargedAmount: data.chargedAmount, scannedById: req.user.sub });
    if (out.status === 200 && signed === false && data.qrText) out.body.signedQr = false;
    if (out.status === 200 && signed) out.body.signedQr = true;
    res.status(out.status).json(out.body);
  } catch (e) { next(e); }
});

// Mobile camera path: POST raw QR text exactly as scanned (feature 4).
router.post('/scan-payload', async (req, res, next) => {
  try {
    const data = z.object({ qrText: z.string().min(4).max(2000), bookingId: z.string().optional(), chargedAmount: z.number().int().nonnegative().max(1000000).optional() }).parse(req.body);
    const parsed = verifyQrText(data.qrText);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error, code: 'QR_INVALID' });
    const out = await doScan(req.app.get('prisma'), { service: parsed.service, id: parsed.id, bookingId: data.bookingId, chargedAmount: data.chargedAmount, scannedById: req.user.sub });
    if (out.status === 200) { out.body.signedQr = parsed.signed; out.body.qrIssuedAt = parsed.issuedAt || null; }
    res.status(out.status).json(out.body);
  } catch (e) { next(e); }
});

// My recent scans for the app's safety timeline.
router.get('/history/mine', async (req, res, next) => {
  try {
    res.json(await req.app.get('prisma').verificationLog.findMany({
      where: { scannedById: req.user.sub },
      include: { guide: { include: { user: { select: { name: true } } } }, cab: true },
      orderBy: { scannedAt: 'desc' }, take: 30,
    }));
  } catch (e) { next(e); }
});

module.exports = router;
