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

