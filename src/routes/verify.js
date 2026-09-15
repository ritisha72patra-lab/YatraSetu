const router = require('express').Router();
const QRCode = require('qrcode');
const { z } = require('zod');

async function serviceRecord(prisma, service, id) {
  return service === 'GUIDE'
    ? prisma.guideProfile.findUnique({ where: { id }, include: { user: true } })
    : prisma.cabProfile.findUnique({ where: { id } });
}
router.get('/:service/:id/qr', async (req, res, next) => {
  try {
    const service = req.params.service.toUpperCase();
    if (!['GUIDE', 'CAB'].includes(service)) return res.status(400).json({ error: 'Service must be guide or cab' });
    const record = await serviceRecord(req.app.get('prisma'), service, req.params.id);
    if (!record) return res.status(404).json({ error: `${service} record not found` });
    const payload = JSON.stringify({ type: 'YATRASETU_VERIFICATION', service, id: record.id });
    res.json({ payload, qrDataUrl: await QRCode.toDataURL(payload), expires: 'Registry checks are performed at scan time.' });
  } catch (e) { next(e); }
});
router.post('/scan', async (req, res, next) => {
  try {
    const data = z.object({ service: z.enum(['GUIDE', 'CAB']), id: z.string(), bookingId: z.string().optional() }).parse(req.body);
    const prisma = req.app.get('prisma'), record = await serviceRecord(prisma, data.service, data.id);
    if (!record) return res.status(404).json({ error: 'Registry record not found' });
    let booking = null;
    if (data.bookingId) {
      booking = await prisma.booking.findFirst({ where: { id: data.bookingId, touristId: req.user.sub } });
      if (!booking) return res.status(404).json({ error: 'Your booking was not found' });
    }
    const assigned = !booking || (data.service === 'GUIDE' ? booking.guideId === record.id : booking.cabId === record.id);
    const officialPrice = data.service === 'GUIDE' ? record.officialDailyRate : record.officialRatePerKm;
    const fixedPriceConfirmed = Boolean(booking && assigned && (data.service === 'GUIDE' ? booking.agreedRate === officialPrice : true));
    await prisma.verificationLog.create({ data: { service: data.service, guideId: data.service === 'GUIDE' ? record.id : undefined, cabId: data.service === 'CAB' ? record.id : undefined, scannedById: req.user.sub, bookingId: booking?.id, verified: record.governmentVerified, fixedPriceConfirmed } });
    res.json({ verified: record.governmentVerified, assignedToTrip: assigned, fixedPriceConfirmed, service: data.service, details: data.service === 'GUIDE' ? { name: record.user.name, licenceNumber: record.licenceNumber, officialDailyRate: officialPrice, rating: record.rating } : { driverName: record.driverName, registrationNumber: record.registrationNumber, permitNumber: record.permitNumber, officialRatePerKm: officialPrice, rating: record.rating }, message: record.governmentVerified ? 'YatraSetu registry approved. The official price is shown below.' : 'This service is not approved in the YatraSetu registry.' });
  } catch (e) { next(e); }
});
module.exports = router;
