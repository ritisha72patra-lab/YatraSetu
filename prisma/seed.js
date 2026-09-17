require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const PASSWORD = 'DemoPass123!';

// Curated catalogue: ONLY 3 most popular places, one per type.
const SPOTS = [
  {
    name: 'Jaipur',
    city: 'Jaipur',
    state: 'Rajasthan',
    placeType: 'Historical',
    isFeatured: true,
    popularity: 100,
    description: 'The Pink City — Amber Fort, City Palace, Hawa Mahal, bazaars and Rajput cuisine. Best for first-time heritage travellers.',
    latitude: 26.9124,
    longitude: 75.7873,
    tags: ['heritage', 'culture', 'history', 'food'],
    averageCost: 4900,
    safetyScore: 84,
    bestVisitTime: '7–10 AM',
    imageUrl: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Goa',
    city: 'Panaji',
    state: 'Goa',
    placeType: 'Beach',
    isFeatured: true,
    popularity: 98,
    description: 'India\'s favourite beach escape — Baga & Palolem sands, Portuguese quarters of Fontainhas, seafood and sunsets.',
    latitude: 15.4909,
    longitude: 73.8278,
    tags: ['beach', 'food', 'heritage', 'coast'],
    averageCost: 7200,
    safetyScore: 86,
    bestVisitTime: '4–7 PM',
    imageUrl: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Manali',
    city: 'Manali',
    state: 'Himachal Pradesh',
    placeType: 'Hill Station',
    isFeatured: true,
    popularity: 96,
    description: 'Himalayan valley town — Solang slopes, Old Manali cafés, pine trails and snow peaks. Best for mountains on a budget.',
    latitude: 32.2432,
    longitude: 77.1892,
    tags: ['mountains', 'adventure', 'wellness', 'nature'],
    averageCost: 6800,
    safetyScore: 85,
    bestVisitTime: '9 AM–1 PM',
    imageUrl: 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?auto=format&fit=crop&w=900&q=80',
  },
];

// Most popular hotels per place with best (lowest) prices. mrpPerNight lets the
// app prove the saving: save = mrp - price.
const HOTELS = [
  // Jaipur — Historical
  { spot: 'Jaipur', name: 'Rambagh Palace, Jaipur', stars: 5, pricePerNight: 18500, mrpPerNight: 22000, rating: 4.8, reviewsCount: 2400, amenities: ['Pool', 'Spa', 'Heritage suites', 'Fine dining'], imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: true },
  { spot: 'Jaipur', name: 'Hotel Pearl Palace', stars: 3, pricePerNight: 3200, mrpPerNight: 4000, rating: 4.5, reviewsCount: 5200, amenities: ['Rooftop restaurant', 'Free Wi-Fi', 'Family rooms'], imageUrl: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: true },
  { spot: 'Jaipur', name: 'Zostel Jaipur (Hostel)', stars: 2, pricePerNight: 999, mrpPerNight: 1299, rating: 4.4, reviewsCount: 8100, amenities: ['Dorms', 'Café', 'Backpacker vibe'], imageUrl: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: false },
  // Goa — Beach
  { spot: 'Goa', name: 'Taj Cidade de Goa Heritage', stars: 5, pricePerNight: 14500, mrpPerNight: 17500, rating: 4.7, reviewsCount: 3100, amenities: ['Beach access', 'Pool', 'Casino nearby', 'Sea view'], imageUrl: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: true },
  { spot: 'Goa', name: 'BloomSuites, Calangute', stars: 4, pricePerNight: 5800, mrpPerNight: 7200, rating: 4.5, reviewsCount: 4600, amenities: ['5-min walk to beach', 'Breakfast', 'Co-working'], imageUrl: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: true },
  { spot: 'Goa', name: 'goSTOPS Baga (Hostel)', stars: 2, pricePerNight: 899, mrpPerNight: 1199, rating: 4.3, reviewsCount: 7400, amenities: ['Dorms', 'Pool table', 'Nightlife walk'], imageUrl: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: false },
  // Manali — Hill Station
  { spot: 'Manali', name: 'The Himalayan, Manali', stars: 5, pricePerNight: 12500, mrpPerNight: 15000, rating: 4.8, reviewsCount: 1900, amenities: ['Castle stay', 'Valley view', 'Spa', 'Bonfire'], imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: true },
  { spot: 'Manali', name: 'Johnson Lodge & Spa', stars: 4, pricePerNight: 6200, mrpPerNight: 7800, rating: 4.6, reviewsCount: 2800, amenities: ['Heated rooms', 'Trout restaurant', 'River view'], imageUrl: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: true },
  { spot: 'Manali', name: 'Hotel Mountain Face', stars: 3, pricePerNight: 3400, mrpPerNight: 4200, rating: 4.4, reviewsCount: 3500, amenities: ['Mall Road walk', 'Breakfast', 'Parking'], imageUrl: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: false },
  { spot: 'Manali', name: 'Zostel Manali (Hostel)', stars: 2, pricePerNight: 799, mrpPerNight: 999, rating: 4.5, reviewsCount: 9200, amenities: ['Dorms', 'Café', 'Trek desk'], imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=900&q=80', provider: 'YatraSetu Direct', isFeatured: false },
];

const GUIDES = [
  { name: 'Arjun Mehta', email: 'arjun@yatrasetu.in', licence: 'TG-2026-884', region: 'Rajasthan', rate: 2400, rating: 4.9, totalTrips: 328, bio: 'Heritage specialist — Amber Fort, City Palace and bazaar walks.', languages: ['English', 'Hindi', 'French'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': true, '2026-10-16': true, '2026-10-17': true } },
  { name: 'Rahul Desai', email: 'rahul@yatrasetu.in', licence: 'TG-2026-903', region: 'Goa', rate: 2600, rating: 4.7, totalTrips: 195, bio: 'Goa beaches, Portuguese quarters and seafood trails.', languages: ['English', 'Konkani', 'Hindi'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': false } },
  { name: 'Kabir Thakur', email: 'kabir@yatrasetu.in', licence: 'TG-2026-951', region: 'Himachal Pradesh', rate: 2300, rating: 4.8, totalTrips: 212, bio: 'Manali valleys, Solang adventures and Old Manali food walks.', languages: ['English', 'Hindi'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': true, '2026-10-16': true } },
];

const CABS = [
  { driver: 'Priya Sharma', registration: 'RJ14-YS-2026', permit: 'RTO-RJ-VERIFY-221', rate: 18.5, capacity: 4, rating: 4.8, region: 'Rajasthan', availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': true, '2026-10-16': true } },
  { driver: 'Ritu Verma', registration: 'GA01-YS-6145', permit: 'RTO-GA-VERIFY-077', rate: 21, capacity: 4, rating: 4.8, region: 'Goa', availability: { '2026-10-12': true, '2026-10-13': true } },
  { driver: 'Amit Negi', registration: 'HP01-YS-7741', permit: 'RTO-HP-VERIFY-033', rate: 22, capacity: 4, rating: 4.7, region: 'Himachal Pradesh', availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true } },
];

const CROWD_REPORTS = [
  { spot: 'Jaipur', levels: [4, 3, 4, 4, 3] },
  { spot: 'Goa', levels: [4, 4, 5, 4, 4] },
  { spot: 'Manali', levels: [2, 2, 2, 3, 2] },
];

async function upsertDemoUser() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: 'admin@yatrasetu.in' },
    update: { role: 'ADMIN' },
    create: { name: 'YatraSetu Admin', email: 'admin@yatrasetu.in', passwordHash, role: 'ADMIN' }
  });
}

async function seedSpots() {
  for (const s of SPOTS) {
    await prisma.touristSpot.upsert({ where: { name: s.name }, update: { ...s }, create: s });
  }
  // Enforce the 3-place catalogue: remove everything else (and its dependent rows).
  const keep = SPOTS.map((s) => s.name);
  const doomed = await prisma.touristSpot.findMany({ where: { name: { notIn: keep } }, select: { id: true } });
  if (doomed.length) {
    const ids = doomed.map((d) => d.id);
    const bookings = await prisma.booking.findMany({ where: { spotId: { in: ids } }, select: { id: true } });
    const bookingIds = bookings.map((b) => b.id);
    if (bookingIds.length) {
      await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.feedback.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.guideChangeRequest.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    await prisma.hotel.deleteMany({ where: { spotId: { in: ids } } });
    await prisma.feedback.deleteMany({ where: { spotId: { in: ids } } });
    await prisma.crowdReport.deleteMany({ where: { spotId: { in: ids } } });
    await prisma.touristSpot.deleteMany({ where: { id: { in: ids } } });
    console.log(`Removed ${doomed.length} non-featured spots; catalogue is now 3 places.`);
  }
}

async function seedHotels() {
  for (const h of HOTELS) {
    const spot = await prisma.touristSpot.findUnique({ where: { name: h.spot } });
    if (!spot) continue;
    const { spot: _s, ...data } = h;
    await prisma.hotel.upsert({
      where: { spotId_name: { spotId: spot.id, name: h.name } },
      update: { ...data, spotId: spot.id },
      create: { ...data, spotId: spot.id },
    });
  }
}

async function seedCrowdReports() {
  for (const entry of CROWD_REPORTS) {
    const spot = await prisma.touristSpot.findUnique({ where: { name: entry.spot } });
    if (!spot) continue;
    const existing = await prisma.crowdReport.count({ where: { spotId: spot.id } });
    if (existing >= 5) continue;
    for (const level of entry.levels) {
      await prisma.crowdReport.create({ data: { spotId: spot.id, level, source: 'tourist' } });
    }
  }
}

async function seedGuides() {
  for (const g of GUIDES) {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const user = await prisma.user.upsert({
      where: { email: g.email },
      update: { role: 'GUIDE' },
      create: { name: g.name, email: g.email, passwordHash, role: 'GUIDE' }
    });
    await prisma.guideProfile.upsert({
      where: { userId: user.id },
      update: {
        governmentVerified: true,
        approvalStatus: 'APPROVED',
        region: g.region,
        officialDailyRate: g.rate,
        rating: g.rating,
        totalTrips: g.totalTrips,
        bio: g.bio,
        languages: g.languages,
        availability: g.availability
      },
      create: {
        userId: user.id,
        licenceNumber: g.licence,
        governmentVerified: true,
        approvalStatus: 'APPROVED',
        officialDailyRate: g.rate,
        languages: g.languages,
        rating: g.rating,
        totalTrips: g.totalTrips,
        bio: g.bio,
        region: g.region,
        availability: g.availability
      }
    });
  }
}

async function seedCabs() {
  for (const c of CABS) {
    await prisma.cabProfile.upsert({
      where: { registrationNumber: c.registration },
      update: { governmentVerified: true, approvalStatus: 'APPROVED', region: c.region, availability: c.availability },
      create: {
        driverName: c.driver, registrationNumber: c.registration, permitNumber: c.permit,
        governmentVerified: true, approvalStatus: 'APPROVED', officialRatePerKm: c.rate, capacity: c.capacity, rating: c.rating,
        region: c.region, availability: c.availability
      }
    });
  }
}

async function seedDemoBooking() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const traveller = await prisma.user.upsert({
    where: { email: 'traveller@example.com' },
    update: {
      preferences: {
        interests: ['heritage', 'beach', 'mountains'],
        budget: 20000,
        travelStyle: '3-place highlights',
        foodPreferences: ['local thali', 'seafood'],
        pace: 'balanced',
        startDate: new Date('2026-10-12'),
        endDate: new Date('2026-10-16')
      }
    },
    create: {
      name: 'Demo Traveller',
      email: 'traveller@example.com',
      passwordHash,
      preferences: { interests: ['heritage', 'beach', 'mountains'], budget: 20000, travelStyle: '3-place highlights', foodPreferences: ['local thali', 'seafood'], pace: 'balanced', startDate: new Date('2026-10-12'), endDate: new Date('2026-10-16') }
    }
  });
  const spot = await prisma.touristSpot.findUnique({ where: { name: 'Jaipur' } });
  const arjun = await prisma.user.findUnique({ where: { email: 'arjun@yatrasetu.in' } });
  if (!spot || !arjun) return;
  const arjunProfile = await prisma.guideProfile.findUnique({ where: { userId: arjun.id } });
  if (!arjunProfile) return;
  await prisma.liveLocation.upsert({ where: { guideId: arjunProfile.id }, update: { latitude: 26.9124, longitude: 75.7873 }, create: { guideId: arjunProfile.id, latitude: 26.9124, longitude: 75.7873 } });

  const existing = await prisma.booking.findFirst({ where: { touristId: traveller.id, spotId: spot.id } });
  if (existing) return;

  const hotel = await prisma.hotel.findFirst({ where: { spotId: spot.id }, orderBy: { pricePerNight: 'asc' } });
  const roadmap = [
    { day: 1, dayTitle: 'Arrival & Jaipur orientation', slots: [{ time: '8:00 AM', activity: 'Guided sightseeing with Arjun Mehta', mode: 'Walk', spend: 900 }, { time: '12:00 PM', activity: 'Lunch break', mode: 'Rest', spend: 600 }, { time: '3:00 PM', activity: 'Amber Fort', mode: 'Vehicle', spend: 800 }, { time: '6:30 PM', activity: 'Hawa Mahal sunset', mode: 'Walk', spend: 500 }, { time: '8:00 PM', activity: 'Local dinner', mode: 'Walk', spend: 700 }] }
  ];
  await prisma.booking.create({
    data: {
      touristId: traveller.id,
      spotId: spot.id,
      guideId: arjunProfile.id,
      hotelId: hotel ? hotel.id : undefined,
      cabId: (await prisma.cabProfile.findFirst({ where: { region: 'Rajasthan' } }))?.id,
      startDate: new Date('2026-10-12'),
      endDate: new Date('2026-10-16'),
      budget: 20000,
      agreedRate: arjunProfile.officialDailyRate,
      itinerary: { roadmap, pace: 'balanced' },
      status: 'CONFIRMED'
    }
  });
}

async function main() {
  await upsertDemoUser();
  await seedSpots();
  await seedHotels();
  await seedCrowdReports();
  await seedGuides();
  await seedCabs();
  await seedDemoBooking();
  console.log('Seed complete: 3 featured places (Jaipur/Historical, Goa/Beach, Manali/Hill Station) + popular hotels + guides/cabs.');
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
