const router = require('express').Router();
const { z } = require('zod');

const createReq = z.object({
  bookingId: z.string(),
  requestedGuideId: z.string().optional(),
  reason: z.string().min(5).max(1000),
});

// Traveller asks the admin to reassign their trip's guide.
router.post('/guide-change', async (req, res, next) => {
  try {
    const data = createReq.parse(req.body);
    const prisma = req.app.get('prisma');
    const booking = await prisma.booking.findFirst({ where: { id: data.bookingId, touristId: req.user.sub } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const pending = await prisma.guideChangeRequest.findFirst({ where: { bookingId: booking.id, status: 'PENDING' } });
    if (pending) return res.status(409).json({ error: 'A change request for this trip is already pending with the admin.' });
    if (data.requestedGuideId) {
      const g = await prisma.guideProfile.findUnique({ where: { id: data.requestedGuideId } });
      if (!g || g.approvalStatus !== 'APPROVED') return res.status(400).json({ error: 'Requested guide is not available' });
      if (g.id === booking.guideId) return res.status(400).json({ error: 'This guide is already assigned to your trip' });
    }
    const r = await prisma.guideChangeRequest.create({
      data: { bookingId: booking.id, touristId: req.user.sub, currentGuideId: booking.guideId, requestedGuideId: data.requestedGuideId, reason: data.reason },
      include: { booking: { include: { spot: true } } },
    });
    res.status(201).json({ request: r, message: 'Request sent to the admin. Track it under My trips.' });
  } catch (e) { next(e); }
});

// Traveller tracks their own requests (newest first).
router.get('/mine', async (req, res, next) => {
  try {
    res.json(await req.app.get('prisma').guideChangeRequest.findMany({
      where: { touristId: req.user.sub },
      include: {
        booking: { include: { spot: true } },
        currentGuide: { include: { user: { select: { name: true } } } },
        requestedGuide: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }));
  } catch (e) { next(e); }
});

module.exports = router;
