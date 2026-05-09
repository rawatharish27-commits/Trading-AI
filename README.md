# 🤖 Trading AI Agent - Nifty 500

**AI-powered Trading System for Nifty 500 Stocks with Local LLM Brain**

## 📋 Features

- **Nifty 500 Stocks** - Full coverage of Indian stock market
- **Yahoo Finance Data** - Free, real-time market data (no API key required)
- **Local LLM Brain** - AI-powered trading decisions
- **Smart Money Concepts (SMC)** - Professional trading analysis
- **80%+ Confidence Filter** - High probability trade signals
- **5-Day Swing Trading** - Short-term position tracking
- **Learning System** - Self-improving from trade outcomes
- **Modern Dashboard** - Real-time P&L, signals, and analytics

---

## 🚀 Quick Start

### Step 1: Prerequisites

Ensure you have installed:
- **Node.js** 18+ 
- **Bun** (recommended) or npm
- **Git**

### Step 2: Clone & Install

```bash
# Navigate to project
cd /home/z/my-project

# Install dependencies (if not already installed)
bun install
```

### Step 3: Setup Database

```bash
# Push Prisma schema to database
bun run db:push
```

### Step 4: Start Development Server

```bash
# Start Next.js development server
bun run dev
```

### Step 5: Access Dashboard

Open your browser and go to:
- **Local**: http://localhost:3000
- **Preview Panel**: Click "Open in New Tab" button

---

## 📁 Project Structure

```
/home/z/my-project/
├── 📁 prisma/
│   └── schema.prisma          # Database schema
│
├── 📁 src/
│   ├── 📁 app/
│   │   ├── page.tsx           # Main Dashboard UI
│   │   ├── layout.tsx         # App layout
│   │   ├── globals.css        # Global styles
│   │   └── 📁 api/
│   │       └── 📁 trading/
│   │           ├── route.ts       # Main API
│   │           ├── llm/route.ts   # AI Brain API
│   │           ├── scan/route.ts  # Stock Scanner
│   │           ├── analyze/route.ts
│   │           ├── smc/route.ts   # Smart Money Concepts
│   │           ├── risk/route.ts  # Risk Analysis
│   │           ├── trades/route.ts
│   │           └── dashboard/route.ts
│   │
│   ├── 📁 components/ui/      # 45+ UI components
│   │
│   ├── 📁 lib/
│   │   ├── utils.ts
│   │   ├── api.ts
│   │   ├── db.ts              # Prisma client
│   │   └── 📁 trading/
│   │       ├── index.ts
│   │       ├── types.ts       # TypeScript types
│   │       ├── nifty500.ts    # Nifty 500 symbols
│   │       ├── data-service.ts    # Yahoo Finance
│   │       ├── analysis-engine.ts # Technical analysis
│   │       ├── llm-brain.ts       # AI Brain
│   │       ├── learning-system.ts # Learning
│   │       ├── 📁 agents/     # AI Agents
│   │       │   ├── decision-agent.ts
│   │       │   ├── risk-agent.ts
│   │       │   ├── learning-agent.ts
│   │       │   └── research-agent.ts
│   │       └── 📁 smc/        # Smart Money Concepts
│   │           ├── structure.ts
│   │           ├── liquidity.ts
│   │           ├── orderblock.ts
│   │           ├── fvg.ts
│   │           ├── swing.ts
│   │           ├── regime.ts
│   │           └── confluence.ts
│   │
│   └── 📁 hooks/
│       ├── use-toast.ts
│       └── use-mobile.ts
│
├── 📁 public/
│   ├── logo.svg
│   └── robots.txt
│
├── 📁 mini-services/          # Optional microservices
│   ├── 📁 trading-api/
│   └── 📁 trading-engine/
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── Caddyfile
└── README.md
```

---

## 🔧 Available Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run db:push` | Push database schema |
| `bun run db:studio` | Open Prisma Studio |

---

## 📊 Dashboard Features

### 1. **Overview Tab**
- Total stocks tracked
- Active signals count
- Pending signals
- LLM brain status
- Data sync status

### 2. **Signals Tab**
- Real-time trade signals
- 80%+ confidence filter
- Entry/Stop Loss/Target
- Risk-Reward ratio
- Signal history

### 3. **Learning Tab**
- Trade outcomes tracking
- What worked / What failed
- Strategy improvements
- Pattern recognition

### 4. **P&L Tab**
- Profit/Loss tracking
- Win rate statistics
- Performance charts
- Trade history

### 5. **Watchlist Tab**
- Favorite stocks
- Custom alerts
- Quick analysis

---

## 🤖 AI Brain Features

### Decision Agent
- Analyzes market conditions
- Generates trade signals
- Confidence scoring

### Risk Agent
- Position sizing
- Risk assessment
- Portfolio balance

### Learning Agent
- Learns from outcomes
- Improves strategies
- Pattern recognition

### Research Agent
- Market research
- News sentiment
- Sector analysis

---

## 📈 Smart Money Concepts (SMC)

The system uses professional trading concepts:

- **Structure** - Market structure (HH, HL, LH, LL)
- **Liquidity** - Buy-side/Sell-side liquidity
- **Order Blocks** - Institutional order zones
- **FVG** - Fair Value Gaps
- **Swing Points** - Swing highs and lows
- **Market Regime** - Trend identification
- **Confluence** - Multiple signal confirmation

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/trading` | GET/POST | Main trading API |
| `/api/trading/scan` | GET | Scan stocks |
| `/api/trading/analyze` | POST | Analyze stock |
| `/api/trading/llm` | GET/POST | AI Brain |
| `/api/trading/smc` | POST | SMC Analysis |
| `/api/trading/risk` | POST | Risk Analysis |
| `/api/trading/trades` | GET | Trade history |
| `/api/trading/dashboard` | GET | Dashboard data |

---

## 🌐 Data Sources

### Yahoo Finance (Free)
- Real-time stock prices
- Historical data
- No API key required
- Rate limit: 2000 requests/hour

### Nifty 500 Symbols
- Auto-loaded from built-in list
- Sector classification
- Market cap data

---

## ⚙️ Configuration

### Environment Variables

Create `.env` file:

```env
# Database
DATABASE_URL="file:./dev.db"

# AI Brain (optional - uses z-ai-web-dev-sdk)
# No additional config needed

# Server
PORT=3000
```

---

## 📱 Responsive Design

Dashboard is fully responsive:
- ✅ Desktop (1920px+)
- ✅ Laptop (1366px+)
- ✅ Tablet (768px+)
- ✅ Mobile (375px+)

---

## 🛡️ Safety Features

- **Paper Trading** - Test without real money
- **Risk Limits** - Maximum loss protection
- **Confidence Filter** - Only high-probability trades
- **Stop Loss** - Automatic risk management

---

## 🔄 Workflow

### Daily Workflow

1. **Market Open (9:15 AM)**
   - System scans Nifty 500 stocks
   - Fetches latest data from Yahoo Finance
   - Runs technical analysis

2. **Signal Generation**
   - AI Brain analyzes patterns
   - Confluence scoring (need 80%+)
   - Generates trade signals

3. **Trade Tracking**
   - Monitor open positions
   - Track 5-day holding period
   - Update P&L

4. **Learning**
   - Record trade outcomes
   - Update strategies
   - Improve accuracy

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Kill existing process
pkill -f "next dev"

# Restart
bun run dev
```

### Database errors
```bash
# Reset database
rm -f prisma/dev.db
bun run db:push
```

### No data showing
```bash
# Check data fetch status in dashboard
# Click "Fetch Data" button
```

---

## 📞 Support

For issues or questions:
1. Check the dashboard logs
2. Review API responses
3. Check database status

---

## 📄 License

MIT License - Free for personal and educational use.

---

## 🙏 Credits

- **Next.js 16** - React Framework
- **Prisma** - Database ORM
- **shadcn/ui** - UI Components
- **Tailwind CSS** - Styling
- **Yahoo Finance** - Market Data
- **z-ai-web-dev-sdk** - AI Integration

---

**Made with ❤️ for Indian Traders**
