require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
// Passwords are no longer seeded here — Firebase Authentication owns credentials now.
// Create matching accounts (same email) in the Firebase Console for these demo users;
// the API links them to these Prisma rows automatically on first sign-in.

const SPOTS = [
  { name: 'Udaipur', city: 'Udaipur', state: 'Rajasthan', description: 'Palaces, lakes and living heritage on the water.', latitude: 24.5854, longitude: 73.7125, tags: ['culture', 'heritage', 'lakes'], averageCost: 6400, safetyScore: 88, bestVisitTime: '8–10 AM', imageUrl: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=900&q=80' },
  { name: 'Jaipur', city: 'Jaipur', state: 'Rajasthan', description: 'Fortresses, craft and local food behind the pink walls.', latitude: 26.9124, longitude: 75.7873, tags: ['culture', 'heritage', 'food'], averageCost: 4900, safetyScore: 84, bestVisitTime: '7–10 AM', imageUrl: 'https://images.unsplash.com/photo-1535957998253-26ae1ef29506?auto=format&fit=crop&w=900&q=80' },
  { name: 'Jaisalmer', city: 'Jaisalmer', state: 'Rajasthan', description: 'Golden fort, desert camps and starlit dunes.', latitude: 26.9157, longitude: 70.9083, tags: ['heritage', 'desert', 'adventure'], averageCost: 5800, safetyScore: 83, bestVisitTime: '4:30–7 PM', imageUrl: 'https://images.unsplash.com/photo-1520524009494-47ef511fa5c8?auto=format&fit=crop&w=900&q=80' },
  { name: 'Varkala', city: 'Varkala', state: 'Kerala', description: 'Cliffs, beaches and cafés overlooking the Arabian Sea.', latitude: 8.7379, longitude: 76.7163, tags: ['beach', 'wellness', 'food'], averageCost: 5200, safetyScore: 90, bestVisitTime: '4–7 PM', imageUrl: 'https://images.unsplash.com/photo-1582972236019-ea6c7e13c8d9?auto=format&fit=crop&w=900&q=80' },
  { name: 'Alappuzha', city: 'Alappuzha', state: 'Kerala', description: 'Backwaters, houseboats and village life on canals.', latitude: 9.4981, longitude: 76.3388, tags: ['backwaters', 'wellness', 'food'], averageCost: 6100, safetyScore: 89, bestVisitTime: '6–9 AM', imageUrl: 'https://images.unsplash.com/photo-1593693412175-1b0f2a5a9b53?auto=format&fit=crop&w=900&q=80' },
  { name: 'Munnar', city: 'Munnar', state: 'Kerala', description: 'Tea gardens, misty hills and winding plantation roads.', latitude: 10.0889, longitude: 77.0595, tags: ['nature', 'mountains', 'wellness'], averageCost: 5600, safetyScore: 91, bestVisitTime: '7–11 AM', imageUrl: 'https://images.unsplash.com/photo-1590982074165-854a58e367cf?auto=format&fit=crop&w=900&q=80' },
  { name: 'Goa', city: 'Panaji', state: 'Goa', description: 'Beaches, Portuguese heritage and coastal food.', latitude: 15.4909, longitude: 73.8278, tags: ['beach', 'food', 'heritage'], averageCost: 7200, safetyScore: 86, bestVisitTime: '4–7 PM', imageUrl: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=900&q=80' },
  { name: 'Varanasi', city: 'Varanasi', state: 'Uttar Pradesh', description: 'Ghats, spiritual traditions and river ceremonies.', latitude: 25.3176, longitude: 82.9739, tags: ['culture', 'spirituality', 'food'], averageCost: 4200, safetyScore: 79, bestVisitTime: '5:30–8 AM', imageUrl: 'https://images.unsplash.com/photo-1561361058-c24cecae35ca?auto=format&fit=crop&w=900&q=80' },
  { name: 'Agra', city: 'Agra', state: 'Uttar Pradesh', description: 'The Taj Mahal, Mughal heritage and crafts.', latitude: 27.1767, longitude: 78.0081, tags: ['heritage', 'culture', 'photography'], averageCost: 3900, safetyScore: 80, bestVisitTime: '6–9 AM', imageUrl: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=900&q=80' },
  { name: 'Delhi', city: 'Delhi', state: 'Delhi', description: 'Historic forts, markets and living food culture.', latitude: 28.6139, longitude: 77.209, tags: ['culture', 'heritage', 'food'], averageCost: 4500, safetyScore: 78, bestVisitTime: '8–11 AM', imageUrl: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=900&q=80' },
  { name: 'Manali', city: 'Manali', state: 'Himachal Pradesh', description: 'Mountain valleys, trails and quiet escapes.', latitude: 32.2432, longitude: 77.1892, tags: ['mountains', 'adventure', 'wellness'], averageCost: 6800, safetyScore: 85, bestVisitTime: '9 AM–1 PM', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=900&q=80' },
  { name: 'Shimla', city: 'Shimla', state: 'Himachal Pradesh', description: 'Colonial hills, pine ridges and toy-train journeys.', latitude: 31.1048, longitude: 77.1734, tags: ['mountains', 'heritage', 'food'], averageCost: 5400, safetyScore: 87, bestVisitTime: '10 AM–6 PM', imageUrl: 'https://images.unsplash.com/photo-1521335629791-ce4aec41bfe4?auto=format&fit=crop&w=900&q=80' },
  { name: 'Rishikesh', city: 'Rishikesh', state: 'Uttarakhand', description: 'Yoga, rafting and Himalayan river landscapes.', latitude: 30.0869, longitude: 78.2676, tags: ['adventure', 'wellness', 'nature'], averageCost: 4800, safetyScore: 86, bestVisitTime: '6–10 AM', imageUrl: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=900&q=80' },
  { name: 'Mussoorie', city: 'Mussoorie', state: 'Uttarakhand', description: 'Mountain town with lakes, forests and mall roads.', latitude: 30.4598, longitude: 78.0644, tags: ['nature', 'mountains', 'wellness'], averageCost: 5700, safetyScore: 84, bestVisitTime: '7–11 AM', imageUrl: 'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?auto=format&fit=crop&w=900&q=80' },
  { name: 'Leh', city: 'Leh', state: 'Ladakh', description: 'High-altitude monasteries, lakes and mountain roads.', latitude: 34.1526, longitude: 77.5771, tags: ['mountains', 'adventure', 'nature'], averageCost: 9500, safetyScore: 82, bestVisitTime: '9 AM–4 PM', imageUrl: 'https://images.unsplash.com/photo-1598882308099-6f9d15bdd6f5?auto=format&fit=crop&w=900&q=80' },
  { name: 'Mumbai', city: 'Mumbai', state: 'Maharashtra', description: 'Coastal neighborhoods, cinema and landmark architecture.', latitude: 19.076, longitude: 72.8777, tags: ['city', 'food', 'coast'], averageCost: 7600, safetyScore: 81, bestVisitTime: '5:30–9 AM', imageUrl: 'https://images.unsplash.com/photo-1570168007204-dfb528e6958d?auto=format&fit=crop&w=900&q=80' },
  { name: 'Hampi', city: 'Hospet', state: 'Karnataka', description: 'Ruins, boulders and the Vijayanagara story.', latitude: 15.335, longitude: 76.46, tags: ['heritage', 'history', 'adventure'], averageCost: 5300, safetyScore: 88, bestVisitTime: '6–10 AM', imageUrl: 'https://images.unsplash.com/photo-1605649487212-47bdab064df7?auto=format&fit=crop&w=900&q=80' },
  { name: 'Mysuru', city: 'Mysuru', state: 'Karnataka', description: 'Palaces, art, gardens and South Indian cuisine.', latitude: 12.2958, longitude: 76.6394, tags: ['culture', 'heritage', 'food'], averageCost: 4300, safetyScore: 89, bestVisitTime: '6–8 PM', imageUrl: 'https://images.unsplash.com/photo-1545158535-c3f7168c28b6?auto=format&fit=crop&w=900&q=80' },
  { name: 'Puducherry', city: 'Puducherry', state: 'Puducherry', description: 'French quarters, beaches and slow travel.', latitude: 11.9416, longitude: 79.8083, tags: ['beach', 'food', 'wellness'], averageCost: 5600, safetyScore: 90, bestVisitTime: '7–11 AM', imageUrl: 'https://images.unsplash.com/photo-1519491153415-29697440a11d?auto=format&fit=crop&w=900&q=80' },
  { name: 'Ooty', city: 'Ooty', state: 'Tamil Nadu', description: 'Tea gardens, mountain railways and cool weather.', latitude: 11.4064, longitude: 76.6932, tags: ['nature', 'mountains', 'wellness'], averageCost: 5100, safetyScore: 88, bestVisitTime: '7–11 AM', imageUrl: 'https://images.unsplash.com/photo-1569608381531-0d86c0d5bedc?auto=format&fit=crop&w=900&q=80' },
  { name: 'Port Blair', city: 'Port Blair', state: 'Andaman and Nicobar Islands', description: 'Island beaches, marine life and coastal history.', latitude: 11.6234, longitude: 92.7259, tags: ['island', 'beach', 'adventure'], averageCost: 10500, safetyScore: 85, bestVisitTime: '8–11 AM', imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=900&q=80' },
  { name: 'Darjeeling', city: 'Darjeeling', state: 'West Bengal', description: 'Tea estates, mountain views and heritage railways.', latitude: 27.041, longitude: 88.2663, tags: ['mountains', 'tea', 'heritage'], averageCost: 6200, safetyScore: 84, bestVisitTime: '5–8 AM', imageUrl: 'https://images.unsplash.com/photo-1569443245105-44cb91041ea9?auto=format&fit=crop&w=900&q=80' },
  { name: 'Kolkata', city: 'Kolkata', state: 'West Bengal', description: 'Colonial landmarks, literature and Bengali cuisine.', latitude: 22.5726, longitude: 88.3639, tags: ['city', 'culture', 'food'], averageCost: 4100, safetyScore: 80, bestVisitTime: '9 AM–6 PM', imageUrl: 'https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=900&q=80' },
  { name: 'Puri', city: 'Puri', state: 'Odisha', description: 'Temple heritage, beaches and coastal culture.', latitude: 19.8135, longitude: 85.8312, tags: ['culture', 'beach', 'food'], averageCost: 4000, safetyScore: 82, bestVisitTime: '5:30–9 AM', imageUrl: 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?auto=format&fit=crop&w=900&q=80' },
  { name: 'Kaziranga', city: 'Golaghat', state: 'Assam', description: 'Wildlife, wetlands and the one-horned rhino.', latitude: 26.5775, longitude: 93.1712, tags: ['wildlife', 'nature', 'adventure'], averageCost: 7200, safetyScore: 87, bestVisitTime: '6–10 AM', imageUrl: 'https://images.unsplash.com/photo-1456926631375-92c8ce872def?auto=format&fit=crop&w=900&q=80' },
  { name: 'Gangtok', city: 'Gangtok', state: 'Sikkim', description: 'Himalayan capital with monasteries and clean air.', latitude: 27.3389, longitude: 88.6065, tags: ['mountains', 'nature', 'culture'], averageCost: 6600, safetyScore: 88, bestVisitTime: '8 AM–5 PM', imageUrl: 'https://images.unsplash.com/photo-1605647540924-852290f6b0d5?auto=format&fit=crop&w=900&q=80' },
  { name: 'Shillong', city: 'Shillong', state: 'Meghalaya', description: 'Waterfalls, pine forests and living music.', latitude: 25.5788, longitude: 91.8933, tags: ['nature', 'music', 'adventure'], averageCost: 5900, safetyScore: 89, bestVisitTime: '8 AM–5 PM', imageUrl: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80' }
];

const GUIDES = [
  { name: 'Arjun Mehta', email: 'arjun@yatrasetu.in', licence: 'TG-2026-884', region: 'Rajasthan', rate: 2400, rating: 4.9, totalTrips: 328, bio: 'Heritage specialist across Udaipur, Jaipur and Jaisalmer.', languages: ['English', 'Hindi', 'French'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': true, '2026-10-16': true, '2026-10-17': true } },
  { name: 'Lakshmi Nair', email: 'lakshmi@yatrasetu.in', licence: 'TG-2026-812', region: 'Kerala', rate: 2100, rating: 4.8, totalTrips: 264, bio: 'Kerala backwaters, cuisine and coastal culture.', languages: ['English', 'Malayalam', 'Hindi'], availability: { '2026-10-13': true, '2026-10-14': false, '2026-10-15': true, '2026-10-16': true } },
  { name: 'Rahul Desai', email: 'rahul@yatrasetu.in', licence: 'TG-2026-903', region: 'Goa', rate: 2600, rating: 4.7, totalTrips: 195, bio: 'Goa beaches, Portuguese quarters and seafood trails.', languages: ['English', 'Konkani', 'Hindi'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': false } },
  { name: 'Meena Iyer', email: 'meena@yatrasetu.in', licence: 'TG-2026-771', region: 'Tamil Nadu', rate: 2000, rating: 4.9, totalTrips: 410, bio: 'Temples, hill-station tea estates and Ooty trails.', languages: ['English', 'Tamil', 'Hindi'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': true, '2026-10-16': true } },
  { name: 'Vikram Singh', email: 'vikram@yatrasetu.in', licence: 'TG-2026-845', region: 'Uttar Pradesh', rate: 1900, rating: 4.6, totalTrips: 302, bio: 'Varanasi ghats, Agra heritage and Delhi history.', languages: ['English', 'Hindi'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': false, '2026-10-15': true } },
  { name: 'Tenzin Dorje', email: 'tenzin@yatrasetu.in', licence: 'TG-2026-919', region: 'Sikkim', rate: 2800, rating: 4.9, totalTrips: 148, bio: 'High-altitude Ladakh and Sikkim monastery routes.', languages: ['English', 'Hindi', 'Tibetan'], availability: { '2026-10-13': true, '2026-10-14': true, '2026-10-15': true, '2026-10-16': true } },
  { name: 'Ananya Das', email: 'ananya@yatrasetu.in', licence: 'TG-2026-756', region: 'West Bengal', rate: 2200, rating: 4.7, totalTrips: 233, bio: 'Kolkata heritage walks and Darjeeling tea trails.', languages: ['English', 'Bengali', 'Hindi'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': true } },
  { name: 'Kiran Jadhav', email: 'kiran@yatrasetu.in', licence: 'TG-2026-890', region: 'Maharashtra', rate: 2500, rating: 4.6, totalTrips: 177, bio: 'Mumbai landmarks, coastal drives and street food.', languages: ['English', 'Marathi', 'Hindi'], availability: { '2026-10-12': false, '2026-10-13': true, '2026-10-14': true, '2026-10-15': true, '2026-10-16': true } },
  { name: 'Suresh Kumar', email: 'suresh@yatrasetu.in', licence: 'TG-2026-802', region: 'Karnataka', rate: 2000, rating: 4.8, totalTrips: 289, bio: 'Hampi ruins and Mysuru palaces by day.', languages: ['Kannada', 'English', 'Hindi'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': true } },
  { name: 'Aditi Rawat', email: 'aditi@yatrasetu.in', licence: 'TG-2026-937', region: 'Uttarakhand', rate: 2300, rating: 4.8, totalTrips: 204, bio: 'Rishikesh wellness and river adventures.', languages: ['English', 'Hindi'], availability: { '2026-10-13': true, '2026-10-14': true, '2026-10-15': false, '2026-10-16': true } },
  { name: 'Nimesh Prajapati', email: 'nimesh@yatrasetu.in', licence: 'TG-2026-798', region: 'Meghalaya', rate: 2400, rating: 4.7, totalTrips: 168, bio: 'Shillong music, waterfalls and living-root bridges.', languages: ['English', 'Khasi', 'Hindi'], availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true } }
];

const CABS = [
  { driver: 'Priya Sharma', registration: 'RJ14-YS-2026', permit: 'RTO-RJ-VERIFY-221', rate: 18.5, capacity: 4, rating: 4.8, region: 'Rajasthan', availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true, '2026-10-15': true, '2026-10-16': true } },
  { driver: 'Mohammed Ali', registration: 'KA01-YS-3317', permit: 'RTO-KA-VERIFY-118', rate: 17, capacity: 4, rating: 4.7, region: 'Karnataka', availability: { '2026-10-12': true, '2026-10-13': true, '2026-10-14': true } },
  { driver: 'Farhan Khan', registration: 'UP32-YS-2204', permit: 'RTO-UP-VERIFY-099', rate: 15.5, capacity: 4, rating: 4.6, region: 'Uttar Pradesh', availability: { '2026-10-12': true, '2026-10-13': true } },
  { driver: 'Jose Mathew', registration: 'KL01-YS-8890', permit: 'RTO-KL-VERIFY-140', rate: 19, capacity: 4, rating: 4.9, region: 'Kerala', availability: { '2026-10-13': true, '2026-10-14': true, '2026-10-15': true } },
  { driver: 'Ritu Verma', registration: 'GA01-YS-6145', permit: 'RTO-GA-VERIFY-077', rate: 21, capacity: 4, rating: 4.8, region: 'Goa', availability: { '2026-10-12': true, '2026-10-13': true } }
];

const CROWD_REPORTS = [
  { spot: 'Udaipur', levels: [3, 3, 4, 3, 3] }, { spot: 'Jaipur', levels: [4, 3, 4, 4, 3] }, { spot: 'Goa', levels: [4, 4, 5, 4, 4] },
  { spot: 'Varanasi', levels: [5, 4, 5, 5, 4] }, { spot: 'Varkala', levels: [2, 2, 3, 2, 3] }, { spot: 'Agra', levels: [5, 5, 4, 5, 4] },
  { spot: 'Manali', levels: [2, 2, 2, 3, 2] }, { spot: 'Delhi', levels: [4, 4, 5, 4, 4] }, { spot: 'Puducherry', levels: [3, 2, 3, 3, 3] },
  { spot: 'Mumbai', levels: [4, 4, 4, 5, 4] }, { spot: 'Ooty', levels: [3, 3, 3, 2, 3] }, { spot: 'Darjeeling', levels: [3, 3, 2, 3, 3] },
  { spot: 'Munnar', levels: [2, 2, 2, 3, 2] }, { spot: 'Kaziranga', levels: [2, 2, 3, 2, 2] }
];

async function upsertDemoUser() {
  await prisma.user.upsert({
    where: { email: 'admin@yatrasetu.in' },
    update: { role: 'ADMIN' },
    create: { name: 'YatraSetu Admin', email: 'admin@yatrasetu.in', role: 'ADMIN' }
  });
}

async function seedSpots() {
  for (const s of SPOTS) {
    await prisma.touristSpot.upsert({ where: { name: s.name }, update: {}, create: s });
  }
}

async function seedCrowdReports() {
  for (const entry of CROWD_REPORTS) {
    const spot = await prisma.touristSpot.findUnique({ where: { name: entry.spot } });
    if (!spot) continue;
    for (const level of entry.levels) {
      await prisma.crowdReport.create({ data: { spotId: spot.id, level, source: 'tourist' } });
    }
  }
}

async function seedGuides() {
  for (const g of GUIDES) {
    const user = await prisma.user.upsert({
      where: { email: g.email },
      update: { role: 'GUIDE' },
      create: { name: g.name, email: g.email, role: 'GUIDE' }
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
  const traveller = await prisma.user.upsert({
    where: { email: 'traveller@example.com' },
    update: {
      preferences: {
        interests: ['culture', 'food', 'heritage'],
        budget: 20000,
        travelStyle: 'culture–coastal mix',
        foodPreferences: ['local thali', 'street food'],
        pace: 'balanced',
        startDate: new Date('2026-10-12'),
        endDate: new Date('2026-10-16')
      }
    },
    create: {
      name: 'Demo Traveller',
      email: 'traveller@example.com',
      preferences: { interests: ['culture', 'food', 'heritage'], budget: 20000, travelStyle: 'culture–coastal mix', foodPreferences: ['local thali', 'street food'], pace: 'balanced', startDate: new Date('2026-10-12'), endDate: new Date('2026-10-16') }
    }
  });
  const spot = await prisma.touristSpot.findUnique({ where: { name: 'Udaipur' } });
  const guide = await prisma.guideProfile.findFirst({ where: { email: undefined }, include: { user: true } });

  const arjun = await prisma.user.findUnique({ where: { email: 'arjun@yatrasetu.in' } });
  const arjunProfile = await prisma.guideProfile.findUnique({ where: { userId: arjun.id } });
  if (!spot || !arjunProfile) return;
  await prisma.liveLocation.upsert({ where: { guideId: arjunProfile.id }, update: { latitude: 26.9124, longitude: 75.7873 }, create: { guideId: arjunProfile.id, latitude: 26.9124, longitude: 75.7873 } });

  const existing = await prisma.booking.findFirst({ where: { touristId: traveller.id, spotId: spot.id } });
  if (existing) return;

  const roadmap = [
    { day: 1, dayTitle: 'Arrival & Udaipur orientation', slots: [{ time: '8:00 AM', activity: 'Guided sightseeing with Arjun Mehta', mode: 'Walk', spend: 900 }, { time: '12:00 PM', activity: 'Lunch break', mode: 'Rest', spend: 600 }, { time: '3:00 PM', activity: 'City Palace complex', mode: 'Vehicle', spend: 800 }, { time: '6:30 PM', activity: 'Lake Pichola cruise', mode: 'Boat', spend: 1100 }, { time: '8:00 PM', activity: 'Local dinner', mode: 'Walk', spend: 700 }] }
  ];
  await prisma.booking.create({
    data: {
      touristId: traveller.id,
      spotId: spot.id,
      guideId: arjunProfile.id,
      cabId: (await prisma.cabProfile.findFirst({ where: { region: 'Rajasthan' } })).id,
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
  await seedCrowdReports();
  await seedGuides();
  await seedCabs();
  await seedDemoBooking();
  console.log('Seed complete: admin, demo traveller, guides, cabs and destinations ready.');
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });