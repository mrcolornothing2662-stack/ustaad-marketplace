#!/usr/bin/env bash
set -e

echo "======================================================================"
echo "          USTAAD MARKETPLACE - MAC/LINUX SETUP & LAUNCHER"
echo "======================================================================"

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed! Please install Node.js 18+ or 20+."
    exit 1
fi

# 2. Check Python
PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    if command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        echo "[ERROR] Python is not installed! Please install Python 3.9+."
        exit 1
    fi
fi

echo "Setting up AI Service..."
cd ai-service
if [ ! -d ".venv" ]; then
    $PYTHON_CMD -m venv .venv
fi
.venv/bin/pip install -r requirements.txt
cd ..

echo "Setting up Backend..."
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run build
cd ..

echo "Starting services in background..."
# AI Service
PYTHONPATH=ai-service ai-service/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 &
PID_AI=$!

# Backend API
(cd backend && node dist/src/server.js) &
PID_BACKEND=$!

# Web Frontend Server
$PYTHON_CMD -m http.server 3000 &
PID_FRONTEND=$!

sleep 3

echo ""
echo "======================================================================"
echo "Services started successfully!"
echo "AI Service PID: $PID_AI (http://localhost:8000)"
echo "Backend API PID: $PID_BACKEND (http://localhost:4000/api/v1)"
echo "Frontend PID: $PID_FRONTEND (http://localhost:3000)"
echo "======================================================================"
echo "Customer Web App: http://localhost:3000/customer.html"
echo "Worker Portal:    http://localhost:3000/worker.html"
echo "API Docs:         http://localhost:4000/api-docs"
echo "======================================================================"
echo "Press CTRL+C to stop all services."

trap "kill $PID_AI $PID_BACKEND $PID_FRONTEND; exit 0" INT TERM
wait

