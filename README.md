# Ustaad Marketplace

Two independent Flutter apps (Customer and Provider), an Express/TypeScript/PostgreSQL backend, Redis, and a FastAPI scoring service.

Start with **[START_HERE.md](START_HERE.md)** for installation, demonstration accounts, the preserved booking workflow, integration boundaries and verification commands. See **[TEST_REPORT.md](TEST_REPORT.md)** for the checks actually performed on this revision.

Both apps now call the backend instead of opening placeholder screens. Authentication, provider setup and verification review, search, bookings, expiring start OTP, chat, customer completion, reviews, trust history, saved addresses, in-app notifications, complaints and private file uploads have working development paths.

Live SMS, email, DigiLocker, device push, production hosting and native device validation need deployment-specific setup. Payment remains outside the platform, as originally specified.
