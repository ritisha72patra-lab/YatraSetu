require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const auth = require('./middleware/auth');
const routes = require('./routes');
const path = require('path');

const app = express();
const prisma = new PrismaClient();
app.set('prisma', prisma);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://www.gstatic.com', 'https://apis.google.com'], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'", 'https:', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com'], workerSrc: ["'self'", 'blob:'], frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://*.google.com'] } } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, '..')));
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'yatrasetu-api' }));
app.use('/api/auth', routes.auth);
app.use('/api/spots', routes.spots);
app.use('/api/ai', routes.ai);
app.use('/api/trips', auth, routes.trips);
app.use('/api/verify', auth, routes.verify);
app.use('/api/admin', auth, routes.admin);
app.use('/api/location', auth, routes.location);
app.use('/api/requests', auth, routes.requests);
app.use('/api/safety', auth, routes.safety);
app.use('/api/feedback', auth, routes.feedback);
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
app.listen(port, () => console.log(`YatraSetu API listening on http://localhost:${port}`));
