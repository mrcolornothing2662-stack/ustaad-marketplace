# 🚀 Ustaad Marketplace — Quickstart Guide (All Platforms)

Welcome to **Ustaad** — an Indian two-sided home-services marketplace connecting customers directly with independent service professionals without platform commission, booking fees, or automated worker assignment.

---

## ⚡ 1-Minute Launch (Choose your Operating System)

### 🪟 If you are on Windows:
- **With Docker (Easiest)**: Double-click **`start-docker-windows.bat`**
- **Without Docker (Native)**: Double-click **`start-windows.bat`**
- *Detailed Windows instructions:* Read **[WINDOWS_SETUP.md](WINDOWS_SETUP.md)**.

### 🍎 If you are on macOS:
- **With Docker**: `docker compose up --build -d`
- **Without Docker (Native)**: Run `./start-mac-linux.sh`

### 🐧 If you are on Linux:
- **With Docker**: `docker compose up --build -d`
- **Without Docker (Native)**: Run `./start-mac-linux.sh`

---

## 🌐 Application URLs

Once running, access the services in your browser:

| Application | Address |
| :--- | :--- |
| **Customer Web Application** | [http://localhost:3000/customer.html](http://localhost:3000/customer.html) |
| **Worker Web Portal** | [http://localhost:3000/worker.html](http://localhost:3000/worker.html) |
| **Backend REST API & OpenAPI Docs** | [http://localhost:4000/api-docs](http://localhost:4000/api-docs) |
| **AI Microservice Swagger Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) |

---

## 🔑 Pre-Seeded Test Accounts

| Role | Email | Password | Details |
| :--- | :--- | :--- | :--- |
| **Worker 1 (Carpenter)** | `provider1@ustaad.local` | `UstaadDev123!` | ₹350/hr, DigiLocker verified |
| **Worker 2 (Electrician)** | `provider2@ustaad.local` | `UstaadDev123!` | ₹400/hr, DigiLocker verified |
| **Worker 3 (Plumber)** | `provider3@ustaad.local` | `UstaadDev123!` | ₹300/hr, DigiLocker verified |
| **Customer 1** | `customer1@ustaad.local` | `UstaadDev123!` | Sector 62 Noida address |
| **Customer 2** | `customer2@ustaad.local` | `UstaadDev123!` | Connaught Place Delhi address |
| **Admin** | `admin@ustaad.local` | `UstaadDev123!` | System disputes & metrics |
| **SMS OTP Login** | Any 10-digit mobile number | `123456` | Mock OTP enabled in dev |

---

## 📁 Repository Structure Overview

- `customer.html`: Full customer marketplace web application (discovery, locked booking, trilingual, signature pad, direct UPI/Cash settlement).
- `worker.html`: Full worker portal (availability toggle, hourly/fixed rate cards, DigiLocker KYC, start OTP verification, photo evidence).
- `backend/`: Node.js, Express, TypeScript, PostgreSQL (Prisma), Redis, Socket.IO.
- `ai-service/`: Python FastAPI service for review sentiment analysis & Bayesian worker trust scores.
- `docker-compose.yml`: Multi-container configuration for PostgreSQL, Redis, AI service, Backend, and Frontend.
- `start-windows.bat`: 1-click native launcher for Windows.
- `start-docker-windows.bat`: 1-click Docker launcher for Windows.
- `start-mac-linux.sh`: 1-click native launcher for macOS / Linux.
- `WINDOWS_SETUP.md`: Full documentation tailored specifically for Windows users.
- `FRONTEND_API_MAPPING.md`: 36 UI interactions mapped to exact REST & Socket.IO endpoints.
- `INTEGRATION_REPORT.md`: Comprehensive end-to-end integration verification report.

