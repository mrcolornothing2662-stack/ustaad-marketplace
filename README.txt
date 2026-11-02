================================================================================
USTAAD MARKETPLACE — FULL-STACK FRONTEND & BACKEND INTEGRATION GUIDE
================================================================================

Welcome to Ustaad, an Indian two-sided home-services marketplace connecting
customers directly with independent trade professionals.

CORE BUSINESS PRINCIPLES:
  1. Customers select workers themselves (no automated assignment).
  2. Workers independently set and control their service prices.
  3. No platform commission (0% cut).
  4. No platform booking fee.
  5. Transparent direct payment records (Cash & UPI).
  6. Customers retain sole authority over job completion approval via digital signature.

--------------------------------------------------------------------------------
1. DELIVERABLES SUMMARY
--------------------------------------------------------------------------------

  * customer.html         - Complete Customer Web Application
  * worker.html           - Complete Worker Web Portal
  * FRONTEND_API_MAPPING.md - Comprehensive mapping of frontend UI to backend endpoints
  * INTEGRATION_REPORT.md - Integration verification, testing results, security controls
  * README.txt            - This setup and operations guide

Both customer.html and worker.html are standalone, zero-build HTML5/CSS3/Vanilla JS
applications that connect directly to the existing Ustaad Node.js/TypeScript backend API.

--------------------------------------------------------------------------------
2. PREREQUISITES & SYSTEM REQUIREMENTS
--------------------------------------------------------------------------------

  * Node.js v20+ or v22+
  * PostgreSQL 16+ (or Docker Compose)
  * Redis 7+
  * Python 3.12+ (for AI sentiment microservice)
  * Any modern web browser (Chrome, Firefox, Safari, Edge)

--------------------------------------------------------------------------------
3. QUICK START — RUNNING THE PLATFORM
--------------------------------------------------------------------------------

Step 1: Start the Backend API
-----------------------------
Open a terminal in the project root:

  cd backend
  npm install
  npx prisma generate
  npx prisma migrate deploy
  npm run prisma:seed
  npm run build
  npm start

The backend API will start at: http://localhost:4000/api/v1
OpenAPI Swagger Documentation: http://localhost:4000/api-docs

Step 2: Start the AI Service (Optional, for sentiment analysis)
-------------------------------------------------------------
Open a separate terminal:

  cd ai-service
  python3 -m pip install -r requirements.txt
  python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

Step 3: Open the Frontend Applications
--------------------------------------
You can serve the HTML files using any static file server or simply open them in your browser:

Option A — Using Python static server:
  python3 -m http.server 3000

Then open in your browser:
  * Customer App:  http://localhost:3000/customer.html
  * Worker Portal: http://localhost:3000/worker.html

Option B — Directly opening files:
  Open `customer.html` and `worker.html` in separate browser windows or tabs.

--------------------------------------------------------------------------------
4. SEEDED DEMO TEST ACCOUNTS
--------------------------------------------------------------------------------

All seeded development accounts share the password: UstaadDev123!

CUSTOMER DEMO ACCOUNTS (Use in customer.html):
  * Email: customer1@ustaad.local   Password: UstaadDev123!
  * Email: customer2@ustaad.local   Password: UstaadDev123!

WORKER DEMO ACCOUNTS (Use in worker.html):
  * Email: provider1@ustaad.local   Password: UstaadDev123! (Electrician)
  * Email: provider2@ustaad.local   Password: UstaadDev123! (Plumber)
  * Email: provider3@ustaad.local   Password: UstaadDev123! (Carpenter)

Both applications include "Demo Testing Accounts" quick-fill buttons in their login
modals, allowing one-click sign-in without typing credentials!

--------------------------------------------------------------------------------
5. STEP-BY-STEP END-TO-END WORKFLOW TEST
--------------------------------------------------------------------------------

Step A: Worker Preparation (worker.html)
  1. Open worker.html and sign in using "Electrician (P1)".
  2. Notice the KPI dashboard: Total Earnings (0% Commission), Completed Jobs, Rating.
  3. Ensure the top "Online" toggle switch is ON.
  4. Click "🏛️ DigiLocker Verification" to verify government identity via OAuth PKCE.
  5. Click "🏷️ Manage Services & Rates" to set your custom starting rates (e.g. ₹499).

Step B: Customer Discovery & Booking (customer.html)
  1. Open customer.html in another window or incognito tab.
  2. Sign in using "Demo Customer 1".
  3. Go to "Find Workers" tab. Filter by "Electrician" in "Ludhiana".
  4. See "Verified Electrician" with 4.9★ rating, DigiLocker verified badge, and rate.
  5. Click "Hire This Ustaad →".
  6. Select service, appointment time, enter address and problem description.
  7. Submit booking. Notice confirmation: "100% of payment goes directly to worker".

Step C: Worker Lead Acceptance & Pricing (worker.html)
  1. Switch to worker.html -> Click "Requests" tab.
  2. The incoming booking request appears with client details and problem text.
  3. Click "Accept Job" (or click "Revise Price" to propose custom pricing).
  4. Once accepted, booking moves to confirmed status.

Step D: Real-Time Chat & Doorstep Start OTP
  1. In customer.html, open "Messages" tab or click "💬 Open Chat" on the booking.
  2. In worker.html, open "Messages" tab.
  3. Exchange real-time messages via Socket.IO.
  4. In worker.html ("My Work" tab), click "🚗 I Am On The Way".
  5. In customer.html, click "🔑 Generate Start OTP" -> reveals 6-digit start code.
  6. In worker.html, click "🔑 Enter Customer Start OTP" -> enter code -> job starts (IN PROGRESS).

Step E: Work Execution & Photo Evidence
  1. In worker.html, click "📷 Upload Before Photo" and select an image.
  2. Perform work.
  3. Click "📷 Upload After Photo" and select completion image.
  4. Click "✓ Submit Completion" -> Enter final amount (e.g. ₹550) and notes.

Step F: Customer Digital Signature & Direct Settlement
  1. In customer.html ("Bookings" tab), status changes to "AWAITING CUSTOMER CONFIRMATION".
  2. Click "✍️ Inspect & Sign Approval".
  3. View worker's before and after photos.
  4. Draw your digital signature on the HTML5 canvas pad.
  5. Click "Approve & Sign Completion" -> Booking completes!
  6. Click "💵 Record Payment" -> Record Cash or UPI payment.
  7. In worker.html, click "💰 Confirm Payment Receipt" -> Status marks SETTLED.
  8. In customer.html, submit a 5★ review in English, Hindi, or Punjabi!

--------------------------------------------------------------------------------
6. RUNNING AUTOMATED BACKEND TESTS
--------------------------------------------------------------------------------

To run the complete automated test suite:

  cd backend
  npm test

Results: 41 automated tests pass across unit, domain, and platform completion suites.

================================================================================
EOF

