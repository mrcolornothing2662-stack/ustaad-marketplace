================================================================================
USTAAD — FRONTEND PROTOTYPE (customer.html + worker.html)
Two-sided home-services marketplace · India
Version 1.0 · November 2026 · Frontend-only deliverable
================================================================================

1. WHAT THIS IS
--------------------------------------------------------------------------------
Ustaad is a marketplace where customers choose their own professional (ustaad)
and ustaads set their own prices. There is NO platform commission and NO
booking fee anywhere in the product.

This package is a complete, interactive FRONTEND PROTOTYPE built with plain
HTML5 + CSS3 + vanilla JavaScript. No backend, no database, no API keys, no
build step. Every button works. All data lives in your browser's localStorage.

Files in this package:

    customer.html      Complete customer application (discovery -> booking ->
                       tracking -> chat -> completion proof -> signature ->
                       review -> profile).
    worker.html        Complete worker (ustaad) application (registration ->
                       dashboard -> services & pricing -> requests -> jobs ->
                       job-start OTP -> completion upload -> earnings ->
                       reviews -> profile).
    README.txt         This file.
    screenshots/       35 screenshots of the main screens (mobile 390x844 and
                       desktop 1440x900).

Both HTML files are fully self-contained and open directly in a browser.


2. HOW TO RUN
--------------------------------------------------------------------------------
Option A (simplest)
    Double-click customer.html. That's it. Works in Chrome, Edge, Firefox and
    Safari, online or offline (fonts fall back to system fonts offline).

Option B (recommended for testing both sides together)
    1. Put customer.html and worker.html in the SAME folder (they already are).
    2. Open customer.html in one browser TAB and worker.html in a SECOND TAB
       of the same browser.
    3. Both tabs share the same demo data through localStorage and stay in
       sync automatically (about once a second). Actions in one tab appear in
       the other tab without manual refreshing.

Option C (local web server, most reliable sync)
    Windows:   python -m http.server 8080     (then open http://localhost:8080/customer.html)
    macOS/Linux: python3 -m http.server 8080
    Serving over http:// also makes the cross-tab sync bullet-proof in every
    browser (some browsers restrict localStorage sharing between file:// tabs).

Note on file:// mode
    - Chrome / Edge: both tabs share localStorage and sync correctly.
    - Firefox: works when both files are in the same folder.
    - If your browser blocks the sync, use Option C, or use the built-in
      DEMO MODE (section 5) which lets you simulate the other side inside a
      single app.


3. DEMO CREDENTIALS (SIMULATED)
--------------------------------------------------------------------------------
Customer login
    Phone number : any valid 10-digit Indian mobile starting with 6-9
                   (the demo persona is 98765 43210 -> lands on "Aarav Sharma")
    OTP          : shown on the screen in a "Demo OTP" banner. No SMS is sent.
    Name         : asked once after OTP for new numbers.

Worker login
    "Continue as demo ustaad" -> Suresh Yadav (Electrician, Mohali). This is
    the quickest way in and matches all the seeded sample jobs.
    OR "Register as new ustaad" -> 3-step wizard (identity -> demo OTP ->
    profession & your own prices). Newly registered ustaads appear in the
    CUSTOMER app automatically and start unverified (demo approval button
    provided on the dashboard).

Reset everything
    Profile -> "Reset prototype data" (in both apps). This restores the
    original sample data.


4. 10-MINUTE DEMO WALKTHROUGH (the full booking lifecycle)
--------------------------------------------------------------------------------
Recommended: Option B (two tabs side by side).

CUSTOMER TAB
    1. Choose language (English / हिंदी) -> Continue -> enter phone -> OTP.
    2. Home: search "fan", open categories, tap a top-rated ustaad.
    3. Worker profile: see ustaad-set prices, work photos, reviews.
       Tap "Book this ustaad".
    4. Booking flow: pick date + time slot -> address + problem description
       (+ optional photos) -> review the transparent price breakdown
       (Platform fee ₹0, Booking fee ₹0) -> Send request.

WORKER TAB
    5. Log in as the SAME ustaad you booked (e.g. Suresh Yadav).
       The new request appears under Requests with full details.
    6. Either Accept / Reject, or tap "Propose new price" and send a revised
       price with a reason.

CUSTOMER TAB
    7. A notification arrives. Open the booking: either the new price banner
       (Approve / Decline) or "Request accepted!".
    8. Tap "Show job-start OTP" — a 6-digit code appears. Share it only when
       work actually starts (this is the customer's control point).

WORKER TAB
    9. Open the accepted job -> "Start job — enter OTP" -> type the code shown
       in the customer tab. Wrong code is rejected. Work status becomes
       "in progress" on both sides.
   10. When done: "Work done? Upload proof" -> add 1-4 photos (camera or
       gallery, images are compressed and stay on the device) + completion
       note -> "Submit for approval".
       IMPORTANT: the ustaad can NEVER mark the job complete themselves.

CUSTOMER TAB
   11. The booking shows "Work submitted for your approval". Open "View
       completion proof": photos, ustaad's note, amount payable. Then either
       "Report a problem" or "Approve & sign".
   12. Draw your signature on the canvas (touch or mouse), confirm. The
       booking becomes Completed with the signature + date/time stored.
   13. Leave a star rating + written review (+ optional photos). The review
       is linked to this completed booking and instantly appears on the
       ustaad's profile and in the worker app.

WORKER TAB
   14. Dashboard/Earnings/My Jobs update automatically: earnings (no
       commission deducted), job history, the new review, rating average.

Every status is also pre-seeded so you can view each state immediately:
requested, price proposed, accepted, in progress, awaiting approval,
completed (signed + reviewed), rejected and cancelled — see My Bookings ->
All (customer) and My Jobs -> tabs (worker).

Chat: customer and worker tabs exchange messages in real time. Image
attachments work. In demo mode the other side "replies" after ~2 seconds.


5. DEMO MODE (testing one app alone)
--------------------------------------------------------------------------------
Both apps have a Demo mode (Profile -> toggle, or the sparkle button in the
header). It adds "Demo controls" that simulate the OTHER side, clearly marked
as simulated:

    Customer app simulates the ustaad:   accept / propose price / decline /
                                         enter job-start OTP / submit
                                         completion photos / chat replies.
    Worker app simulates the customer:   send a new request / approve your
                                         price / cancel / show the job-start
                                         OTP / sign & approve completion /
                                         chat replies.

This satisfies single-app testing when opening two tabs is not possible.


6. FEATURES CHECKLIST
--------------------------------------------------------------------------------
CUSTOMER APP
  [x] OTP onboarding simulation (demo OTP banner, resend timer, edit number,
      invalid-OTP error state, name capture for new users)
  [x] English + हिंदी everywhere, switchable mid-session without reload
  [x] Home: hero, search with live suggestions, 10 categories, popular
      services, top-rated, near you, recently viewed, how-it-works,
      no-platform-fee banner
  [x] Explore: search, category chips, filters (city, max price, min rating,
      min experience, availability, verified) and 5 sort orders, loading
      skeletons, empty state
  [x] Worker profiles: verification badge, languages, areas, experience,
      ustaad-set service prices, portfolio, rating breakdown, reviews
  [x] Customer-selected booking: service, date, 4 time slots, saved/new
      address, description, photos, transparent ₹0 fee breakdown
  [x] Booking tracking with full timeline; cancel; reject reason
  [x] Revised-price approval (customer must approve; never automatic)
  [x] Job-start OTP reveal (customer owns the code)
  [x] Chat with booking context, image attachments, unread badges
  [x] Completion proof viewing (photos, note) + report-a-problem flow
  [x] Digital signature pad (mouse + touch), clear, date/time, stored locally
  [x] Reviews only after completed bookings (stars, text, photos)
  [x] Profile: addresses, favourites, history, language, notifications pref,
      help FAQ, terms, what's-simulated, reset, logout

WORKER APP
  [x] Registration simulation (3 steps + demo OTP + own service prices)
  [x] Dashboard: greeting, online/offline availability toggle, verification
      status, today's requests / upcoming / active / awaiting-approval stats,
      earnings summary, rating, quick actions, recent activity
  [x] Services & independent pricing: add/edit/delete services, per-service
      price + availability, minimum visit charge, inspection fee, extra
      charges (the platform never changes a price)
  [x] Incoming requests with customer details, note, location, photos, price
  [x] Accept / Reject (with reason) / Propose revised price / Message
  [x] Job-start OTP entry (6 boxes, wrong-OTP error, work cannot start
      without it)
  [x] Active job management, chat with customer
  [x] Completion evidence upload (multi-photo, previews, remove, note) ->
      submitted FOR customer approval (worker cannot self-complete)
  [x] Earnings: total / this month / today / awaiting approval, job history,
      "no commission" messaging
  [x] Reviews screen (read-only for workers) with distribution
  [x] Profile: edit details, portfolio add/remove, language, demo toggle,
      what's-simulated, reset, logout

SHARED / TECHNICAL
  [x] Both files work independently; shared localStorage with automatic
      cross-tab sync (storage event + polling + sequence numbers)
  [x] All statuses translated (EN/HI), all buttons functional, 44px+ touch
      targets, keyboard-focusable controls, no horizontal overflow at 360px+
  [x] Mobile-first layouts with responsive desktop (sidebar navigation,
      multi-column grids, wide dashboards)
  [x] No IDs/UUIDs/JSON shown anywhere in the UI; Indian names, ₹ prices,
      cities (Chandigarh, Mohali, Zirakpur, Panchkula, Delhi, Jaipur)
  [x] Mock data: 16 ustaads, 10 categories, 34 service listings, 15 reviews,
      12 sample bookings covering every status, sample chats & notifications
  [x] Loading, empty, error, success, disabled and confirmation states


7. WHAT IS SIMULATED (clearly marked in the UI)
--------------------------------------------------------------------------------
    OTP / verification      no SMS is sent; the code is displayed on screen
    Chat & notifications    stored locally; "replies" only in demo mode
    Photos                  compressed and kept on your device only
    Digital signature       drawn locally, stored as an image in localStorage
    Payments                not processed; worker collects payment directly
    Document verification   represented; approval is a demo button
    Everything else         fully working: search, filters, booking, statuses,
                            proposals, OTP flow, completion approval, reviews

The prototype never pretends that real SMS, real-time servers or identity
verification happened. A "PROTOTYPE" badge and "What's simulated?" screens are
built into both apps.


8. FOR THE BACKEND INTEGRATION DEVELOPER
--------------------------------------------------------------------------------
All persistence goes through clearly named mock functions in each file
(search for "mock"): they are the intended integration seam. Replace their
bodies with real API calls; the UI code does not touch localStorage directly
except through these functions and persist().

    Customer side                     Worker side
    -------------------------------   --------------------------------
    mockSendLoginOTP(phone)           mockRegisterWorker(payload)
    mockVerifyOTP(code, expected)     mockAcceptBooking(id)
    mockCreateBooking(payload)        mockRejectBooking(id, reason)
    mockCancelBooking(id, reason)     mockProposePrice(id, price, note)
    mockApprovePrice(id)              mockVerifyJobOTP(id, code)
    mockDeclinePrice(id)              mockSubmitCompletion(id, photos, note)
    mockReportIssue(id, text)         mockSendMessage(threadKey, text, img)
    mockResumeFromIssue(id)
    mockSubmitReview(id, rating, ...)
    mockSendMessage(threadKey, ...)

Shared state object S (localStorage key "ustaad_prototype_v1") holds: workers,
catalog, reviews, bookings (with timeline/proposal/completion/signature/
review), chats, notifications, favourites, customer profile, sessions.
Booking status machine: requested -> (proposed ->) accepted -> inprogress ->
completion -> completed, with rejected / cancelled / issue branches.


9. KNOWN LIMITATIONS
--------------------------------------------------------------------------------
- Cross-tab sync depends on the browser allowing shared localStorage for the
  pages (see section 2). In the worst case use the local-server option or
  demo mode.
- localStorage capacity (~5 MB) limits the number of uploaded photos; images
  are auto-compressed (max 900px, JPEG q72) to fit. Reset data if storage
  fills up.
- The signature is a drawing, not a legally binding digital signature.
- Location, notifications and "call" actions are visual only; no GPS, no
  telephony.
- Seeded demo bookings are shared by all logins on the device (single demo
  persona "Aarav Sharma").
- Dates are generated relative to first launch so the demo always looks fresh;
  they do not advance by themselves afterwards.

================================================================================
Ustaad · Your home, in trusted hands. · आपका घर, भरोसेमंद हाथों में।
Prototype delivered for backend integration by the Ustaad frontend team.
================================================================================
