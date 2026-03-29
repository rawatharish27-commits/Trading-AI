-- Trading AI Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SYMBOLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS symbols (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    exchange VARCHAR(20) DEFAULT 'NSE',
    sector VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    lot_size INTEGER DEFAULT 1,
    tick_size FLOAT DEFAULT 0.05,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_symbols_symbol ON symbols(symbol);

-- ============================================
-- CANDLES TABLE (OHLCV Data)
-- ============================================
CREATE TABLE IF NOT EXISTS candles (
    id SERIAL PRIMARY KEY,
    symbol_id INTEGER REFERENCES symbols(id),
    timeframe VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    open FLOAT NOT NULL,
    high FLOAT NOT NULL,
    low FLOAT NOT NULL,
    close FLOAT NOT NULL,
    volume FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_candles_symbol_tf ON candles(symbol_id, timeframe);
CREATE INDEX idx_candles_timestamp ON candles(timestamp);

-- ============================================
-- TRADES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    symbol_id INTEGER REFERENCES symbols(id),
    setup_id INTEGER,
    direction VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    entry_price FLOAT NOT NULL,
    exit_price FLOAT,
    quantity FLOAT NOT NULL,
    stop_loss FLOAT NOT NULL,
    take_profit FLOAT,
    pnl FLOAT,
    pnl_percent FLOAT,
    fees FLOAT DEFAULT 0,
    risk_percent FLOAT DEFAULT 1.0,
    risk_amount FLOAT,
    broker_order_id VARCHAR(50),
    executed_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP,
    tags TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_executed ON trades(executed_at);

-- ============================================
-- TRADE SETUPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trade_setups (
    id SERIAL PRIMARY KEY,
    symbol_id INTEGER REFERENCES symbols(id),
    timeframe VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    direction VARCHAR(10) NOT NULL,
    liquidity_sweep BOOLEAN DEFAULT false,
    liquidity_score INTEGER DEFAULT 0,
    bos_score INTEGER DEFAULT 0,
    ob_score INTEGER DEFAULT 0,
    fvg_score INTEGER DEFAULT 0,
    volume_score INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    htf_bias VARCHAR(10),
    regime VARCHAR(20),
    entry_price FLOAT,
    stop_loss FLOAT,
    take_profit FLOAT,
    risk_reward FLOAT,
    status VARCHAR(20) DEFAULT 'PENDING',
    ai_decision VARCHAR(20),
    ai_reasoning TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- DAILY RISK STATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS daily_risk_states (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    starting_capital FLOAT NOT NULL,
    current_capital FLOAT NOT NULL,
    daily_pnl FLOAT DEFAULT 0,
    daily_loss FLOAT DEFAULT 0,
    daily_trades INTEGER DEFAULT 0,
    open_positions INTEGER DEFAULT 0,
    daily_loss_limit BOOLEAN DEFAULT false,
    trade_limit_hit BOOLEAN DEFAULT false,
    trading_halted BOOLEAN DEFAULT false,
    halt_reason VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_risk_date ON daily_risk_states(date);

-- ============================================
-- AGENT DECISIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS agent_decisions (
    id SERIAL PRIMARY KEY,
    agent_type VARCHAR(20) NOT NULL,
    symbol VARCHAR(20),
    setup_id INTEGER,
    input_json TEXT,
    output_json TEXT,
    decision VARCHAR(20),
    confidence FLOAT,
    reasoning TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_type ON agent_decisions(agent_type);
CREATE INDEX idx_agent_created ON agent_decisions(created_at);

-- ============================================
-- LEARNING RECORDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS learning_records (
    id SERIAL PRIMARY KEY,
    trade_id INTEGER REFERENCES trades(id),
    setup_type VARCHAR(30) NOT NULL,
    trend_direction VARCHAR(10),
    regime VARCHAR(20),
    volatility VARCHAR(10),
    volume_profile VARCHAR(10),
    htf_alignment BOOLEAN,
    session VARCHAR(20),
    day_of_week INTEGER,
    result VARCHAR(20) NOT NULL,
    pnl_percent FLOAT,
    hold_time INTEGER,
    setup_score FLOAT,
    confidence FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_learning_setup ON learning_records(setup_type);
CREATE INDEX idx_learning_result ON learning_records(result);

-- ============================================
-- PROBABILITY TABLES
-- ============================================
CREATE TABLE IF NOT EXISTS probability_tables (
    id SERIAL PRIMARY KEY,
    setup_type VARCHAR(30) NOT NULL,
    regime VARCHAR(20),
    trend_direction VARCHAR(10),
    volume_profile VARCHAR(10),
    total_trades INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    win_rate FLOAT DEFAULT 0,
    avg_pnl FLOAT DEFAULT 0,
    avg_hold_time INTEGER,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- BACKTEST RUNS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS backtest_runs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    config_json TEXT,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    win_rate FLOAT DEFAULT 0,
    total_pnl FLOAT DEFAULT 0,
    max_drawdown FLOAT DEFAULT 0,
    expectancy FLOAT DEFAULT 0,
    profit_factor FLOAT DEFAULT 0,
    sharpe_ratio FLOAT,
    status VARCHAR(20) DEFAULT 'PENDING',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SYSTEM LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(10) NOT NULL,
    category VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    symbol VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_logs_level ON system_logs(level);
CREATE INDEX idx_logs_created ON system_logs(created_at);

-- ============================================
-- SWINGS TABLE (SMC Data)
-- ============================================
CREATE TABLE IF NOT EXISTS swings (
    id SERIAL PRIMARY KEY,
    symbol_id INTEGER REFERENCES symbols(id),
    timeframe VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    type VARCHAR(10) NOT NULL,
    price FLOAT NOT NULL,
    strength INTEGER DEFAULT 3,
    confirmed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_swings_symbol ON swings(symbol_id, timeframe);

-- ============================================
-- STRUCTURES TABLE (BOS, CHoCH)
-- ============================================
CREATE TABLE IF NOT EXISTS structures (
    id SERIAL PRIMARY KEY,
    symbol_id INTEGER REFERENCES symbols(id),
    timeframe VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    type VARCHAR(10) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    price FLOAT NOT NULL,
    broken_level FLOAT,
    confirmed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ORDER BLOCKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS order_blocks (
    id SERIAL PRIMARY KEY,
    symbol_id INTEGER REFERENCES symbols(id),
    timeframe VARCHAR(10) NOT NULL,
    type VARCHAR(10) NOT NULL,
    high_price FLOAT NOT NULL,
    low_price FLOAT NOT NULL,
    candle_index INTEGER,
    volume FLOAT,
    impulse_size FLOAT,
    strength FLOAT DEFAULT 1.0,
    mitigated BOOLEAN DEFAULT false,
    mitigated_at TIMESTAMP,
    retested BOOLEAN DEFAULT false,
    retested_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- FVG TABLE (Fair Value Gaps)
-- ============================================
CREATE TABLE IF NOT EXISTS fvgs (
    id SERIAL PRIMARY KEY,
    symbol_id INTEGER REFERENCES symbols(id),
    timeframe VARCHAR(10) NOT NULL,
    type VARCHAR(10) NOT NULL,
    gap_top FLOAT NOT NULL,
    gap_bottom FLOAT NOT NULL,
    gap_size FLOAT NOT NULL,
    candle_index INTEGER,
    filled BOOLEAN DEFAULT false,
    filled_at TIMESTAMP,
    fill_percentage FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- LIQUIDITY ZONES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS liquidity_zones (
    id SERIAL PRIMARY KEY,
    symbol_id INTEGER REFERENCES symbols(id),
    timeframe VARCHAR(10) NOT NULL,
    type VARCHAR(20) NOT NULL,
    price_level FLOAT NOT NULL,
    tolerance FLOAT DEFAULT 0.1,
    volume FLOAT,
    swept BOOLEAN DEFAULT false,
    swept_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INSERT DEFAULT SYMBOLS
-- ============================================
INSERT INTO symbols (symbol, name, sector) VALUES
    ('RELIANCE', 'Reliance Industries', 'Energy'),
    ('TCS', 'Tata Consultancy Services', 'IT'),
    ('HDFCBANK', 'HDFC Bank', 'Banking'),
    ('INFY', 'Infosys', 'IT'),
    ('ICICIBANK', 'ICICI Bank', 'Banking'),
    ('HINDUNILVR', 'Hindustan Unilever', 'FMCG'),
    ('SBIN', 'State Bank of India', 'Banking'),
    ('BHARTIARTL', 'Bharti Airtel', 'Telecom'),
    ('ITC', 'ITC Limited', 'FMCG'),
    ('KOTAKBANK', 'Kotak Mahindra Bank', 'Banking'),
    ('LT', 'Larsen & Toubro', 'Infrastructure'),
    ('AXISBANK', 'Axis Bank', 'Banking'),
    ('ASIANPAINT', 'Asian Paints', 'Consumer'),
    ('MARUTI', 'Maruti Suzuki', 'Auto'),
    ('SUNPHARMA', 'Sun Pharmaceutical', 'Pharma')
ON CONFLICT (symbol) DO NOTHING;

-- ============================================
-- CREATE UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables
CREATE TRIGGER update_symbols_updated_at BEFORE UPDATE ON symbols
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_risk_updated_at BEFORE UPDATE ON daily_risk_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
