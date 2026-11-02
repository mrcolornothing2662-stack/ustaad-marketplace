> Original architecture plan. For the implemented revision, supported workflows and remaining external-service setup, read [START_HERE.md](../START_HERE.md) and [TEST_REPORT.md](../TEST_REPORT.md).

# Ustaad Marketplace Architecture

## Final proposed architecture

The repository is a modular monorepo with four independently runnable applications:

- **Backend API:** Express + strict TypeScript. Routes delegate to controllers, controllers to services, and services to repositories. Only repositories access Prisma.
- **Data layer:** PostgreSQL stores durable marketplace data. Redis supports throttling, temporary OTP state, caching, and Socket.IO scaling where useful.
- **AI service:** FastAPI owns deterministic/replaceable sentiment, trust-score, and ranking implementations. The backend reaches it only through an integration client.
- **Mobile apps:** Customer and Provider apps are independent Flutter projects with their own networking, token storage, features, and routing.
- **External providers:** DigiLocker, Firebase/FCM, storage, OTP, and password reset sit behind interfaces with clearly labelled development adapters.

## Complete repository tree

```text
ustaad-marketplace/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── common/{errors,middleware,security,types,utils,validators}/
│   │   ├── config/
│   │   ├── integrations/{ai-service,digilocker,firebase,storage}/
│   │   ├── modules/{admin,auth,availability,bookings,chat,complaints,customers,notifications,provider-services,providers,reviews,search,service-categories,trust-score,users,verification}/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/
│   ├── .env.example
│   ├── jest.config.js
│   ├── package.json
│   └── tsconfig.json
├── ai-service/app/{api,config,ranking,sentiment,trust_score}/
├── ai-service/tests/
├── customer_app/lib/{config,core,features}/
├── ustaad_app/lib/{config,core,features}/
├── docs/
├── postman/
├── docker-compose.yml
└── README.md
```

Feature folders are introduced in their implementation phase. A normal backend module contains routes, controller, service, repository, Zod schema, types, and tests; tiny modules may omit a layer only when it has no responsibility to perform.

## Database relationship plan

- `User` owns authentication identity and role; it has at most one `CustomerProfile` or `ProviderProfile`.
- `RefreshToken` and `PhoneVerification` belong to `User`; only hashes and safe metadata are durable.
- `ProviderProfile` links to services through `ProviderService`, has `ProviderAvailability`, badges, verification requests, trust-score history, and bookings.
- `ServiceCategory` contains `Service`; providers offer individual services with price information.
- `VerificationRequest` owns privacy-minimized `VerificationDocumentMetadata`; temporary evidence is represented by restricted `UploadedFile` records with an expiry/deletion lifecycle.
- `Booking` connects one customer, one provider, and one service. Every allowed transition creates a `BookingStatusHistory`; a booking can have one start OTP, one conversation, and at most one review.
- `Review` preserves original text and owns a separate `ReviewSentiment`; trust recalculation writes immutable `TrustScoreHistory` entries.
- `ChatConversation` belongs to one booking and owns `ChatMessage` history. Membership is derived from the booking, not a client claim.
- `Complaint` connects a reporter and booking/provider context. Sensitive admin decisions create `AuditLog` entries.

The Phase 1 Prisma schema establishes the database connection and baseline `User` entity. Remaining normalized entities and constraints are added with their owning phases, before corresponding APIs are exposed.

## Implementation phases

1. **Foundation — implemented:** structure, Compose services, Prisma, Express, error handling, health checks, tests.
2. **Authentication and security:** registration, password hashing, JWT rotation, mock OTP, RBAC, Helmet/CORS/rate limits.
3. **Profiles and services:** customer/provider profiles, catalog, pricing, availability, and location.
4. **Verification:** privacy-safe records, mock DigiLocker, skills, admin decisions, badges, and audits.
5. **Search and ranking:** filters, Haversine distance, normalized explainable ranking.
6. **Booking workflow:** booking creation, explicit role-aware state machine, start OTP, completion, history.
7. **Reviews and trust:** eligibility, duplicate protection, FastAPI sentiment, trust score and history.
8. **Chat and notifications:** booking-only Socket.IO chat, durable messages, mock FCM adapter.
9. **Flutter apps:** separate functional Customer and Provider prototypes.
10. **Final verification:** migrations, seed data, end-to-end scenario, builds, analysis, Swagger/Postman, final docs.

## Important assumptions

- India is the initial verification context because DigiLocker and listed document types are India-specific.
- The API version prefix is `/api/v1`; operational health endpoints remain unversioned.
- Payment occurs outside the platform in the MVP, and no commission or payment ledger is implemented.
- Uploaded problem photos are provider-visible attachments only and are never sent to an image model.
- Real DigiLocker, FCM, object storage, SMS, and email credentials are unavailable during development, so safe adapters are selected through environment configuration.
- Provider exact addresses and verification evidence are private; public search returns only approved providers and derived/approximate location data.
- All scores use versioned, explainable formulas and neutral defaults for new providers.

## What Each Module Does

| Module | Responsibility |
| --- | --- |
| auth | Registration, login, logout, token rotation, password/OTP workflows; not user profiles. |
| users | Shared account data, account standing, and safe current-user views. |
| customers | Customer profile and saved service addresses. |
| providers | Professional profile and public/private provider views. |
| service-categories | Admin-managed service category and service catalog. |
| provider-services | Provider offerings, descriptions, and prices. |
| availability | Provider schedule, listing pause, radius, and service locations. |
| verification | Identity/skill requests, privacy-safe metadata, evidence lifecycle, and badges. |
| search | Normal filters, distance calculation, and explainable provider ranking orchestration. |
| bookings | Booking creation, transition state machine, job-start OTP, and status history. |
| chat | Booking-scoped conversations and message authorization. |
| reviews | Review eligibility, moderation state, original content, and sentiment job state. |
| trust-score | Explainable score orchestration, penalties, and immutable history. |
| notifications | In-app notification records and push-delivery adapters. |
| complaints | Reports, disputes, evidence references, and resolution state. |
| admin | Protected management endpoints that orchestrate domain services and audit actions. |
| integrations | Replaceable clients for DigiLocker, FCM, AI service, and secure file storage. |
| common | Cross-cutting errors, middleware, security primitives, types, validators, and small utilities. |

## 10. Additional Backend Implementation Requirements

The platform has been hardened and completed to support a production-grade marketplace operated on a **zero platform fee** model with direct worker-customer settlement.

### 10.1 Language and Personalization Infrastructure
- **Trilingual Core Support:** Native support for English (`en`), Hindi (`hi`), and Punjabi (`pa`).
- **User Preferences:** Stored per user with `PUT /api/v1/account/preferences` (`language: en|hi|pa`, `theme: light|dark|system`).
- **Notification Templates:** Comprehensive localized templates in all 3 languages for all booking and account lifecycle events (`notification.templates.ts`).
- **Unicode Preservation:** All database text columns use UTF-8; Hindi (Devanagari) and Punjabi (Gurmukhi) messages, reviews, and names are preserved verbatim without transliteration loss.
- **Multilingual Sentiment Analysis:** AI service and deterministic backend fallback support English, Hindi (Devanagari + Hinglish), and Punjabi (Gurmukhi + Romanized Punjabi).

### 10.2 Account and Profile Management
- **Profile Editing:** `PUT /api/v1/account/profile` updates name and profile details.
- **Profile Photo:** `POST /api/v1/account/profile-photo` uploads Base64 images with magic-byte verification to object storage, updating both user and provider records. Public access via `GET /api/v1/account/photo/:key`.
- **Mobile Change with OTP:** `POST /api/v1/account/change-phone/request` sends OTP to new Indian mobile (`+91...`); `POST /api/v1/account/change-phone/confirm` validates OTP and commits the change.
- **Password Change:** `PUT /api/v1/account/change-password` validates old password, sets new bcrypt hash, and revokes all existing refresh tokens.
- **Account Deletion:** `DELETE /api/v1/account` performs compliant soft-deletion (`deletedAt = now()`, status `DELETED`), revokes all sessions, and clears device push tokens.
- **Customer Favourites:** `GET /api/v1/account/favourites`, `POST /api/v1/account/favourites/:providerId`, and `DELETE /api/v1/account/favourites/:providerId`.
- **Saved Addresses:** Full CRUD via `/api/v1/account/addresses` and `PUT /api/v1/account/addresses/:id`.
- **User Blocking & Reporting:** `POST /api/v1/account/blocks`, `GET /api/v1/account/blocks`, `DELETE /api/v1/account/blocks/:userId`, and `POST /api/v1/account/reports`.

### 10.3 Worker Operations & Availability
- **Online/Offline Availability:** `PUT /api/v1/providers/online-status` toggles worker availability. Offline workers are automatically omitted from public search.
- **Leave Calendar Management:** `POST /api/v1/providers/leaves`, `GET /api/v1/providers/leaves`, `DELETE /api/v1/providers/leaves/:id`. Booking searches for appointment times falling within a leave range automatically exclude the provider.
- **Worker Dashboard:** `GET /api/v1/providers/dashboard` computes total earnings, completed jobs, average rating, acceptance/completion rates, and profile completion percentage (0–100%).
- **Incoming Leads:** `GET /api/v1/providers/leads` returns booking requests matching the worker's active services.

### 10.4 Booking Lifecycle Extensions
- **Categorized Views:** `GET /api/v1/bookings?category=...`
  - Customer categories: `upcoming`, `active`, `completed`, `cancelled`, `disputed`.
  - Worker categories: `incoming`, `accepted`, `ongoing`, `completed`, `cancelled`.
- **Rescheduling:** `POST /api/v1/bookings/:id/reschedule` proposes a new appointment time with duration/buffer validation.
- **Rebooking:** `POST /api/v1/bookings/:id/rebook` allows instant rebooking of a previous worker & service.

### 10.5 Direct Settlement Payment Records
- **Zero Platform Commission:** Ustaad never charges booking or platform commission. All payments are settled directly between customer and worker.
- **Payment Lifecycle:** `PENDING` → `REPORTED_BY_CUSTOMER` (Cash/UPI) → `CONFIRMED_BY_WORKER` → `SETTLED`.
- **Endpoints:**
  - `GET /api/v1/bookings/:bookingId/payment`: Inspect direct settlement record.
  - `POST /api/v1/bookings/:bookingId/payment/report`: Customer reports Cash or UPI payment with optional UTR.
  - `POST /api/v1/bookings/:bookingId/payment/confirm`: Worker confirms receipt; status transitions to `SETTLED`.
  - `POST /api/v1/bookings/:bookingId/payment/dispute`: Either party can dispute unsettled or mismatched amounts.

### 10.6 Chat Access Security Rules
- **Pre-Confirmation Lock:** Chat is strictly forbidden (`403 Forbidden`) while booking is `PENDING` or `ACCEPTED`.
- **Cancelled Bookings:** Historical messages remain readable; new messages are blocked.
- **Post-Completion 48-Hour Policy:** Messaging remains available for 48 hours after job completion for coordination, then automatically locks.
- **Enriched Payloads:** All messages include `sender: { id, name, role }`, `isMe`, `attachmentUrl`.
- **Read Receipts:** `POST /api/v1/chat/:bookingId/read` marks messages as read.

### 10.7 Support and Dispute Resolution
- **Localized FAQs:** `GET /api/v1/support/faqs?lang=en|hi|pa` returns public questions and answers.
- **Support Tickets:** `POST /api/v1/support/tickets`, `GET /api/v1/support/tickets`, `POST /api/v1/support/tickets/:id/messages`.
- **Admin Support:** `GET /api/v1/admin/support/tickets`, `POST /api/v1/admin/support/tickets/:id/resolve`.

## 11. Production Readiness, Infrastructure, and Security Controls

### 11.1 DigiLocker Identity Verification
- **OAuth 2.0 PKCE:** Implemented in `digilocker.provider.ts` using RFC 7636 compliant `code_verifier` and `code_challenge` (S256).
- **Aadhaar Privacy:** Full 12-digit Aadhaar numbers are never stored in the database. Only masked numbers (`XXXX-XXXX-1234`) and privacy-safe metadata are persisted.
- **Fuzzy Name Matching:** Levenshtein-based name matching normalizes honorifics (Mr., Shri, Smt.) and whitespace to verify worker identity.

### 11.2 SMS & OTP Authentication
- **Multi-Provider Architecture:** Pluggable `Fast2SmsProvider`, `Msg91SmsProvider`, and `MockSmsProvider` with automatic fallback.
- **Security Constraints:** 30-second cooldown between resends, maximum 5 attempts, 5-minute single-use expiry.

### 11.3 Cloud Object Storage
- **Unified Interface:** `StorageProvider` (`storage.provider.ts`) handles uploads, downloads, and pre-signed URLs.
- **S3 / R2 / MinIO Adapter:** S3-compatible cloud storage with AWS SigV4 request signing implemented natively using `node:crypto`.
- **Local Fallback:** Development environment automatically falls back to local disk storage (`private-uploads`).

### 11.4 Backup and Disaster Recovery
- **Automated Backup:** `backend/scripts/backup.sh` creates timestamped gzip-compressed PostgreSQL 16 dumps with 14-day retention pruning.
- **Safe Restore:** `backend/scripts/restore.sh` safely restores dumps with confirmation safeguards.


