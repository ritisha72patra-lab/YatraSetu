# Panthan — API + Expo React Native app

_(formerly YatraSetu)_

Node.js + Express REST API, PostgreSQL + Prisma, Python crowd service (Starlette + msgspec + scikit-learn), and an **Expo React Native frontend in `./mobile`** (the old HTML dashboard is removed; the API is now API-only).

## Run on any system

1. Install **Node.js 22** (see `.nvmrc`; Node 20.19+ works, 24 not recommended for Expo 57), **PostgreSQL 15+** (or a Neon URL), and optionally **Python 3.10+**.
2. Copy `.env.example` to `.env`; set `DATABASE_URL`, `JWT_SECRET`, `QR_SECRET`. Add `GEMINI_API_KEY`, `OPENWEATHER_API_KEY`, `WAQI_API_TOKEN` to go live (all optional — graceful fallbacks included). Leave `RAZORPAY_*` empty for mock checkout.
3. One-command setup: `npm run setup` (backend install + DB push + seed deps + mobile install + `expo install --fix`). Or step by step:
   Backend: `npm install`, `npx prisma generate`, `npx prisma db push`, `npm run prisma:seed`, `npm run dev` → `http://localhost:4000/health`.
4. Crowd model: `cd prediction-service`, `pip install -r requirements.txt`, `python train.py`, `uvicorn main:app --port 8001`.
5. Mobile: `cd mobile`, `npm install`, `npx expo start --lan`, scan with Expo Go (see `mobile/README.md` for LAN-IP setup). Check health with `npx expo-doctor` (21/21 expected).

Catalogue: **3 featured places** — Jaipur (Historical), Goa (Beach), Manali (Hill Station) — each with **popular hotels, best prices, Book now + Pay** (`/api/hotels/*` → `/api/payments/*`).

Demo logins: `admin@yatrasetu.in` / `DemoPass123!`, `traveller@example.com` / `DemoPass123!`.

## API flow (all 10 requested features)

| # | Feature | Endpoint |
| --- | --- | --- |
| — | Register / login / Firebase bridge | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/firebase { idToken }` |
| 5 | Discover + personalised by type | `GET /api/spots?type=beach\|hill station&maxCost=&minSafety=`, `GET /api/spots/types`, `GET /api/spots/personalised?interests=beach,heritage&budget=`, `GET /api/spots/featured/list` (top 3) |
| — | Hotels: popular stays + best prices + Book Now | `GET /api/hotels?spotId=`, `GET /api/hotels/featured`, `GET /api/hotels/:id/price-compare?nights=2`, `POST /api/hotels/book` → standard `/api/payments/*` checkout |
| 2 | Smart day-wise plan (crowd/AQI/weather/safety) | `POST /api/trips/plan` → `roadmap[]` with per-day signals + reasons |
| 1 | Book Now + payments (mock → Razorpay-ready) | `POST /api/payments/create { bookingId }`, `POST /api/payments/confirm { paymentId }` |
| 9 | Minimum-price proof | `quote` inside plan + `GET /api/spots/:id/price-compare?days=3` |
| 4 | Signed QR (print + camera scan) | `GET /api/verify/guide/:id/qr`, `POST /api/verify/scan-payload { qrText, bookingId?, chargedAmount? }` |
| 3 | Overcharge / scam alerts | `scam` object in every scan (+ `GET /api/verify/history/mine`) |
| 6 | Feedback wall | `POST /api/feedback`, `GET /api/feedback?spotId=`, `GET /api/feedback/summary?spotId=`, `GET /api/feedback/mine`, `PUT/DELETE /api/feedback/:id` |
| 7 | Firebase auth (hardened) | JWT + Firebase ID-token accepted everywhere; throttled login; FCM token stored |
| 8 | Crowd prediction (sklearn) | `GET /api/spots/:id/crowd-prediction?date=` → Python RF model (history, weekend, holiday/festival, weather, temp, AQI, dow, month) |
| 10 | Optimised validation | Prediction service uses Starlette + msgspec (no pydantic) |
| — | SOS / safety | `POST /api/safety/alerts`, `GET /api/safety/alerts/mine`, `GET /api/safety/helplines` |

Authenticated endpoints: `Authorization: Bearer <token>` (Panthan JWT **or** Firebase ID token).

## Firebase Google Sign-In setup

The mobile app supports "Continue with Google" via the Firebase client SDK. To enable it:

1. **Firebase Console** → your project → **Authentication → Sign-in method** → enable **Google**.
2. **Firebase Console** → **Project settings → Your apps → Web app** → copy the config object → set it as `FIREBASE_WEB_CONFIG_JSON` in the backend `.env` (one line, e.g. `{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}`).
3. **Firebase Console** → **Project settings → Service accounts → Generate new private key** → set the downloaded JSON as `FIREBASE_SERVICE_ACCOUNT_JSON` in the backend `.env`.
4. **Google Cloud Console** (same project) → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**. Add authorized redirect URI: `https://auth.expo.io/@<your-expo-username>/panthan`. Copy the client ID into `mobile/.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
5. Restart the backend and `npx expo start --lan` in `mobile/`.

The backend's existing `/api/auth/firebase` bridge (unchanged) turns any valid Firebase ID token into a standard Panthan JWT, so no backend auth logic changes were needed — only the mobile client now performs a real Google sign-in instead of requiring a manually pasted token.

## After pulling

Run `npm run prisma:migrate` then `npm run prisma:seed` (adds `Payment`, scam columns, `Feedback.spotId`). Prediction service: `pip install -r requirements.txt && python train.py`.
