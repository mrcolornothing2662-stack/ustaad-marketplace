# Ustaad Marketplace — Windows Setup & Execution Guide

This document provides a comprehensive, step-by-step walkthrough for setting up and running the **Ustaad Marketplace** on a Windows machine (Windows 10 / Windows 11).

---

## ⚡ Quickest Way: 1-Click Launchers

We have provided automated scripts so you can get up and running with a single double-click.

### Method A: Docker Desktop (Recommended — Zero Dependency Hassle)
If you have **Docker Desktop** installed on your Windows machine:
1. Open Docker Desktop and verify it is running.
2. Double-click **`start-docker-windows.bat`** (or open Command Prompt and run `start-docker-windows.bat`).
3. It will automatically build and start:
   - PostgreSQL 16 (Port `5432`)
   - Redis 7 (Port `6379`)
   - FastAPI AI Service (Port `8000`)
   - Express & TypeScript Backend API (Port `4000`)
   - Static Web Server (Port `3000`)
4. Your browser will automatically open:
   - **Customer Portal**: [http://localhost:3000/customer.html](http://localhost:3000/customer.html)
   - **Worker Portal**: [http://localhost:3000/worker.html](http://localhost:3000/worker.html)
   - **Interactive API Docs**: [http://localhost:4000/api-docs](http://localhost:4000/api-docs)

---

### Method B: Native Windows (Without Docker)
If you prefer running services natively on Windows:
1. Double-click **`start-windows.bat`**.
2. The script checks for Node.js and Python, creates a virtual environment, installs packages, runs database migrations, seeds test users, builds TypeScript, and launches all 3 servers in dedicated command windows.
3. Your browser will automatically open the portals.

---

## 🛠️ Step-by-Step Manual Setup (Windows)

If you prefer to run each step manually in PowerShell or Windows Command Prompt:

### 1. Prerequisites Checklist
Ensure the following software is installed on Windows:
- **Node.js 18+ or 20+ LTS**: Download from [nodejs.org](https://nodejs.org/) (ensure "Add to PATH" is checked).
- **Python 3.9+ or 3.11+**: Download from [python.org](https://www.python.org/) (⚠️ **Crucial**: Check the box **"Add Python to PATH"** on the first installer screen).
- **PostgreSQL 14+ or 16+**: Download from [postgresql.org](https://www.postgresql.org/download/windows/).
  - Default user: `ustaad`, password: `ustaad_dev_password`, database: `ustaad`.
- **Redis for Windows** or Docker Redis:
  - If using Docker: `docker run -d -p 6379:6379 redis:7-alpine`
  - Or Memurai for Windows: [memurai.com](https://www.memurai.com/)

---

### 2. Configure Environment (`.env`)
In the root project directory, verify or create the `.env` file (a pre-configured `.env` is already included):
```env
PORT=4000
DATABASE_URL=postgresql://ustaad:ustaad_dev_password@localhost:5432/ustaad?schema=public
REDIS_URL=redis://localhost:6379
AI_SERVICE_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:3000,http://localhost:8080,http://127.0.0.1:3000
JWT_ACCESS_SECRET=dev-access-secret-change-me-for-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-me-for-production
MOCK_OTP=123456
```

---

### 3. Step 1: Start PostgreSQL & Redis
- Ensure your local PostgreSQL service is running on port `5432`.
- Ensure Redis is running on port `6379`.

---

### 4. Step 2: Set Up & Start the AI Service (FastAPI)
Open a new PowerShell or Command Prompt terminal in the project directory:

```powershell
# Navigate into ai-service directory
cd ai-service

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# In Command Prompt:
.venv\Scripts\activate.bat
# Or in PowerShell:
.venv\Scripts\Activate.ps1

# Install required packages
pip install -r requirements.txt

# Start AI Service on port 8000
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
✅ Verify: Open [http://localhost:8000/docs](http://localhost:8000/docs) in your browser.

---

### 5. Step 3: Set Up & Start the Backend (Node.js & Express)
Open a second PowerShell or Command Prompt terminal:

```powershell
# Navigate into backend directory
cd backend

# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Apply Database Migrations
npx prisma migrate deploy

# Seed Database with sample providers, categories, and customers
npm run prisma:seed

# Build TypeScript to JavaScript
npm run build

# Start the Backend Server on port 4000
npm start
```
✅ Verify: Open [http://localhost:4000/api-docs](http://localhost:4000/api-docs) in your browser.

---

### 6. Step 4: Serve the Frontend
Open a third PowerShell or Command Prompt terminal in the project root:

```powershell
# Start local static server on port 3000
python -m http.server 3000
```
*(Or use `npx serve . -l 3000` or VS Code Live Server)*

---

### 7. Step 5: Open the Applications
Open your web browser (Chrome, Edge, Firefox, Brave) and visit:

| Application | Local URL | Description |
| :--- | :--- | :--- |
| **Customer App** | [http://localhost:3000/customer.html](http://localhost:3000/customer.html) | Search categories, compare worker pricing, book with lock, sign off on jobs |
| **Worker Portal** | [http://localhost:3000/worker.html](http://localhost:3000/worker.html) | Online/offline toggle, set hourly/fixed rates, DigiLocker KYC, start OTP |
| **Backend API Docs**| [http://localhost:4000/api-docs](http://localhost:4000/api-docs) | Swagger OpenAPI interactive interface (40+ endpoints) |
| **AI Service Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | FastAPI Swagger documentation for Trust Score & Sentiment analysis |

---

## 🔑 Pre-Seeded Demo Credentials

You do not need to create accounts from scratch to test the marketplace; the database comes pre-seeded:

### Worker / Provider Accounts
- **Worker 1**: `provider1@ustaad.local` / `UstaadDev123!` (Carpentry)
- **Worker 2**: `provider2@ustaad.local` / `UstaadDev123!` (Electrical)
- **Worker 3**: `provider3@ustaad.local` / `UstaadDev123!` (Plumbing)

### Customer Accounts
- **Customer 1**: `customer1@ustaad.local` / `UstaadDev123!`
- **Customer 2**: `customer2@ustaad.local` / `UstaadDev123!`

### Admin Account
- **Admin**: `admin@ustaad.local` / `UstaadDev123!`

### Mobile Phone OTP Login
- Phone: Any 10-digit number (e.g. `9876543210`)
- Mock OTP: `123456`

---

## ❓ Windows Troubleshooting FAQ

### Q1: `Activate.ps1 cannot be loaded because running scripts is disabled on this system`
**Solution**: PowerShell execution policy is restricted by default on Windows. Open PowerShell as Administrator and run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Or simply use `cmd.exe` and run `.venv\Scripts\activate.bat`.

### Q2: `CORS policy: No 'Access-Control-Allow-Origin' header`
**Solution**: Ensure you access the frontend via `http://localhost:3000/customer.html` rather than opening the file directly via Windows Explorer `file:///`. However, the backend is now updated to allow `null` origin, `localhost`, and `127.0.0.1` so both work!

### Q3: `Port 4000 or 5432 already in use`
**Solution**: Another process is occupying the port. To find and kill it in PowerShell:
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process
```

### Q4: Python not recognized as an internal or external command
**Solution**: Python was installed without checking "Add Python to PATH". Rerun the Python installer, select **Modify**, check **"Add Python to PATH"**, and restart your terminal.

