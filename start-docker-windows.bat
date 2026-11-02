@echo off
TITLE Ustaad Marketplace - Docker 1-Click Launcher
color 0A

echo ======================================================================
echo           USTAAD MARKETPLACE - DOCKER 1-CLICK LAUNCHER
echo ======================================================================
echo.

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed or not running!
    echo Please install Docker Desktop for Windows from: https://www.docker.com/products/docker-desktop/
    echo Make sure Docker Desktop is open and running before running this script.
    pause
    exit /b 1
)

echo Building and starting PostgreSQL, Redis, AI Service, Backend, and Frontend...
docker compose up --build -d

echo.
echo Waiting 8 seconds for database initialization...
timeout /t 8 /nobreak >nul

echo Opening apps in browser...
start http://localhost:3000/customer.html
start http://localhost:3000/worker.html
start http://localhost:3000/admin.html
start http://localhost:4000/api-docs

echo.
echo ======================================================================
echo USTAAD IS RUNNING IN DOCKER CONTAINERS!
echo ======================================================================
echo Customer Web App : http://localhost:3000/customer.html
echo Worker Portal    : http://localhost:3000/worker.html
echo Admin Dashboard  : http://localhost:3000/admin.html
echo API Docs         : http://localhost:4000/api-docs
echo.
echo To view live logs: docker compose logs -f
echo To stop services : docker compose down
echo ======================================================================
pause

