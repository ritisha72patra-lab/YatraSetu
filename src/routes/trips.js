const router = require('express').Router();
const { z } = require('zod');

const trip = z.object({
  spotId: z.string(),
  guideId: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  budget: z.number().int().positive(),
  preferences: z.array(z.string()).default([])
});

const PACE_SLOTS = {
  fast: [{ t: '7:00 AM', label: 'First light tour', w: 1.4 }, { t: '10:30 AM', label: 'Cultural stop', w: 1.2 }, { t: '1:00 PM', label: 'Lunch break', w: .8 }, { t: '4:30 PM', label: 'Landmark visit', w: 1.2 }, { t: '7:30 PM', label: 'Local dinner', w: .8 }],
  balanced: [{ t: '8:00 AM', label: 'Guided sightseeing', w: 1.2 }, { t: '12:00 PM', label: 'Lunch break', w: .8 }, { t: '3:00 PM', label: 'Offbeat exploration', w: 1 }, { t: '6:30 PM', label: 'Market walk', w: .7 }, { t: '8:00 PM', label: 'Dinner', w: .7 }],
  slow: [{ t: '9:00 AM', label: 'Slow morning walk', w: 1 }, { t: '12:30 PM', label: 'Long lunch', w: .9 }, { t: '4:00 PM', label: 'Sunset viewpoint', w: 1 }, { t: '8:30 PM', label: 'Quiet dinner', w: .7 }]
};

function slotWeights(preferences, pace) {
  const slots = PACE_SLOTS[pace] || PACE_SLOTS.balanced;
  return slots;
}

function buildRoadmap(spot, guide, days, preferences, pace) {
  const slots = slotWeights(preferences, pace);
  const roadmap = [];
  for (let d = 0; d < days; d++) {
    const dayTitle = d === 0 ? `Arrival & ${spot.name} orientation` : d === days - 1 ? `${spot.name} highlights & departure` : `Explore ${spot.name} in depth`;
    const daySlots = slots.map((s, i) => ({
      time: s.t,
      activity: i === 1 && d === days - 1 ? `Last stroll + souvenir stop` : `${s.label}${guide ? ` with ${guide.guideName}` : ''}`,
      mode: ['t', 't'].includes(s.t.split(' ')[1]) ? 'Walk' : 'Vehicle',
      spend: Math.round(spot.averageCost * s.w)
    }));
    roadmap.push({ day: d + 1, dayTitle, slots: daySlots });
  }
  return roadmap;
}

router.post('/plan', async (req, res, next) => {
  try {
    const data = trip.parse(req.body);
    const prisma = req.app.get('prisma');
    const spot = await prisma.touristSpot.findUnique({ where: { id: data.spotId } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });

    const days = Math.max(1, Math.ceil((data.endDate - data.startDate) / 86400000));
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

    const accommodation = Math.round(data.budget * .42), food = Math.round(data.budget * .22), transit = Math.round(data.budget * .18), activities = data.budget - accommodation - food - transit;
    const pace = 'balanced';
    const roadmap = buildRoadmap(spot, guide ? { guideName: guide.user.name } : null, days, data.preferences, pace);
    const itinerary = roadmap.map(r => ({ day: r.day, title: r.dayTitle, estimatedSpend: Math.round(data.budget / days), reason: `Matches your ${data.preferences.join(', ') || 'travel'} preferences.` }));

    const agreedRate = guide ? guide.officialDailyRate : null;
    const booking = await prisma.booking.create({
      data: {
        touristId: req.user.sub,
        spotId: data.spotId,
        guideId: guide ? guide.id : undefined,
        startDate: data.startDate,
        endDate: data.endDate,
        budget: data.budget,
        agreedRate,
        itinerary: { roadmap, pace },
        status: 'DRAFT'
      },
      include: { spot: true, guide: { include: { user: true } } }
    });
    res.status(201).json({
      booking,
      budgetBreakdown: { accommodation, food, transit, activities },
      explanation: `A ${days}-day plan within ₹${data.budget} · ${guide ? `Your guide ${guide.user.name} (₹${guide.officialDailyRate}/day) is reserved at a fixed rate.` : 'No guide yet — choose a verified guide on the next screen.'}`,
      suggestedGuide: guide ? { id: guide.id, name: guide.user.name, rating: guide.rating, officialDailyRate: guide.officialDailyRate, languages: guide.languages, region: guide.region } : null
    });
  } catch (e) { next(e); }
});

router.get('/mine', async (req, res, next) => {
  try {
    res.json(await req.app.get('prisma').booking.findMany({
      where: { touristId: req.user.sub },
      include: { spot: true, guide: { include: { user: true } } },
      orderBy: { startDate: 'asc' }
    }));
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const booking = await req.app.get('prisma').booking.findFirst({
      where: { id: req.params.id, touristId: req.user.sub },
      include: { spot: true, guide: { include: { user: true } }, cab: true }
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (e) { next(e); }
});

router.put('/:id/guide', async (req, res, next) => {
  try {
    const data = z.object({ guideId: z.string() }).parse(req.body);
    const prisma = req.app.get('prisma');
    const booking = await prisma.booking.findFirst({ where: { id: req.params.id, touristId: req.user.sub } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const guide = await prisma.guideProfile.findUnique({ where: { id: data.guideId }, include: { user: true } });
    if (!guide || guide.approvalStatus !== 'APPROVED') return res.status(400).json({ error: 'Guide is not available for selection' });
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { guideId: guide.id, agreedRate: guide.officialDailyRate },
      include: { spot: true, guide: { include: { user: true } } }
    });
    res.json({ booking: updated, message: `${guide.user.name} assigned at a fixed rate of ₹${guide.officialDailyRate}/day.` });
  } catch (e) { next(e); }
});

router.put('/:id/confirm', async (req, res, next) => {
  try {
    const booking = await req.app.get('prisma').booking.findFirst({ where: { id: req.params.id, touristId: req.user.sub } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const updated = await req.app.get('prisma').booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED' },
      include: { spot: true, guide: { include: { user: true } } }
    });
    res.json({ booking: updated, message: 'Trip confirmed. Your final roadmap and timings are ready and your guide will receive the plan.' });
  } catch (e) { next(e); }
});

module.exports = router;