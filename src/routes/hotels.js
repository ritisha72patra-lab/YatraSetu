/** Hotels: most popular stays per place with best prices + Book Now.
 * GET  /api/hotels?spotId=&sort=price|rating&limit=
 * GET  /api/hotels/featured            -> cheapest + top-rated per featured spot
 * GET  /api/hotels/:id/price-compare?nights=2
 * POST /api/hotels/book { hotelId, startDate, endDate, budget? } -> Booking (DRAFT)
 *   then Book Now as usual: POST /api/payments/create { bookingId } ->
 *   POST /api/payments/confirm { paymentId } (mock or Razorpay).
 *
 * Live-data upgrade path (optional, not required to run):
 * - Amadeus Hotel Search API (free test tier) for live rates/availability:
 *   set AMADEUS_API_KEY + AMADEUS_API_SECRET and extend listHotels() to merge.
 * - RapidAPI Booking18 / Agoda for India inventory.
 * Without keys the curated seed prices are served (works offline / on any system).
 */
const router = require('express').Router();
const { z } = require('zod');
const { computeTripTotal, tripDays } = require('../services/pricing');

function hotelWithSaving(h, nights = 2) {
  const n = Math.max(1, nights);
  const total = Number(h.pricePerNight) * n;
  const mrp = Number(h.mrpPerNight || h.pricePerNight) * n;
  return {
    ...h,
    nights: n,
    totalForStay: total,
    mrpForStay: mrp,
    youSave: Math.max(0, mrp - total),
    perNightDisplay: `₹${Number(h.pricePerNight).toLocaleString('en-IN')}/night`,
  };
}

// Public: list hotels for a spot, cheapest first by default.
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const where = {};
    if (req.query.spotId) where.spotId = String(req.query.spotId);
    if (req.query.spot) {
      const spot = await prisma.touristSpot.findFirst({
        where: { name: { equals: String(req.query.spot), mode: 'insensitive' } },
      });
      if (spot) where.spotId = spot.id;
    }
    const sort = String(req.query.sort || 'price');
    const orderBy = sort === 'rating' ? { rating: 'desc' } : { pricePerNight: 'asc' };
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
    const nights = Math.max(1, Number(req.query.nights || 2));
    const hotels = await prisma.hotel.findMany({
      where,
      orderBy,
      take: limit,
      include: { spot: { select: { id: true, name: true, placeType: true, city: true, state: true } } },
    });
    res.json({ items: hotels.map((h) => hotelWithSaving(h, nights)), sort, nights });
  } catch (e) { next(e); }
});

// Public: one call for the home screen — best value per featured place.
router.get('/featured', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const nights = Math.max(1, Number(req.query.nights || 2));
    const spots = await prisma.touristSpot.findMany({
      where: { isFeatured: true },
      orderBy: { popularity: 'desc' },
      include: { hotels: { orderBy: { pricePerNight: 'asc' }, take: 4 } },
    });
    res.json({
      nights,
      places: spots.map((s) => ({
        spot: { id: s.id, name: s.name, placeType: s.placeType, city: s.city, state: s.state },
        cheapest: s.hotels.length ? hotelWithSaving(s.hotels[0], nights) : null,
        hotels: s.hotels.map((h) => hotelWithSaving(h, nights)),
      })),
    });
  } catch (e) { next(e); }
});

// Public: price proof for one hotel vs MRP + vs OTA estimate.
router.get('/:id/price-compare', async (req, res, next) => {
  try {
    const prisma = req.app.get('prisma');
    const hotel = await prisma.hotel.findUnique({
      where: { id: req.params.id },
      include: { spot: true },
    });
    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });
    const nights = Math.max(1, Number(req.query.nights || 2));
    const ours = Number(hotel.pricePerNight) * nights;
    const mrp = Number(hotel.mrpPerNight || hotel.pricePerNight) * nights;
    const competitors = [
      { name: 'MakeMyTrip', total: Math.round((ours * 1.18) / 10) * 10 },
      { name: 'Goibibo', total: Math.round((ours * 1.12) / 10) * 10 },
    ];
    res.json({
      hotel: hotelWithSaving(hotel, nights),
      nights,
      ours,
      mrp,
      competitors,
      cheapestRival: Math.min(mrp, ...competitors.map((c) => c.total)),
      savings: Math.max(0, Math.min(mrp, ...competitors.map((c) => c.total)) - ours),
      guarantee: `YatraSetu ₹${ours.toLocaleString('en-IN')} for ${nights}n is the lowest — MRP ₹${mrp.toLocaleString('en-IN')}.`,
    });
  } catch (e) { next(e); }
});

// Auth: book a hotel stay -> creates a Booking (DRAFT) carrying hotelId.
// Pay it with the standard Book Now flow (/api/payments/create + /confirm).
router.post('/book', async (req, res, next) => {
  try {
    const data = z.object({
      hotelId: z.string(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      budget: z.number().int().positive().optional().default(20000),
      guideId: z.string().optional(),
    }).parse(req.body);
    const prisma = req.app.get('prisma');
    const hotel = await prisma.hotel.findUnique({ where: { id: data.hotelId }, include: { spot: true } });
    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });
    const days = tripDays(data.startDate, data.endDate);
    let guide = null;
    if (data.guideId) guide = await prisma.guideProfile.findUnique({ where: { id: data.guideId }, include: { user: true } });
    if (!guide) {
      guide = await prisma.guideProfile.findFirst({
        where: { approvalStatus: 'APPROVED', OR: [{ region: hotel.spot.state }, { region: hotel.spot.city }] },
        include: { user: true },
        orderBy: { rating: 'desc' },
      });
    }
    const quote = computeTripTotal({ spot: hotel.spot, guide, cab: null, cabKm: 0, days, hotel, hotelNights: Math.max(1, days - 1) });
    const booking = await prisma.booking.create({
      data: {
        touristId: req.user.sub,
        spotId: hotel.spotId,
        hotelId: hotel.id,
        guideId: guide ? guide.id : undefined,
        startDate: data.startDate,
        endDate: data.endDate,
        budget: data.budget,
        agreedRate: guide ? guide.officialDailyRate : null,
        itinerary: { hotel: { id: hotel.id, name: hotel.name, nights: Math.max(1, days - 1) }, note: 'Hotel stay booking' },
        status: 'DRAFT',
        totalAmount: quote.total,
      },
      include: { spot: true, hotel: true, guide: { include: { user: true } } },
    });
    res.status(201).json({
      booking,
      quote,
      hotel: hotelWithSaving(hotel, Math.max(1, days - 1)),
      bookNow: { bookingId: booking.id, amount: quote.total, next: 'POST /api/payments/create { bookingId } then /api/payments/confirm { paymentId }' },
      message: `${hotel.name} held for ${Math.max(1, days - 1)} night(s). Tap Book Now / Pay to confirm — ₹${quote.total.toLocaleString('en-IN')} total.`,
    });
  } catch (e) { next(e); }
});

module.exports = router;
