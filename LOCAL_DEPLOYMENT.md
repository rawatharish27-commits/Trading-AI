# Trading AI Agent RAG - Local Deployment Guide

## ✅ Local Backend Running

The Python backend is now running locally with:
- **Port**: 3030
- **Database**: SQLite (local file: `trading_ai_local.db`)
- **API Docs**: http://localhost:3030/docs
- **Health Check**: http://localhost:3030/health

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Next.js       │────▶│   Python        │
│   Frontend      │     │   Backend       │
│   (Port 3000)   │     │   (Port 3030)   │
└─────────────────┘     └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │   SQLite DB     │
                        │   (Local File)  │
                        └─────────────────┘
```

## Running Locally

### 1. Start the Backend
```bash
cd mini-services/trading-engine
export DATABASE_URL="sqlite:///./trading_ai_local.db"
python3 -m uvicorn main:app --host 0.0.0.0 --port 3030
```

### 2. Frontend is Already Running
The Next.js frontend runs automatically on port 3000.

## Deploying Frontend to Vercel

### Option 1: Direct Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Option 2: GitHub Integration
1. Push code to GitHub
2. Connect repo on Vercel Dashboard
3. Set environment variable:
   - `NEXT_PUBLIC_API_URL` = `http://YOUR_PUBLIC_IP:3030`

### Important for Vercel + Local Backend

Since Vercel hosts frontend in cloud, your local backend needs to be accessible from internet:

**Option A: Use Public IP with Port Forwarding**
```
NEXT_PUBLIC_API_URL=http://YOUR_PUBLIC_IP:3030
```

**Option B: Use ngrok (Recommended for Development)**
```bash
# Install ngrok
# Run:
ngrok http 3030

# Use the ngrok URL in Vercel env:
NEXT_PUBLIC_API_URL=https://your-ngrok-url.ngrok.io
```

**Option C: Use Cloudflare Tunnel**
```bash
# Install cloudflared
cloudflared tunnel --url http://localhost:3030

# Use the tunnel URL in Vercel env:
NEXT_PUBLIC_API_URL=https://your-tunnel-url.trycloudflare.com
```

## For Production with PostgreSQL

When ready for full production with PostgreSQL:

### 1. Start PostgreSQL with Docker
```bash
docker-compose -f docker-compose.local.yml up -d postgres
```

### 2. Update Backend Environment
```bash
# In mini-services/trading-engine/.env
DATABASE_URL=postgresql://trader:trading123@localhost:5432/trading_ai
```

### 3. Restart Backend
```bash
cd mini-services/trading-engine
python3 -m uvicorn main:app --host 0.0.0.0 --port 3030
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/dashboard/stats` | Trading statistics |
| `GET /api/smc/analyze?symbol=RELIANCE&timeframe=5m` | SMC Analysis |
| `GET /api/trades` | List trades |
| `POST /api/trades` | Create trade |
| `GET /api/risk/state` | Risk management status |
| `GET /api/safety/status` | Kill switch status |
| `POST /api/backtest/run?symbol=RELIANCE` | Run backtest |

## Environment Variables

### Backend (`mini-services/trading-engine/.env`)
```
DATABASE_URL=sqlite:///./trading_ai_local.db
OPENAI_API_KEY=sk-your-deepseek-api-key
PAPER_TRADING=true
```

### Frontend (`.env`)
```
NEXT_PUBLIC_API_URL=http://localhost:3030
```

## Current Status

✅ Backend: Running on port 3030
✅ Database: SQLite (healthy)
✅ Frontend: Running on port 3000
⚠️ Redis: Not running (optional, in-memory cache used)
⚠️ Broker: Paper trading mode
