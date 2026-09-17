/** Book Now + payments (feature 1). Mock-first, Razorpay-ready.
 * POST /api/payments/create  { bookingId, provider?, cabKm? }
 * POST /api/payments/confirm { paymentId, providerPaymentId?, fail? }
 * GET  /api/payments/mine
 * If RAZORPAY_KEY_ID/SECRET are set, creates a real Razorpay order via REST
 * (no SDK needed). Otherwise returns a mock order the Expo app confirms
 * in one tap. Either way the booking flips DRAFT -> CONFIRMED on PAID.
 */
const router = require('express').Router();
const { z } = require('zod');
const { computeTripTotal, tripDays } = require('../services/pricing');

async function razorpayOrder({ amountPaise, receipt }) {
  const keyId = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret || keyId.startsWith('replace-')) return null;
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${keyId}:${secret}`).toString('base64') },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: String(receipt).slice(0, 40) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Razorpay order failed (${res.status})`);
  return res.json();
}

router.post('/create', async (req, res, next) => {
  try {
    const data = z.object({ bookingId: z.string(), provider: z.string().max(20).optional().default('mock'), cabKm: z.number().nonnegative().max(5000).optional().default(0) }).parse(req.body);
    const prisma = req.app.get('prisma');
    const booking = await prisma.booking.findFirst({
      where: { id: data.bookingId, touristId: req.user.sub },
      include: { spot: true, guide: true, cab: true, hotel: true },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status === 'CONFIRMED' && booking.paymentStatus === 'PAID') {
      return res.status(409).json({ error: 'This trip is already paid and confirmed.' });
    }
    const days = tripDays(booking.startDate, booking.endDate);
    const quote = computeTripTotal({ spot: booking.spot, guide: booking.guide, cab: booking.cab, cabKm: data.cabKm, days, hotel: booking.hotel, hotelNights: Math.max(1, days - 1) });
    let orderId = `mock_order_${Date.now()}`, provider = 'mock', razorpay = null;
    try {
      const rp = await razorpayOrder({ amountPaise: quote.total * 100, receipt: booking.id });
      if (rp) { provider = 'razorpay'; orderId = rp.id; razorpay = { keyId: process.env.RAZORPAY_KEY_ID, order: rp }; }
    } catch (e) { provider = 'mock'; } // fall back to mock so demo never blocks
    if (data.provider === 'razorpay' && provider === 'mock' && (process.env.RAZORPAY_KEY_ID || '').length > 5) {
      // keys present but order failed — surface it
      return res.status(502).json({ error: 'Razorpay order failed; retry or use mock checkout.' });
    }
    const payment = await prisma.payment.create({
      data: { bookingId: booking.id, provider, orderId, amount: quote.total, currency: 'INR', status: 'PENDING', raw: { quote } },
    });
    await prisma.booking.update({ where: { id: booking.id }, data: { totalAmount: quote.total } });
    res.status(201).json({
      payment: { id: payment.id, orderId, amount: quote.total, currency: 'INR', provider },
      quote,
      checkout: provider === 'razorpay'
        ? { type: 'razorpay', keyId: process.env.RAZORPAY_KEY_ID, orderId, amount: quote.total * 100, currency: 'INR', bookingId: booking.id }
        : { type: 'mock', message: `Demo checkout: confirm ₹${quote.total.toLocaleString('en-IN')} to lock this trip. No real money moves.`, bookingId: booking.id, paymentId: payment.id },
    });
  } catch (e) { next(e); }
});

router.post('/confirm', async (req, res, next) => {
  try {
    const data = z.object({ paymentId: z.string(), providerPaymentId: z.string().max(80).optional(), fail: z.boolean().optional().default(false) }).parse(req.body);
    const prisma = req.app.get('prisma');
    const payment = await prisma.payment.findUnique({ where: { id: data.paymentId }, include: { booking: true } });
    if (!payment || payment.booking.touristId !== req.user.sub) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status === 'PAID') return res.json({ payment, message: 'Already paid.' });
    if (data.fail) {
      const failed = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      return res.json({ payment: failed, message: 'Payment marked as failed. Try again.' });
    }
    const updated = await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: 'PAID', paymentId: data.providerPaymentId || `mock_pay_${Date.now()}` } }),
      prisma.booking.update({ where: { id: payment.bookingId }, data: { status: 'CONFIRMED', paymentStatus: 'PAID' }, include: { spot: true, hotel: true, guide: { include: { user: true } }, cab: true } }),
    ]);
    res.json({ payment: updated[0], booking: updated[1], message: `Booked! ${updated[1].spot.name} is confirmed. Your day-wise plan and guide details are ready.` });
  } catch (e) { next(e); }
});

router.get('/mine', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    res.json(await prisma.payment.findMany({
      where: { booking: { touristId: req.user.sub } },
      include: { booking: { include: { spot: true } } },
      orderBy: { createdAt: 'desc' }, take: 30,
    }));
  } catch (e) { next(e); }
});

module.exports = router;
