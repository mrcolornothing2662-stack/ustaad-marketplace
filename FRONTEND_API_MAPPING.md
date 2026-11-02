# Ustaad Marketplace — Frontend to Backend API Mapping

This document provides a strict, verified mapping between every frontend feature in `customer.html` and `worker.html` and the corresponding existing endpoints in the Ustaad backend.

---

## 1. Customer Application (`customer.html`)

| Frontend Feature | Backend API Route | HTTP Method | Auth Required | Request Body / Query Params | Response & UI Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer Registration** | `/api/v1/auth/register/customer` | `POST` | None | `{ name, email, phone, password }` | Creates user, returns session tokens + user profile |
| **Phone OTP Dispatch** | `/api/v1/auth/send-phone-otp` | `POST` | None | `{ phone }` | Sends 6-digit OTP, returns `{ expiresInSeconds, developmentOtp? }` |
| **Phone OTP Verification** | `/api/v1/auth/verify-phone-otp` | `POST` | None | `{ phone, otp }` | Sets `phoneVerifiedAt`, enables verified status |
| **Customer Login** | `/api/v1/auth/login` | `POST` | None | `{ email, password }` | Validates credentials, issues JWT access & refresh tokens |
| **Token Refresh** | `/api/v1/auth/refresh` | `POST` | None | `{ refreshToken }` | Refreshes session tokens automatically |
| **Customer Logout** | `/api/v1/auth/logout` | `POST` | None | `{ refreshToken }` | Revokes active refresh token |
| **Get Current User** | `/api/v1/auth/me` | `GET` | Bearer Token | None | Populates customer profile and avatar |
| **Service Categories** | `/api/v1/categories` | `GET` | None | None | Populates home trade cards & filter dropdowns |
| **Worker Discovery Search** | `/api/v1/search` | `GET` | Optional Bearer | `latitude, longitude, distanceKm, serviceId, query, onlyOnline, sortBy` | Returns filtered, ranked providers with starting rates |
| **Worker Detail View** | `/api/v1/search/providers/:id` | `GET` | None | None | Loads bio, services, starting rates, reviews, trust score |
| **Record Worker View** | `/api/v1/search/:id/view` | `POST` | Bearer Token | None | Saves to customer's recently viewed list |
| **Recently Viewed Workers**| `/api/v1/search/recently-viewed` | `GET` | Bearer Token | None | Displays recently inspected professionals on Home |
| **Recent Searches** | `/api/v1/search/recent` | `GET` | Bearer Token | None | Displays customer recent search queries |
| **Clear Search History** | `/api/v1/search/recent` | `DELETE` | Bearer Token | None | Clears recent search query history |
| **Create Booking Request**| `/api/v1/bookings` | `POST` | Bearer (Customer) | `{ providerId, serviceId, preferredAt, estimatedDurationMinutes, bufferMinutes, addressText, latitude, longitude, problemDescription, additionalInstructions }` | Creates `PENDING` booking directly locked to selected worker |
| **Customer My Bookings** | `/api/v1/bookings` | `GET` | Bearer Token | `?category=upcoming\|active\|completed\|cancelled\|disputed` | Returns categorized customer bookings list |
| **Approve Price Proposal**| `/api/v1/bookings/:id/respond-price` | `POST` | Bearer (Customer) | `{ action: "ACCEPT" \| "REJECT" }` | Customer approves or rejects worker's revised price |
| **Confirm Appointment** | `/api/v1/bookings/:id/transition` | `POST` | Bearer (Customer) | `{ status: "CONFIRMED" }` | Transitions booking to `CONFIRMED`; unlocks chat |
| **Generate Start OTP** | `/api/v1/bookings/:id/start-otp` | `POST` | Bearer (Customer) | None | Generates single-use 6-digit OTP when worker is on the way |
| **Inspect Completion Photos**| `/api/v1/bookings/:id/photos` | `GET` | Bearer Token | None | Loads worker's `BEFORE_WORK` & `AFTER_WORK` proof photos |
| **Digital Signature Approval**| `/api/v1/bookings/:id/confirm-completion` | `POST` | Bearer (Customer) | `{ customerSignatureData, completionNote? }` | Validates SVG/PNG canvas signature & completes booking |
| **Raise Dispute** | `/api/v1/bookings/:id/transition` | `POST` | Bearer (Customer) | `{ status: "DISPUTED", completionNote }` | Moves booking to disputed state for admin resolution |
| **Record Direct Payment** | `/api/v1/bookings/:id/payment/report` | `POST` | Bearer (Customer) | `{ paymentMethod: "CASH"\|"UPI", amount, transactionReference?, notes? }` | Records customer settlement; notifies worker to confirm |
| **Submit Review** | `/api/v1/reviews` | `POST` | Bearer (Customer) | `{ bookingId, rating, text?, language? }` | Trilingual review submission with AI sentiment analysis |
| **Rebook Worker** | `/api/v1/bookings/:id/rebook` | `POST` | Bearer (Customer) | `{ preferredAt }` | Instant rebooking of same worker & service |
| **Chat Message History** | `/api/v1/chat/:bookingId/messages` | `GET` | Bearer Token | None | Loads booking-scoped messages (unlocked on CONFIRMED) |
| **Send Chat Message** | `/api/v1/chat/:bookingId/messages` | `POST` | Bearer Token | `{ body, attachmentUrl? }` | Fallback HTTP chat message dispatch |
| **Mark Chat Read** | `/api/v1/chat/:bookingId/read` | `POST` | Bearer Token | None | Read receipts update |
| **Update Preferences** | `/api/v1/account/preferences` | `PUT` | Bearer Token | `{ language: "en"\|"hi"\|"pa", theme: "light"\|"dark"\|"system" }` | Persists user language and visual theme |
| **Upload Profile Photo** | `/api/v1/account/profile-photo` | `POST` | Bearer Token | `{ mimeType, contentBase64 }` | Stores photo securely via unified StorageProvider |
| **Change Mobile Request** | `/api/v1/account/change-phone/request` | `POST` | Bearer Token | `{ newPhone }` | Dispatches OTP to new mobile |
| **Change Mobile Confirm** | `/api/v1/account/change-phone/confirm` | `POST` | Bearer Token | `{ newPhone, otp }` | Commits verified mobile change |
| **Customer Saved Addresses**| `/api/v1/account/addresses` | `GET`, `POST`, `DELETE` | Bearer (Customer) | `{ label, line1, city, state, postalCode, latitude, longitude }` | Address book CRUD |
| **Favourite Workers** | `/api/v1/account/favourites` | `GET`, `POST /:id`, `DELETE /:id` | Bearer (Customer) | None | Customer favourite professionals list |
| **Public FAQs** | `/api/v1/support/faqs` | `GET` | None | `?lang=en\|hi\|pa` | Multilingual support FAQ list |
| **Support Tickets** | `/api/v1/support/tickets` | `GET`, `POST` | Bearer Token | `{ category, subject, description }` | Customer dispute and query ticketing |
| **Delete Account** | `/api/v1/account` | `DELETE` | Bearer Token | None | Compliant soft deletion & session revocation |

---

## 2. Worker Application (`worker.html`)

| Frontend Feature | Backend API Route | HTTP Method | Auth Required | Request Body / Query Params | Response & UI Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Worker Registration** | `/api/v1/auth/register/provider` | `POST` | None | `{ name, email, phone, password }` | Registers worker with `PROFILE_INCOMPLETE` status |
| **Worker Login** | `/api/v1/auth/login` | `POST` | None | `{ email, password }` | Validates provider account, issues JWT tokens |
| **Worker Dashboard Analytics**| `/api/v1/providers/dashboard` | `GET` | Bearer (Provider) | None | Returns total earnings, completed jobs, rating, trust score, profile % |
| **Online Availability Toggle**| `/api/v1/providers/online-status` | `PUT` | Bearer (Provider) | `{ isOnline: boolean }` | Directly toggles search visibility and lead reception |
| **Incoming Leads** | `/api/v1/providers/leads` | `GET` | Bearer (Provider) | None | Displays incoming `PENDING` booking requests |
| **Accept / Decline Job** | `/api/v1/bookings/:id/transition` | `POST` | Bearer (Provider) | `{ status: "ACCEPTED" \| "REJECTED" }` | Updates booking state; notifies customer |
| **Propose Revised Price**| `/api/v1/bookings/:id/propose-price` | `POST` | Bearer (Provider) | `{ revisedPrice, reason }` | Stores revision proposal; awaits customer response |
| **Start Traveling** | `/api/v1/bookings/:id/transition` | `POST` | Bearer (Provider) | `{ status: "PROVIDER_ON_THE_WAY" }` | Alerts customer to generate Start OTP |
| **Job-Start OTP Verification**| `/api/v1/bookings/:id/transition` | `POST` | Bearer (Provider) | `{ status: "IN_PROGRESS", otp: "123456" }` | Verifies doorstep OTP against bcrypt hash |
| **Upload Work Evidence** | `/api/v1/bookings/:id/evidence` | `POST` | Bearer (Provider) | `{ category: "BEFORE_WORK"\|"AFTER_WORK", mimeType, contentBase64 }` | Uploads before/after photos with magic-byte validation |
| **Submit Completion** | `/api/v1/bookings/:id/transition` | `POST` | Bearer (Provider) | `{ status: "AWAITING_CUSTOMER_CONFIRMATION", finalAmount, completionNote }` | Submits final amount for customer digital sign-off |
| **Confirm Payment Receipt**| `/api/v1/bookings/:id/payment/confirm` | `POST` | Bearer (Provider) | None | Worker confirms receipt of Cash/UPI; marks `SETTLED` |
| **DigiLocker Auth Start** | `/api/v1/verification/digilocker/start` | `POST` | Bearer (Provider) | `{ documentType: "AADHAAR"\|..., consent: true }` | Generates PKCE verifier, challenge & official auth URL |
| **DigiLocker Callback** | `/api/v1/verification/digilocker/callback`| `POST` | Bearer (Provider) | `{ requestId, state, code }` | Exchanges code, verifies name match, masks Aadhaar |
| **Upload Trade Certificate**| `/api/v1/verification/skill` | `POST` | Bearer (Provider) | `{ documentType, mimeType, contentBase64 }` | Skill qualification upload (PDF/PNG/JPEG) |
| **Worker Profile Details** | `/api/v1/providers/me` | `GET`, `PUT` | Bearer (Provider) | `{ title, description, experienceYears, languages, city, latitude, longitude, serviceRadiusKm }` | Professional bio, trade specialization and location |
| **Custom Service Rates** | `/api/v1/account/services/:serviceId`| `PUT` | Bearer (Provider) | `{ startingPrice, description, active }` | Worker sets independent pricing with 0% platform fee |
| **Working Hours Schedule**| `/api/v1/account/availability` | `PUT` | Bearer (Provider) | `[{ weekday: 0-6, startTime: "09:00", endTime: "18:00", enabled: true }]` | Weekly working days and hours |
| **Listing Pause Toggle** | `/api/v1/account/listing` | `PUT` | Bearer (Provider) | `{ paused: boolean }` | Temporarily hides worker from search |
| **Schedule Leave / Holiday**| `/api/v1/providers/leaves` | `GET`, `POST` | Bearer (Provider) | `{ startDate, endDate, reason }` | Prevents appointment booking during leave range |
| **Cancel Leave** | `/api/v1/providers/leaves/:id` | `DELETE` | Bearer (Provider) | None | Removes scheduled holiday |
| **Real-time Chat** | Socket.IO `chat:send` / `chat:message` | Socket.IO | Bearer (Token) | `{ bookingId, body }` | Direct real-time communication with client |

---

## 3. Real-Time Socket.IO Protocol Mapping

| Event Name | Direction | Payload Schema | Notes |
| :--- | :--- | :--- | :--- |
| `connection` | Client → Server | Handshake auth: `{ token: accessToken }` | Validates JWT and active user status |
| `booking:join`| Client → Server | `bookingId: string` | Joins room `booking:<bookingId>` if user is confirmed participant |
| `chat:send` | Client → Server | `{ bookingId, body, attachmentUrl? }` | Emits message to room; enforces 48h completion policy |
| `chat:message`| Server → Client | `{ id, conversationId, body, attachmentUrl, createdAt, senderId, sender: { id, name, role }, bookingId }` | Broadcast to all room participants with enriched sender metadata |
| `chat:error` | Server → Client | `{ message: string }` | Emitted when message fails validation or authorization |
