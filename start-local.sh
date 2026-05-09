#!/bin/bash

# Trading AI Agent - Local Development Startup Script
# ============================================

echo "🚀 Starting Trading AI Agent - Local Development"
echo "================================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Docker is not running. Starting Docker...${NC}"
    # Try to start Docker (works on some systems)
    if command -v systemctl &> /dev/null; then
        sudo systemctl start docker
    fi
fi

# Start PostgreSQL and Redis using Docker Compose
echo -e "${GREEN}📦 Starting PostgreSQL and Redis containers...${NC}"
cd /home/z/my-project
docker-compose -f docker-compose.local.yml up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
sleep 5
until docker exec trading-postgres-local pg_isready -U trader -d trading_ai; do
    echo "  Waiting for PostgreSQL..."
    sleep 2
done
echo -e "${GREEN}✅ PostgreSQL is ready!${NC}"

# Wait for Redis to be ready
echo -e "${YELLOW}⏳ Waiting for Redis to be ready...${NC}"
until docker exec trading-redis-local redis-cli ping | grep -q PONG; do
    echo "  Waiting for Redis..."
    sleep 2
done
echo -e "${GREEN}✅ Redis is ready!${NC}"

# Start Python Backend (Trading Engine)
echo -e "${GREEN}🐍 Starting Python Trading Engine...${NC}"
cd /home/z/my-project/mini-services/trading-engine

# Copy local env file if it exists
if [ -f .env.local ]; then
    cp .env.local .env
    echo -e "${GREEN}✅ Using .env.local configuration${NC}"
fi

# Install Python dependencies if needed
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}📦 Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

# Run migrations
echo -e "${GREEN}🔄 Running database migrations...${NC}"
python run_migrations.py

# Start the FastAPI server in background
echo -e "${GREEN}🚀 Starting FastAPI server on port 3030...${NC}"
nohup python -m uvicorn main:app --host 0.0.0.0 --port 3030 --reload > /tmp/trading-engine.log 2>&1 &
echo $! > /tmp/trading-engine.pid
echo -e "${GREEN}✅ Trading Engine started (PID: $(cat /tmp/trading-engine.pid))${NC}"

# Wait for backend to be ready
echo -e "${YELLOW}⏳ Waiting for Trading Engine to be ready...${NC}"
sleep 5
until curl -s http://localhost:3030/health > /dev/null 2>&1; do
    echo "  Waiting for Trading Engine..."
    sleep 2
done
echo -e "${GREEN}✅ Trading Engine is ready!${NC}"

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}🎉 Trading AI Agent is running locally!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "📊 Backend API:  ${GREEN}http://localhost:3030${NC}"
echo -e "📚 API Docs:     ${GREEN}http://localhost:3030/docs${NC}"
echo -e "🗄️  PostgreSQL:   ${GREEN}localhost:5432/trading_ai${NC}"
echo -e "⚡ Redis:        ${GREEN}localhost:6379${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. The frontend is running on port 3000 (Next.js dev server)"
echo -e "  2. Deploy frontend to Vercel: ${GREEN}vercel --prod${NC}"
echo ""
echo -e "${YELLOW}To stop all services:${NC}"
echo -e "  docker-compose -f docker-compose.local.yml down"
echo -e "  kill \$(cat /tmp/trading-engine.pid)"
echo ""
