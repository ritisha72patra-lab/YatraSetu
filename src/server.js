require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const auth = require('./middleware/auth');
const routes = require('./routes');

const app = express();
const prisma = new PrismaClient();
app.set('prisma', prisma);
// API-only backend (React Native / Expo frontend). No HTML served.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.get('/', (_, res) => res.json({ service: 'yatrasetu-api', status: 'ok', frontend: 'Expo React Native app in ./mobile', docs: 'See README.md' }));
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'yatrasetu-api' }));
app.use('/api/auth', routes.auth);
app.use('/api/spots', routes.spots);
// Hotels: public reads, auth writes. GETs skip auth so Discover works logged-out.
app.use('/api/hotels', (req, res, next) => (req.method === 'GET' ? next() : auth(req, res, next)), routes.hotels);
app.use('/api/ai', routes.ai);
// Feedback wall is public-readable; writes need auth. Mount GETs before auth.
app.use('/api/payments', auth, routes.payments);
app.use('/api/trips', auth, routes.trips);
app.use('/api/verify', auth, routes.verify);
app.use('/api/admin', auth, routes.admin);
app.use('/api/location', auth, routes.location);
app.use('/api/requests', auth, routes.requests);
app.use('/api/safety', auth, routes.safety);
app.use('/api/feedback', (req, res, next) => (req.method === 'GET' && !req.path.startsWith('/mine') ? next() : auth(req, res, next)), routes.feedback);
app.use((err, _, res, __) => {
  console.error(err);
  // Zod validation -> tell the user which field is missing/invalid
  if (err?.name === 'ZodError') {
    const issues = (err.issues || []).map(i => `${i.path?.join('.') || 'field'}: ${i.message}`).join('; ');
    return res.status(400).json({
      error: issues ? `Missing or invalid data — ${issues}.` : 'Missing or invalid data. Check the required fields and retry.',
      code: 'VALIDATION_ERROR',
    });
  }
  // Prisma: unique violation (duplicate email etc.)
  if (err?.code === 'P2002') {
    return res.status(err.status || 409).json({ error: err.message || 'This record already exists (duplicate value).', code: 'DUPLICATE' });
  }
  // Prisma: table missing -> migrations not applied
  if (err?.code === 'P2021' || /does not exist in the current database/i.test(err?.message || '')) {
    return res.status(503).json({
      error: 'Account/trip database is not set up yet (missing tables). Run `npx prisma migrate deploy` and `npm run prisma:seed` on the server, then retry.',
      code: 'DB_NOT_MIGRATED',
    });
  }
  // Prisma: cannot reach database server
  if (err?.code === 'P1001' || /Can't reach database server/i.test(err?.message || '')) {
    return res.status(503).json({
      error: 'Cannot reach the database. Check DATABASE_URL in .env and that Postgres/Neon is running, then retry.',
      code: 'DB_UNREACHABLE',
    });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Requested item was not found.', code: 'NOT_FOUND' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code });
});
const port = Number(process.env.PORT || 4000);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('replace-')) {
  console.warn('[warn] JWT_SECRET is missing/placeholder — set a long random value in .env before production.');
}
app.listen(port, '0.0.0.0', () => console.log(`YatraSetu API listening on http://0.0.0.0:${port}`));
