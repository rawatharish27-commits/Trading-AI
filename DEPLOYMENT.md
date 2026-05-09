# Trading AI Agent - Production Deployment Guide

## 🚀 Complete Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE PAGES                         │
│                    Frontend (Next.js)                       │
│                    FREE - Unlimited bandwidth               │
└─────────────────────┬───────────────────────────────────────┘
                      │ API Calls
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    RENDER / RAILWAY                         │
│                    Python Backend (FastAPI)                 │
│                    Port 3030                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│   NEON (Free)    │    │  UPSTASH (Free)  │
│   PostgreSQL     │    │  Redis Cache     │
└──────────────────┘    └──────────────────┘
```

## 💰 Free Tier Limits

| Service | Free Limit | Notes |
|---------|------------|-------|
| Neon | 0.5 GB storage | Auto-suspend after inactivity |
| Upstash Redis | 10,000 commands/day | Free tier |
| Render | 750 hours/month | Spins down after inactivity |
| Railway | $5 credit/month | Limited |
| DeepSeek | 5M tokens/month | Free tier |

## 🔑 Step-by-Step Setup

### Step 1: Neon Database (PostgreSQL)

1. Go to https://neon.tech/
2. Sign up with GitHub
3. Create new project: "trading-ai"
4. Copy connection string:
   ```
   postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/trading_ai?sslmode=require
   ```

### Step 2: Upstash Redis (Optional)

1. Go to https://upstash.com/
2. Create account
3. Create Redis database
4. Copy URL:
   ```
   redis://default:xxx@us1-xxx.redis.upstash.io:6379
   ```

### Step 3: DeepSeek API (FREE LLM)

1. Go to https://platform.deepseek.com/
2. Sign up
3. API Keys → Create new key
4. Copy key: `sk-xxx`

**Why DeepSeek?**
- FREE: 5 million tokens/month
- Very cheap after free tier
- Compatible with OpenAI SDK
- Great for trading decisions

### Step 4: Deploy Backend to Render

1. Go to https://dashboard.render.com/
2. Create account with GitHub
3. New → Web Service
4. Connect repository: `Trading-AI`
5. Settings:
   ```
   Name: trading-ai-backend
   Root Directory: mini-services/trading-engine
   Runtime: Python 3
   Build Command: pip install -r requirements.txt
   Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
6. Environment Variables:
   ```
   DATABASE_URL=postgresql://...from Neon
   REDIS_URL=redis://...from Upstash (optional)
   OPENAI_API_KEY=sk-xxx (use DeepSeek key here)
   OPENAI_BASE_URL=https://api.deepseek.com/v1
   PAPER_TRADING=true
   ```

### Step 5: Deploy Frontend to Cloudflare

1. Go to https://dash.cloudflare.com/
2. Workers & Pages → Create application
3. Pages → Connect to Git
4. Select repository: `Trading-AI`
5. Settings:
   ```
   Project name: trading-ai
   Root directory: /
   Build command: bun run build
   Build output directory: .next
   ```
6. Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://trading-ai-backend.onrender.com
   ```

## 🔄 Alternative: Railway (All-in-One)

Railway can host both backend + database:

1. Go to https://railway.app/
2. New Project → Deploy from GitHub
3. Add PostgreSQL (auto-configured)
4. Add Redis (optional)
5. Deploy Python backend

## 📊 Cost Estimation

| Usage Level | Monthly Cost |
|-------------|--------------|
| Light (Testing) | FREE |
| Medium (Daily use) | ~$5-10 |
| Heavy (Production) | ~$20-50 |

## ⚠️ Important Notes

1. **Render Free Tier**: Spins down after 15 min inactivity
   - First request will be slow (cold start)
   - Upgrade to Starter ($7/mo) for always-on

2. **Neon Free Tier**: Auto-suspend after 5 min inactivity
   - First query will be slower (cold start)
   - Upgrade for always-on

3. **DeepSeek Free Tier**: 5M tokens/month
   - Enough for ~1000 trading decisions
   - Very cheap after: $0.14/1M tokens

## 🛠️ Production Checklist

- [ ] Neon database created
- [ ] DeepSeek API key obtained
- [ ] Backend deployed to Render
- [ ] Frontend deployed to Cloudflare
- [ ] Environment variables set
- [ ] API endpoints tested
- [ ] Kill switch tested
- [ ] Alerts configured (Telegram)
