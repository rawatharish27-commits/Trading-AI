# Trading AI - Hybrid Deployment Guide
# Cloudflare Workers + Render Python Backend

## Architecture

```
┌─────────────────────────────────────────────────────┐
│            CLOUDFLARE PAGES (FREE)                  │
│            Frontend - Next.js                       │
│            https://tradingai.pages.dev              │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│            CLOUDFLARE WORKERS (FREE)                │
│            Light API - Edge Functions               │
│            https://api.tradingai.pages.dev          │
│                                                     │
│            ✅ /health (instant)                     │
│            ✅ /api/market/status (instant)          │
│            ✅ /api/safety/check (instant)           │
│            ✅ Caching layer                         │
└─────────────────────┬───────────────────────────────┘
                      │ Heavy operations
                      ▼
┌─────────────────────────────────────────────────────┐
│            RENDER (FREE)                            │
│            Python Backend - FastAPI                 │
│            https://trading-ai-backend.onrender.com  │
│                                                     │
│            ✅ SMC Engine                            │
│            ✅ Multi-Timeframe Analysis              │
│            ✅ Backtest Engine                       │
│            ✅ AI Agents                             │
│            ✅ Broker Integration                    │
└─────────────────────┬───────────────────────────────┘
                      │
           ┌──────────┴──────────┐
           ▼                     ▼
┌──────────────────┐   ┌──────────────────┐
│   SUPABASE       │   │   DEEPSEEK       │
│   PostgreSQL     │   │   LLM API        │
│   FREE 500MB     │   │   FREE 5M tokens │
└──────────────────┘   └──────────────────┘
```

---

## Step 1: Deploy Python Backend to Render

```bash
1. Go to: https://render.com
2. Sign up with GitHub
3. New → Web Service
4. Repository: Trading-AI
5. Root Directory: mini-services/trading-engine
6. Build Command: pip install -r requirements.txt
7. Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
8. Plan: FREE
9. Create Web Service

Environment Variables:
- DATABASE_URL = [from Supabase]
- OPENAI_API_KEY = [from DeepSeek]
- OPENAI_BASE_URL = https://api.deepseek.com/v1
- LLM_MODEL = deepseek-chat
- PAPER_TRADING = true
```

Backend URL: `https://trading-ai-backend.onrender.com`

---

## Step 2: Deploy Cloudflare Worker

```bash
# Install wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Navigate to worker directory
cd cloudflare

# Update PYTHON_BACKEND in worker.js
# Change: const PYTHON_BACKEND = 'https://YOUR-RENDER-APP.onrender.com';

# Deploy
wrangler deploy

# Test
curl https://trading-ai-api.your-subdomain.workers.dev/health
```

---

## Step 3: Deploy Frontend to Cloudflare Pages

```bash
1. Go to: https://dash.cloudflare.com
2. Workers & Pages → Create application
3. Pages → Connect to Git
4. Repository: Trading-AI
5. Project name: trading-ai
6. Build command: bun run build
7. Build output: .next
8. Framework preset: Next.js

Environment Variables:
- NEXT_PUBLIC_API_URL = https://trading-ai-api.your-subdomain.workers.dev
```

Frontend URL: `https://trading-ai.pages.dev`

---

## Step 4: Connect Custom Domain (Optional)

```bash
1. Cloudflare Pages → trading-ai → Custom domains
2. Add domain: yourdomain.com
3. Update DNS records (auto-configured)

4. Cloudflare Worker → Settings → Triggers
5. Add route: api.yourdomain.com/*
```

---

## API Endpoints

### Cloudflare Worker (Instant Response)
```
GET  /health              → Health check
GET  /api/market/status   → Market open/close status
GET  /api/safety/check    → Safety status
```

### Render Python Backend (Heavy Operations)
```
GET  /api/smc/analyze           → SMC analysis
GET  /api/smc/mtf/:symbol       → Multi-timeframe analysis
GET  /api/trades                → List trades
POST /api/trades                → Create trade
GET  /api/backtest/run          → Run backtest
GET  /api/sentiment/:symbol     → News sentiment
GET  /api/dashboard/stats       → Dashboard stats
```

---

## Free Tier Limits

| Service | Limit | Cost |
|---------|-------|------|
| Cloudflare Workers | 100K req/day | FREE |
| Cloudflare Pages | Unlimited | FREE |
| Render | 750 hrs/month | FREE |
| Supabase | 500MB DB | FREE |
| DeepSeek | 5M tokens/month | FREE |

**Total: ₹0/month**

---

## Testing

```bash
# Test Cloudflare Worker
curl https://trading-ai-api.your-subdomain.workers.dev/health

# Test Market Status
curl https://trading-ai-api.your-subdomain.workers.dev/api/market/status

# Test Python Backend (via Worker)
curl https://trading-ai-api.your-subdomain.workers.dev/api/smc/analyze?symbol=RELIANCE

# Direct Python Backend (bypass Worker)
curl https://trading-ai-backend.onrender.com/health
```

---

## Performance

| Operation | Cloudflare | Render Direct |
|-----------|------------|---------------|
| Health check | 10-50ms | 30-300ms (cold start) |
| Market status | 10-50ms | N/A |
| SMC Analysis | 100-500ms | 100-500ms |
| Backtest | Via Render | 1-10 seconds |

**Benefit:** Light operations are instant on Cloudflare Edge!

---

## Monitoring

### UptimeRobot (Keep Render Awake)
```
1. Go to: https://uptimerobot.com
2. Add Monitor → HTTP
3. URL: https://trading-ai-backend.onrender.com/health
4. Interval: 5 minutes
```

### Cloudflare Analytics
- Built-in analytics in Cloudflare dashboard
- Request counts, errors, latency

---

## Troubleshooting

### Worker Error: Backend Unavailable
```
- Check if Render backend is running
- Check PYTHON_BACKEND URL in worker.js
- Check Render logs
```

### CORS Error
```
- Worker already handles CORS
- Check browser console for specific error
- Ensure OPTIONS requests are handled
```

### Cold Start on Render
```
- Use UptimeRobot to keep awake
- Or upgrade to Render Starter ($7/month)
```

---

## Files Created

```
cloudflare/
├── worker.js          # Cloudflare Worker code
├── wrangler.toml      # Worker configuration
└── DEPLOY.md          # This file
```

---

## Quick Commands

```bash
# Deploy Worker
cd cloudflare && wrangler deploy

# View Worker logs
wrangler tail

# Test locally
wrangler dev

# Deploy Backend (Render auto-deploys on git push)
git push origin main
```
