const router = require('express').Router();
const { z } = require('zod');
const { buildSmartRoadmap, enrichDailySignals } = require('../services/smartItinerary');
const { computeTripTotal, tripDays } = require('../services/pricing');

const trip = z.object({
  spotId: z.string(),
  guideId: z.string().optional(),
  cabId: z.string().optional(),
  hotelId: z.string().optional(),
  cabKm: z.number().nonnegative().max(5000).optional().default(0),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  budget: z.number().int().positive(),
  preferences: z.array(z.string()).default([])
});

// Clash helper: a CONFIRMED booking overlapping [start, end] blocks a new plan.
async function findClashingConfirmed(prisma, touristId, startDate, endDate, excludeId) {
  const where = {
    touristId,
    status: 'CONFIRMED',
    AND: [{ startDate: { lte: new Date(endDate) } }, { endDate: { gte: new Date(startDate) } }],
  };
  if (excludeId) where.id = { not: excludeId };
  return prisma.booking.findFirst({ where, include: { spot: true } });
}

// POST /api/trips/plan — smart day-wise plan (weather/crowd/safety/AQI aware)
// + minimum-price quote + Book Now payload. Keeps old response shape and adds more.
router.post('/plan', async (req, res, next) => {
  try {
    const data = trip.parse(req.body);
    const prisma = req.app.get('prisma');
    const clash = await findClashingConfirmed(prisma, req.user.sub, data.startDate, data.endDate);
    if (clash) {
      return res.status(409).json({
        error: `A plan in that particular duration is already confirmed (${clash.spot?.name || 'trip'} ${String(clash.startDate).slice(0, 10)} → ${String(clash.endDate).slice(0, 10)}). Please choose different dates.`,
        code: 'DATE_CLASH',
        clashBookingId: clash.id,
      });
    }
    global.__ysPrismaForPlanner = prisma;
    const spot = await prisma.touristSpot.findUnique({ where: { id: data.spotId } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });

    const days = tripDays(data.startDate, data.endDate);
    let guide = null;
    if (data.guideId) {
      guide = await prisma.guideProfile.findUnique({ where: { id: data.guideId }, include: { user: true } });
    }
    if (!guide) {
      guide = await prisma.guideProfile.findFirst({
        where: { approvalStatus: 'APPROVED', OR: [{ region: spot.state }, { region: spot.city }, { region: null }] },
        include: { user: true },
        orderBy: { rating: 'desc' }
      });
    }
    let cab = null;
    if (data.cabId) cab = await prisma.cabProfile.findUnique({ where: { id: data.cabId } });
    let hotel = null;
    if (data.hotelId) hotel = await prisma.hotel.findUnique({ where: { id: data.hotelId } });

    const dailySignals = await enrichDailySignals({ spot, startDate: data.startDate, days });
    const roadmap = buildSmartRoadmap({
      spot, guideName: guide ? guide.user.name : null,
      days, startDate: data.startDate, preferences: data.preferences,
      budget: data.budget, dailySignals,
    });
    const quote = computeTripTotal({ spot, guide, cab, cabKm: data.cabKm, days, hotel, hotelNights: Math.max(1, days - 1) });
    const itinerary = roadmap.map((r) => ({ day: r.day, date: r.date, title: r.dayTitle, estimatedSpend: r.estimatedSpend, reason: r.note }));

    const booking = await prisma.booking.create({
      data: {
        touristId: req.user.sub,
        spotId: data.spotId,
        guideId: guide ? guide.id : undefined,
        cabId: cab ? cab.id : undefined,
        hotelId: hotel ? hotel.id : undefined,
        startDate: data.startDate,
        endDate: data.endDate,
        budget: data.budget,
        agreedRate: guide ? guide.officialDailyRate : null,
        itinerary: { roadmap, pace: 'balanced', signals: 'crowd+aqi+weather+safety' },
        status: 'DRAFT',
        totalAmount: quote.total,
      },
      include: { spot: true, hotel: true, guide: { include: { user: true } }, cab: true }
    });
    const accommodation = Math.round(data.budget * .42), food = Math.round(data.budget * .22), transit = Math.round(data.budget * .18), activities = data.budget - accommodation - food - transit;
    res.status(201).json({
      booking,
      roadmap, // full signal-aware day plan (feature 2)
      budgetBreakdown: { accommodation, food, transit, activities },
      quote, // minimum-price guarantee (feature 9)
      bookNow: { bookingId: booking.id, amount: quote.total, next: 'POST /api/payments/create { bookingId } then /api/payments/confirm' },
      explanation: `A ${days}-day smart plan within ₹${data.budget} · routed around crowd, AQI, weather and safety · ${guide ? `guide ${guide.user.name} (₹${guide.officialDailyRate}/day fixed)` : 'no guide yet'} · Panthan total ₹${quote.total.toLocaleString('en-IN')} (lowest vs ${quote.cheapestRival.toLocaleString('en-IN')} elsewhere).`,
      suggestedGuide: guide ? { id: guide.id, name: guide.user.name, rating: guide.rating, officialDailyRate: guide.officialDailyRate, languages: guide.languages, region: guide.region } : null
    });
  } catch (e) { next(e); } finally { global.__ysPrismaForPlanner = null; }
});

router.get('/mine', async (req, res, next) => {
  try {
    res.json(await req.app.get('prisma').booking.findMany({
      where: { touristId: req.user.sub },
      include: { spot: true, hotel: true, guide: { include: { user: true } }, cab: true, payments: { orderBy: { createdAt: 'desc' }, take: 3 } },
      orderBy: { startDate: 'asc' }
    }));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const booking = await req.app.get('prisma').booking.findFirst({
      where: { id: req.params.id, touristId: req.user.sub },
      include: { spot: true, hotel: true, guide: { include: { user: true } }, cab: true, payments: true }
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (e) { next(e); }
});

router.put('/:id/guide', async (req, res, next) => {
  try {
    const data = z.object({ guideId: z.string() }).parse(req.body);
    const prisma = req.app.get('prisma');
    const booking = await prisma.booking.findFirst({ where: { id: req.params.id, touristId: req.user.sub }, include: { spot: true, hotel: true, cab: true } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const guide = await prisma.guideProfile.findUnique({ where: { id: data.guideId }, include: { user: true } });
    if (!guide || guide.approvalStatus !== 'APPROVED') return res.status(400).json({ error: 'Guide is not available for selection' });
    const days = tripDays(booking.startDate, booking.endDate);
    const quote = computeTripTotal({ spot: booking.spot, guide, cab: booking.cab, cabKm: 0, days, hotel: booking.hotel, hotelNights: Math.max(1, days - 1) });
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { guideId: guide.id, agreedRate: guide.officialDailyRate, totalAmount: quote.total },
      include: { spot: true, guide: { include: { user: true } } }
    });
    res.json({ booking: updated, quote, message: `${guide.user.name} assigned at a fixed rate of ₹${guide.officialDailyRate}/day. New total ₹${quote.total.toLocaleString('en-IN')}.` });
  } catch (e) { next(e); }
});

router.put('/:id/confirm', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const booking = await prisma.booking.findFirst({ where: { id: req.params.id, touristId: req.user.sub } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.paymentStatus !== 'PAID') {
      return res.status(402).json({ error: 'Payment required before confirming. Call POST /api/payments/create then /api/payments/confirm (Book Now).', code: 'PAYMENT_REQUIRED', bookingId: booking.id });
    }
    const clash = await findClashingConfirmed(prisma, req.user.sub, booking.startDate, booking.endDate, booking.id);
    if (clash) {
      return res.status(409).json({
        error: `A plan in that particular duration is already confirmed (${clash.spot?.name || 'trip'} ${String(clash.startDate).slice(0, 10)} → ${String(clash.endDate).slice(0, 10)}). Please choose different dates.`,
        code: 'DATE_CLASH',
        clashBookingId: clash.id,
      });
    }
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED' },
      include: { spot: true, guide: { include: { user: true } } }
    });
    res.json({ booking: updated, message: 'Trip confirmed. Your final roadmap and timings are ready and your guide will receive the plan.' });
  } catch (e) { next(e); }
});

// Cancel a DRAFT or CONFIRMED trip. Cancelled trips are hidden on the app
// (My trips + Upcoming journeys filter out CANCELLED).
async function cancelBooking(req, res, next) {
  try {
    const prisma = req.app.get('prisma');
    const booking = await prisma.booking.findFirst({ where: { id: req.params.id, touristId: req.user.sub } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status === 'CANCELLED') return res.json({ booking, message: 'Trip is already cancelled.' });
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
      include: { spot: true, hotel: true, guide: { include: { user: true } } },
    });
    res.json({ booking: updated, message: 'Trip cancelled. It will no longer appear in My trips or Upcoming journeys.' });
  } catch (e) { next(e); }
}

router.put('/:id/cancel', cancelBooking);
router.delete('/:id', cancelBooking);

module.exports = router;
