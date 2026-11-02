# Ustaad Marketplace — corrected development project

This archive contains two independent Flutter applications, the shared TypeScript API, and the Python scoring service. The booking workflow is preserved:

PENDING → ACCEPTED → CONFIRMED → PROVIDER_ON_THE_WAY → IN_PROGRESS → AWAITING_CUSTOMER_CONFIRMATION → COMPLETED → REVIEWED.

The provider accepts, the customer confirms, the provider enters the customer's start OTP, the provider supplies the final amount, and the customer confirms completion. The existing rejection, cancellation, no-show and dispute paths remain. Payment stays outside the platform.

## Quick start with Docker Desktop

From the folder containing docker-compose.yml:

```bash
docker compose up --build -d
docker compose run --rm backend node dist/prisma/seed.js
```

Wait for the API to finish applying migrations. API: http://localhost:4000/api/v1. API documentation: http://localhost:4000/api-docs. AI health: http://localhost:8000/health. Use `docker compose logs backend` if startup fails. The Compose configuration is explicitly for local development. Docker itself was not available in the verification environment; see TEST_REPORT.md for the exact checks that ran.

## Run both apps in a browser

Flutter 3.32.8 / Dart 3.8.1 was used for verification. Run these commands in separate terminals:

```bash
cd customer_app
flutter pub get
flutter run -d chrome --web-port=8080 --dart-define=API_BASE_URL=http://localhost:4000/api/v1
```

```bash
cd ustaad_app
flutter pub get
flutter run -d chrome --web-port=8081 --dart-define=API_BASE_URL=http://localhost:4000/api/v1
```

The included `web_builds/customer` and `web_builds/provider` folders are compiled browser builds configured for http://127.0.0.1:4000/api/v1. With the backend running, serve them in separate terminals:

```bash
python -m http.server 8080 --directory web_builds/customer
python -m http.server 8081 --directory web_builds/provider
```

Open http://127.0.0.1:8080 and http://127.0.0.1:8081. Use localhost or HTTPS for secure token storage. Keep these ports, or add your frontend origins to CORS_ORIGINS in the backend configuration.

## Android and iOS

Android emulator: `flutter run -d <device-id>` uses the default API address http://10.0.2.2:4000/api/v1. Debug Android builds allow local HTTP; release builds require HTTPS. A physical device needs your computer's reachable LAN address using `--dart-define=API_BASE_URL=http://YOUR_COMPUTER_IP:4000/api/v1`, firewall access, and suitable development network settings. iOS needs macOS, Xcode, signing, and an API address reachable from that device. Native builds and physical-device behaviour were not verified here.

## Demonstration accounts

Run the seed command first. All seeded passwords are `UstaadDev123!`.

| Role | Email |
|---|---|
| Customer | customer1@ustaad.local |
| Provider | provider1@ustaad.local |
| Administrator | admin@ustaad.local |

The administrator can sign in through either app and gets the verification/complaints dashboard. Other accounts must use their matching app. The seed also creates provider2/provider3, customer2, and a pending provider. These accounts contain invented data and must never be used as real production accounts.

## Demonstrate a complete booking

1. Sign into the customer app. Search with latitude **30.9**, longitude **75.85**, and a radius of **50 km**. Choose a service and a seeded provider.
2. Request a future appointment inside the provider's working hours. Seeded providers work 09:00–18:00 Asia/Kolkata daily. The appointment picker uses the device's local timezone. Enter the complete address and problem description.
3. Sign into the matching provider account. Open My bookings and accept the request.
4. Customer: confirm the accepted booking. Both participants can now use booking chat.
5. Provider: mark “I am on the way.” Customer: generate the start OTP and share it only on arrival. Provider: enter it to start work.
6. Provider: submit the final amount and finish. Customer: confirm completion and submit a review.
7. Both apps refresh booking lists/status automatically. Chat refreshes every four seconds; notifications have a refresh control. These are status updates, not GPS location tracking.

For new providers, complete phone verification, professional profile, services/pricing, working hours, identity consent and certificate upload, then have the administrator review the requests. Finish profile/services/availability before approval. An administrator must reconsider a request if onboarding requirements were incomplete at the time of approval.

Booking time conflicts use one-hour slots because the original schema has no job-duration field. Availability is evaluated in Asia/Kolkata, the original project's initial India service region. Adjust this policy deliberately if you introduce variable-duration jobs; it is not inferred from problem text.

## Development integrations and live-service boundaries

- Phone verification creates random expiring single-use challenges with attempt limits. The code is displayed in development mode; no SMS is actually sent. Production requests fail clearly until real SMS delivery is implemented.
- DigiLocker consent is explicitly a development simulation; it never claims that a real government identity was verified. Live DigiLocker credentials, consent handling and callback integration still require the actual service setup. Production simulation endpoints are disabled.
- Password recovery uses expiring, single-use hashed tokens. Development exposes the token for local testing. Production email delivery needs a real provider integration.
- In-app notifications are persisted. Device push/FCM delivery is not configured.
- Certificate and problem-photo files use private local disk storage. The Compose volume preserves them across container restarts. Evidence expires after seven days; the administrator cleanup API removes expired evidence. Schedule that cleanup in a deployed environment. Production storage, backup/retention policy, malware scanning and delivery services require deployment-specific setup.
- Sentiment analysis uses the project's deterministic explainable implementation. If the AI service is unavailable, the review is saved with neutral pending sentiment. Automatic sentiment retry is not implemented; keep the service available during the demonstration.
- Maps/geocoding are not connected: enter address coordinates. Provider public search exposes approximate distance rather than exact coordinates.

These requirements depend on external accounts, credentials, deployment and device testing. The archive is a tested development implementation, not a certified production release or a promise that no defects exist.

## Run without Docker

Install PostgreSQL 16+, Redis 7, Node.js 22, Python 3.12 and Flutter. Create the database/role matching backend/.env.example; copy that example to backend/.env and set your secrets/URLs. Then:

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run build
npm start
```

In a separate terminal:

```bash
cd ai-service
python -m venv .venv
# Activate .venv using the command for your operating system.
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

PostgreSQL, Redis and the AI service must be reachable at their configured URLs. Never use the local Compose secrets or demonstration accounts on a public deployment.

## Re-run verification

Backend: `npm run typecheck`, `npm run build`, `npm test`. Database scenarios are opt-in: use an isolated seeded test database and set RUN_DB_TESTS=1 when running npm test. They create test users/bookings/uploads and suspend their generated test provider; do not point them at live customer data.

Each Flutter app: `flutter analyze`, `flutter test`, and `flutter build web --no-tree-shake-icons --no-web-resources-cdn --dart-define=API_BASE_URL=http://127.0.0.1:4000/api/v1`.

AI service: `python -m pytest -q`.
