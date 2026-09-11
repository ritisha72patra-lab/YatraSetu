# YātraSetu backend

Node.js + Express REST API, PostgreSQL + Prisma ORM, and an optional Python FastAPI crowd-prediction service. It implements the architecture supplied: tourist discovery, budget planning, verified guide QR checks, user feedback/crowd reports, and safety/SOS alerts.

## Run locally

1. Install **Node.js 20+**, **PostgreSQL 15+**, and optionally **Python 3.11+** for the prediction service.
2. Create a database called `yatrasetu` in PostgreSQL.
3. Copy `.env.example` to `.env`, then set `DATABASE_URL` and `FIREBASE_SERVICE_ACCOUNT_JSON` (see **Firebase Authentication setup** below).
4. In PowerShell run `npm.cmd install`, `npm.cmd run prisma:generate`, `npm.cmd run prisma:migrate`, then `npm.cmd run prisma:seed`.
5. Start the API with `npm.cmd run dev`. Health check: `http://localhost:4000/health`.
6. Optional prediction service: `cd prediction-service`, `py -m pip install -r requirements.txt`, then `uvicorn main:app --port 8001`.

The browser dashboard is served at `http://localhost:4000/`. Sign in / create an account from the ♧ button (top right) — credentials are handled entirely by **Firebase Authentication**. For the seeded `admin@yatrasetu.in` account, create a Firebase user with that same email (see below) and it will automatically link to the seeded admin profile on first sign-in.

## Firebase Authentication setup

This app uses the **Firebase JS SDK** in the browser (`index.html`) for sign-up/sign-in/sign-out, and the **Firebase Admin SDK** on the server (`src/firebase/admin.js`) to verify the ID token on every authenticated API request. The backend never sees or stores a password.

1. **Create a Firebase project** — [console.firebase.google.com](https://console.firebase.google.com) → *Add project*.
2. **Register a Web app** — Project settings (gear icon) → *Your apps* → *Add app* → Web (`</>`). No app nickname requirements matter here since this is a plain web app, not iOS/Android.
3. **Copy the client config** into `index.html`'s `firebaseConfig` object (search for `PASTE_API_KEY_HERE`): `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. These are public client identifiers, not secrets — safe to ship in the browser.
4. **Enable Email/Password sign-in** — Build → Authentication → *Get started* → Sign-in method tab → enable **Email/Password**.
5. **Generate a service account key** (server-side, keep this secret) — Project settings → *Service accounts* → *Generate new private key*. Paste the entire downloaded JSON as a single-line string into `FIREBASE_SERVICE_ACCOUNT_JSON` in your `.env`. Never commit this file or expose it to the browser.

## API flow

| Feature | Endpoint |
| --- | --- |
| Sync app profile after Firebase sign-up | `POST /api/auth/sync` (Bearer Firebase ID token, body `{ "name": "..." }`) |
| Current user profile | `GET /api/auth/me` |
| Discover destinations | `GET /api/spots` |
| Budget itinerary | `POST /api/trips/plan` |
| My trips | `GET /api/trips/mine` |
| Generate guide QR | `GET /api/verify/guide/:guideId/qr` |
| Verify on the spot | `POST /api/verify/scan` |
| SOS / safety alert | `POST /api/safety/alerts` |
| Ratings & crowd confirmation | `POST /api/feedback` |
| Explainable crowd forecast | `GET /api/spots/:id/crowd-prediction?date=2026-10-12&weatherRisk=.2` |
| Service QR code | `GET /api/verify/guide/:id/qr` or `GET /api/verify/cab/:id/qr` |
| Scan guide or cab | `POST /api/verify/scan` with `{ "service":"GUIDE"|"CAB", "id":"...", "bookingId":"..." }` |
| Admin dashboard data | Admin-only `GET /api/admin/overview` |
| Review registry records | Admin-only `PUT /api/admin/guides/:id/review`, `PUT /api/admin/cabs/:id/review` |
| Configure official prices | Admin-only `PUT /api/admin/guides/:id/pricing`, `PUT /api/admin/cabs/:id/pricing` |
| Resolve alerts and inspect live location | Admin-only `PUT /api/admin/alerts/:id/resolve`, plus `GET /api/location/guide/:guideId` |

Authenticated endpoints require `Authorization: Bearer <Firebase ID token>` (obtained client-side via `firebase.auth().currentUser.getIdToken()`).

## Remaining integrations for a production demo

- **Firebase Cloud Messaging**: send the SOS, AQI, weather, and crowd alerts to travellers/admins.
- **AQI and weather provider**: add server-side API keys (for example OpenWeather + WAQI), cache readings, and never expose keys to the frontend.
- **Maps**: use MapLibre with OpenStreetMap tiles; add a routing provider for live guide routes.
- **Verified guide registry**: this SIH demo uses an admin-approved YatraSetu registry. It must not be presented as government verification without formal registry access or an MoU/data-sharing agreement.
- **Admin dashboard**: the static dashboard is served at `/`, stores only recent guide coordinates in `LiveLocation`, polls them every 30 seconds, and exposes review, pricing, QR history, SOS, and crowd-report moderation.
- **Security/deployment**: use HTTPS, production CORS allow-list, rate limits, audit logs, encrypted secrets, database backups, consent and retention policies for live location data.

The included prediction endpoint is explainable by design: each result returns the numerical estimate and the factors that changed it. It aggregates recent traveller confirmations, day type, holiday/festival input, and weather risk. Replace its heuristic with a trained scikit-learn model after collecting validated crowd reports.

## New migration after verification/map additions

After pulling these changes, run `npm.cmd run prisma:migrate` and then `npm.cmd run prisma:seed`. This creates the cab registry, QR scan audit logs, and live-guide-location tables. The frontend uses MapLibre's demo style for a presentation-ready live-route map; replace that style URL with a MapTiler or self-hosted style before production.
