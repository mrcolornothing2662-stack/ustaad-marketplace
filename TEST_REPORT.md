# Verification report

Revision date: 2 November 2026.

## Checks performed

| Check | Result |
|---|---|
| Backend TypeScript type checking | Passed |
| Backend production compilation | Passed |
| Backend automated suites | 19 tests passed across 3 suites, including 9 database-backed workflow scenarios |
| Both database migrations on a fresh test database | Passed with Prisma migrate deploy |
| Customer Flutter analysis | Passed with no issues |
| Provider Flutter analysis | Passed with no issues |
| Customer widget tests | 2 passed |
| Provider widget tests | 2 passed |
| Customer compiled web build | Passed |
| Provider compiled web build | Passed |
| Python AI-service tests | 3 passed |
| Compiled backend startup and /ready | Passed with database and real Redis 7.0.15 |
| Running FastAPI /health | Passed |
| Customer interface → running backend | Sign-in and empty booking-list loading passed in Flutter's test runner |
| Provider interface → running backend | Sign-in and empty booking-list loading passed in Flutter's test runner |

Flutter 3.32.8 / Dart 3.8.1, Node.js 24.22.1 and Python 3.12 were used in this environment. Database integration and migration checks used an embedded PostgreSQL engine exposed over the PostgreSQL wire protocol through PGlite. The deployment configuration targets PostgreSQL 16; a PostgreSQL 16 Docker installation was not available here. No database test double was used for the API workflow checks. The Socket.IO implementation was reviewed but did not receive an independent socket-transport integration test.

The full database-backed sequence covers registration without password/hash disclosure; phone challenge consumption; provider profile, services, hours and verification approval; ranked search without exact location exposure; valid booking creation; past-time, service-radius and overlap rejection; booking ownership; customer/provider transition permissions; booking chat authorization; expired and consumed job-start OTPs; provider final amount; customer completion; review validation and duplicate prevention; trust score inputs; password recovery and token reuse; complaints; notification ownership; refresh rotation; suspended-account access rejection. Private problem-photo upload and listing ownership are also checked.

UI tests exercise role-specific registration forms and the required appointment selection. The live-interface tests use secure-storage test values but make real HTTP requests to the compiled backend. They do not prove the production platform's secure-storage implementation or every screen's behaviour on a physical device.

## What was changed

- Replaced placeholder mobile navigation forms with operational customer/provider screens calling the shared API.
- Added Android, iOS and web project scaffolding, dependency locks and platform configuration.
- Fixed registration field selection, safe authentication responses, refresh identity payloads/rotation, account-status checks and the compiled server start path.
- Replaced fixed phone challenges with random expiring one-use challenges with attempt limits; added password recovery with hashed one-use tokens.
- Added customer profiles/addresses, provider services/pricing, working hours/listing state, booking lists/details, notifications, complaints and administrative resolution.
- Added booking input validation, provider eligibility, service/radius/availability checks and serialized one-hour overlap checks.
- Enforced job-start OTP expiry, attempt count and atomic consumption; prevented final-amount updates outside the provider's finishing step.
- Removed exact coordinates from public provider responses; replaced several fixed ranking/trust inputs with recorded activity.
- Made review creation, booking status and trust updates transactional.
- Restricted verification callbacks to the correct provider/request/challenge; added private certificate and problem-photo storage, validation and authenticated retrieval.
- Made verification decisions transactional and removed stale approval/badges where appropriate.
- Aligned Socket.IO authorization with HTTP booking-chat rules and checked account standing on socket actions.
- Updated API documentation, Postman requests, run instructions and development Compose configuration.

## Boundaries and remaining deployment work

This is a verified **development implementation**. Live SMS delivery, production email recovery, real DigiLocker identity verification and FCM/device push are not connected. They require actual provider accounts, credentials and integration work. Development identity consent is labelled as simulated; production simulation endpoints are disabled. In-app notifications work, but they are not device push messages.

Native Android/iOS builds, release signing, physical-device use, hosted HTTPS, Docker startup and a public-production security/load assessment were not executed. Browser automation could not launch because this environment disallows the Unix sockets Chromium requires; the equivalent sign-in/list interface smoke checks ran successfully through Flutter's runner instead. Both browser artifacts compiled successfully and are included.

The AI service uses the existing deterministic explainable scoring design. If sentiment analysis is unavailable, reviews preserve neutral pending sentiment; automatic retry is not implemented. File retention cleanup is an explicit administrator operation and must be scheduled for hosting. Native notification delivery, malware scanning, production storage/backup and real map/geocoding setup are deployment work. See START_HERE.md for concrete details.

Availability is interpreted in Asia/Kolkata and bookings reserve one hour because the original data model has no duration field. Payment remains external. Booking status and chat refresh use polling; no live GPS tracking is claimed.

Passing tests reduces risk; it is not a guarantee of zero defects. Re-test on the actual target devices and service accounts before a live launch.

## Reproduce live-interface checks

Start the backend, PostgreSQL, Redis and AI service, and seed demonstration accounts. In each app directory:

```bash
flutter test test/live_backend_test.dart --dart-define=RUN_LIVE_TESTS=true --dart-define=API_BASE_URL=http://127.0.0.1:4000/api/v1
```

The live-interface test is intentionally skipped during an ordinary `flutter test` run unless RUN_LIVE_TESTS is enabled. Backend database scenarios similarly require RUN_DB_TESTS=1 and an isolated seeded test database.
