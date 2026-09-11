# YātraSetu backend

Node.js + Express REST API, PostgreSQL + Prisma ORM, and an optional Python FastAPI crowd-prediction service. It implements the architecture supplied: tourist discovery, budget planning, verified guide QR checks, user feedback/crowd reports, and safety/SOS alerts.

## Run locally

1. Install **Node.js 20+**, **PostgreSQL 15+**, and optionally **Python 3.11+** for the prediction service.
2. Create a database called `yatrasetu` in PostgreSQL.
3. Copy `.env.example` to `.env`, then set `DATABASE_URL` and a strong `JWT_SECRET`. For Gemini AI recommendations, add `GEMINI_API_KEY` (from Google AI Studio) — without it the assistant uses a local heuristic over the same live signals.
4. In PowerShell run `npm.cmd install`, `npm.cmd run prisma:generate`, `npm.cmd run prisma:migrate`, then `npm.cmd run prisma:seed`.
5. Start the API with `npm.cmd run dev`. Health check: `http://localhost:4000/health`.
6. Optional prediction service: `cd prediction-service`, `py -m pip install -r requirements.txt`, then `uvicorn main:app --port 8001`.

The browser dashboard is served at `http://localhost:4000/`. Seeded demo admin credentials are `admin@yatrasetu.in` / `DemoPass123!`; log in through `POST /api/auth/login`, paste the returned token into **Admin console**, and load the control room.

## API flow

| Feature | Endpoint |
| --- | --- |
| Register / login | `POST /api/auth/register`, `POST /api/auth/login` |
| Discover destinations | `GET /api/spots` |
| Budget itinerary | `POST /api/trips/plan` |
| My trips | `GET /api/trips/mine` |
| Generate guide QR | `GET /api/verify/guide/:guideId/qr` |
| Verify on the spot | `POST /api/verify/scan` |
| SOS / safety alert | `POST /api/safety/alerts` |
| Ratings & crowd confirmation | `POST /api/feedback` |
| Explainable crowd forecast | `GET /api/spots/:id/crowd-prediction?date=2026-10-12&weatherRisk=.2` |
| AI recommendations (Gemini + live crowd/AQI/weather) | `GET /api/ai/status`, `POST /api/ai/recommend` with `{ "query": "Kerala", "interest": "beach", "mode": "recommend" }` |
| Service QR code | `GET /api/verify/guide/:id/qr` or `GET /api/verify/cab/:id/qr` |
| Scan guide or cab | `POST /api/verify/scan` with `{ "service":"GUIDE"|"CAB", "id":"...", "bookingId":"..." }` |
| Admin dashboard data | Admin-only `GET /api/admin/overview` |
| Review registry records | Admin-only `PUT /api/admin/guides/:id/review`, `PUT /api/admin/cabs/:id/review` |
| Configure official prices | Admin-only `PUT /api/admin/guides/:id/pricing`, `PUT /api/admin/cabs/:id/pricing` |
| Resolve alerts and inspect live location | Admin-only `PUT /api/admin/alerts/:id/resolve`, plus `GET /api/location/guide/:guideId` |

Authenticated endpoints require `Authorization: Bearer <token>`.

## Remaining integrations for a production demo

- **Firebase Authentication**: replace password login or issue Firebase ID tokens; configure Firebase Admin credentials for verification.
- **Firebase Cloud Messaging**: send the SOS, AQI, weather, and crowd alerts to travellers/admins.
- **AQI and weather provider**: add server-side API keys (for example OpenWeather + WAQI), cache readings, and never expose keys to the frontend.
- **Maps**: use MapLibre with OpenStreetMap tiles; add a routing provider for live guide routes.
- **Verified guide registry**: this SIH demo uses an admin-approved YatraSetu registry. It must not be presented as government verification without formal registry access or an MoU/data-sharing agreement.
- **Admin dashboard**: the static dashboard is served at `/`, stores only recent guide coordinates in `LiveLocation`, polls them every 30 seconds, and exposes review, pricing, QR history, SOS, and crowd-report moderation.
- **Security/deployment**: use HTTPS, production CORS allow-list, rate limits, audit logs, encrypted secrets, database backups, consent and retention policies for live location data.

The included prediction endpoint is explainable by design: each result returns the numerical estimate and the factors that changed it. It aggregates recent traveller confirmations, day type, holiday/festival input, and weather risk. Replace its heuristic with a trained scikit-learn model after collecting validated crowd reports.

## New migration after verification/map additions

After pulling these changes, run `npm.cmd run prisma:migrate` and then `npm.cmd run prisma:seed`. This creates the cab registry, QR scan audit logs, and live-guide-location tables. The frontend uses MapLibre's demo style for a presentation-ready live-route map; replace that style URL with a MapTiler or self-hosted style before production.
