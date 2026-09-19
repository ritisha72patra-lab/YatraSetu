# Panthan mobile (Expo React Native)

_(formerly YatraSetu)_

Tourist app. API-only backend in `../src`. Works on any system via Expo Go — no Android Studio / Xcode needed.

## Prereqs

- Node.js 20+
- Phone with **Expo Go** app, same Wi-Fi as your PC

## Run

1. Start backend (repo root): `npm install`, set `.env`, `npx prisma generate`, `npx prisma db push`, `npm run prisma:seed`, `npm run dev`.
2. Optional crowd model: `cd prediction-service`, `pip install -r requirements.txt`, `python train.py`, `uvicorn main:app --port 8001`.
3. Start app: `cd mobile`, `npm install`, `npx expo start --lan` (or `npm run start:lan`).
4. In Expo Go, scan the QR. **Physical device?** the app already defaults to `http://172.29.163.91:4000` (this PC's Wi-Fi IP, set in `app.json` → `extra.apiUrl`). If your IP changes, restart with `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:4000 npx expo start --lan`. Android emulator ignores this and uses `10.0.2.2` automatically.
5. Health check: `cd mobile && npx expo-doctor` should show 21/21. If versions drift after editing deps, run `npx expo install --fix`.

## What the app shows

- **Top 3 places** (`/api/spots/featured/list`): Jaipur · Historical, Goa · Beach, Manali · Hill Station — each with a type badge and cheapest-hotel hint.
- **Spot page**: crowd forecast, lowest-price promise, **popular hotels with best prices** (`/api/hotels?spotId=`), each with **Book now** → hold (`POST /api/hotels/book`) → checkout (`POST /api/payments/create` → `/confirm`, mock or Razorpay) → CONFIRMED.
- My trips shows the booked hotel, nights and totals.

## Features mapped

- Auth: email/password + Firebase ID-token bridge (`/api/auth/*`), same account for both.
- Discover: `GET /api/spots?type=beach|hill station|…`, `GET /api/spots/personalised`, AI strip via `/api/ai/recommend`.
- Spot: crowd forecast (`crowd-prediction`, sklearn model), `price-compare` (lowest-price proof), reviews (`/api/feedback`).
- Planner: `POST /api/trips/plan` returns signal-aware day plan (crowd/AQI/weather/safety) + quote.
- Book Now: `POST /api/payments/create` → mock checkout (or Razorpay if keys set) → `POST /api/payments/confirm` → trip CONFIRMED.
- Scan QR: live camera (`expo-camera`) → `POST /api/verify/scan-payload` with optional quoted amount → green/amber/red scam + overcharge card.
- Feedback: submit on spot page, track under Profile → Feedback stack screen.
- Safety: SOS + helplines + history.

## Firebase on mobile

No `google-services.json` needed for the default flow: sign in with email/password, or paste a Firebase ID token on the login screen (get it from Firebase web SDK `user.getIdToken()`). To enable one-tap Google, add `EXPO_PUBLIC_FIREBASE_*` and wire `expo-auth-session` — the `/api/auth/firebase` bridge already accepts it.
# Panthan mobile (Expo React Native)

Tourist app. API-only backend in `../src`. Works on any system via Expo Go — no Android Studio / Xcode needed.

## Prereqs

- Node.js 20+
- Phone with **Expo Go** app, same Wi-Fi as your PC

## Run

1. Start backend (repo root): `npm install`, set `.env`, `npx prisma generate`, `npx prisma db push`, `npm run prisma:seed`, `npm run dev`.
2. Optional crowd model: `cd prediction-service`, `pip install -r requirements.txt`, `python train.py`, `uvicorn main:app --port 8001`.
3. Start app: `cd mobile`, `npm install`, `npx expo start --lan` (or `npm run start:lan`).
4. In Expo Go, scan the QR. **Physical device?** the app already defaults to `http://172.29.163.91:4000` (this PC's Wi-Fi IP, set in `app.json` → `extra.apiUrl`). If your IP changes, restart with `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:4000 npx expo start --lan`. Android emulator ignores this and uses `10.0.2.2` automatically.
5. Health check: `cd mobile && npx expo-doctor` should show 21/21. If versions drift after editing deps, run `npx expo install --fix`.

## What the app shows

- **Top 3 places** (`/api/spots/featured/list`): Jaipur · Historical, Goa · Beach, Manali · Hill Station — each with a type badge and cheapest-hotel hint.
- **Spot page**: crowd forecast, lowest-price promise, **popular hotels with best prices** (`/api/hotels?spotId=`), each with **Book now** → hold (`POST /api/hotels/book`) → checkout (`POST /api/payments/create` → `/confirm`, mock or Razorpay) → CONFIRMED.
- My trips shows the booked hotel, nights and totals.

## Features mapped

- Auth: email/password + Firebase ID-token bridge (`/api/auth/*`), same account for both.
- Discover: `GET /api/spots?type=beach|hill station|…`, `GET /api/spots/personalised`, AI strip via `/api/ai/recommend`.
- Spot: crowd forecast (`crowd-prediction`, sklearn model), `price-compare` (lowest-price proof), reviews (`/api/feedback`).
- Planner: `POST /api/trips/plan` returns signal-aware day plan (crowd/AQI/weather/safety) + quote.
- Book Now: `POST /api/payments/create` → mock checkout (or Razorpay if keys set) → `POST /api/payments/confirm` → trip CONFIRMED.
- Scan QR: live camera (`expo-camera`) → `POST /api/verify/scan-payload` with optional quoted amount → green/amber/red scam + overcharge card.
- Feedback: submit on spot page, track under Profile → Feedback stack screen.
- Safety: SOS + helplines + history.

## Firebase on mobile

No `google-services.json` needed for the default flow: sign in with email/password, or paste a Firebase ID token on the login screen (get it from Firebase web SDK `user.getIdToken()`). To enable one-tap Google, add `EXPO_PUBLIC_FIREBASE_*` and wire `expo-auth-session` — the `/api/auth/firebase` bridge already accepts it.
