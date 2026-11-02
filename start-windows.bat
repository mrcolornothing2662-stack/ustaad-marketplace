@echo off
TITLE Ustaad Marketplace - Windows Native Launcher
color 0B

echo ======================================================================
echo           USTAAD MARKETPLACE - WINDOWS SETUP & LAUNCHER
echo ======================================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js (v18+ or v20+) from: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js is detected.

:: 2. Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.9+ from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)
echo [OK] Python is detected.

echo.
echo ======================================================================
echo Step 1: Setting up AI Service (Python FastAPI)
echo ======================================================================
cd ai-service
if not exist .venv (
    echo Creating Python virtual environment...
    python -m venv .venv
)
echo Installing AI Service dependencies...
call .venv\Scripts\pip install -r requirements.txt
cd ..

echo.
echo ======================================================================
echo Step 2: Setting up Backend (Node.js & Prisma)
echo ======================================================================
cd backend
echo Installing backend npm packages...
call npm install
echo Generating Prisma Client...
call npx prisma generate
echo Running Database Migrations...
call npx prisma migrate deploy
echo Seeding demo data (providers, customers, categories)...
call npm run prisma:seed
echo Building backend TypeScript...
call npm run build
cd ..

echo.
echo ======================================================================
echo Step 3: Launching Services
echo ======================================================================
echo Starting AI Service on port 8000 in background window...
start "Ustaad AI Service (Port 8000)" cmd /k "cd ai-service && .venv\Scripts\activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak >nul

echo Starting Backend API on port 4000 in background window...
start "Ustaad Backend API (Port 4000)" cmd /k "cd backend && npm start"

timeout /t 3 /nobreak >nul

echo Starting Web Frontend Server on port 3000 in background window...
start "Ustaad Frontend Server (Port 3000)" cmd /k "python -m http.server 3000"

timeout /t 2 /nobreak >nul

echo.
echo ======================================================================
echo Launch Complete! Opening Web Applications in your default browser...
echo ======================================================================
start http://localhost:3000/customer.html
start http://localhost:3000/worker.html
start http://localhost:3000/admin.html
start http://localhost:4000/api-docs

echo.
echo ======================================================================
echo URLS & TEST CREDENTIALS:
echo ======================================================================
echo Customer Portal : http://localhost:3000/customer.html
echo Worker Portal   : http://localhost:3000/worker.html
echo Admin Dashboard : http://localhost:3000/admin.html
echo Backend API Docs: http://localhost:4000/api-docs
echo.
echo Demo Worker: provider1@ustaad.local / UstaadDev123!
echo Demo Customer: customer1@ustaad.local / UstaadDev123!
echo Mock SMS OTP: 123456
echo ======================================================================
echo Press any key to exit this launcher (services will keep running in their own windows).
pause >nul

