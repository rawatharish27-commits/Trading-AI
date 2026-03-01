// Trading AI Agent RAG - Type Definitions
// Production-grade type system for the trading platform

// ============================================
// ENUMS
// ============================================

export enum Timeframe {
  M1 = '1m',
  M3 = '3m',
  M5 = '5m',
  M15 = '15m',
  M30 = '30m',
  H1 = '1h',
  H4 = '4h',
  D1 = '1d',
  W1 = '1w'
}

export enum TradeDirection {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export enum MarketDirection {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH',
  NEUTRAL = 'NEUTRAL'
}

export enum SwingType {
  HIGH = 'HIGH',
  LOW = 'LOW'
}

export enum StructureType {
  BOS = 'BOS',         // Break of Structure
  CHOCH = 'CHOCH',     // Change of Character
  HH = 'HH',           // Higher High
  HL = 'HL',           // Higher Low
  LH = 'LH',           // Lower High
  LL = 'LL'            // Lower Low
}

export enum LiquidityType {
  EQUAL_HIGHS = 'EQUAL_HIGHS',
  EQUAL_LOWS = 'EQUAL_LOWS',
  BUY_SIDE = 'BUY_SIDE',
  SELL_SIDE = 'SELL_SIDE'
}

export enum OrderBlockType {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH'
}

export enum FVGType {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH'
}

export enum MarketRegime {
  TRENDING = 'TRENDING',
  RANGING = 'RANGING',
  VOLATILE = 'VOLATILE'
}

export enum VolatilityLevel {
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW'
}

export enum VolumeProfile {
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW'
}

export enum TradingSession {
  PRE_MARKET = 'PRE_MARKET',
  OPENING = 'OPENING',
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  CLOSING = 'CLOSING'
}

export enum TradeStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED'
}

export enum SetupStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED',
  CLOSED = 'CLOSED'
}

export enum TradeResult {
  WIN = 'WIN',
  LOSS = 'LOSS',
  BREAKEVEN = 'BREAKEVEN'
}

export enum AgentType {
  RESEARCH = 'RESEARCH',
  STRATEGY = 'STRATEGY',
  DECISION = 'DECISION',
  RISK = 'RISK',
  EXECUTION = 'EXECUTION',
  MONITORING = 'MONITORING',
  LEARNING = 'LEARNING'
}

export enum AgentDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  BUY = 'BUY',
  SELL = 'SELL',
  HOLD = 'HOLD'
}

export enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export enum LogCategory {
  DATA = 'DATA',
  SMC = 'SMC',
  AGENT = 'AGENT',
  EXECUTION = 'EXECUTION',
  RISK = 'RISK',
  SYSTEM = 'SYSTEM'
}

// ============================================
// INTERFACES
// ============================================

// OHLCV Candle
export interface Candle {
  id?: string;
  symbolId: string;
  timeframe: Timeframe;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Swing Point
export interface Swing {
  id?: string;
  symbolId: string;
  timeframe: Timeframe;
  timestamp: Date;
  type: SwingType;
  price: number;
  strength: number;
  confirmed: boolean;
}

// Market Structure Point
export interface StructurePoint {
  id?: string;
  symbolId: string;
  timeframe: Timeframe;
  timestamp: Date;
  type: StructureType;
  direction: MarketDirection;
  price: number;
  swingId?: string;
  brokenLevel?: number;
  confirmed: boolean;
}

// Liquidity Zone
export interface LiquidityZone {
  id?: string;
  symbolId: string;
  timeframe: Timeframe;
  type: LiquidityType;
  priceLevel: number;
  tolerance: number;
  volume?: number;
  swept: boolean;
  sweptAt?: Date;
}

// Order Block
export interface OrderBlock {
  id?: string;
  symbolId: string;
  timeframe: Timeframe;
  type: OrderBlockType;
  highPrice: number;
  lowPrice: number;
  candleIndex: number;
  volume: number;
  mitagated: boolean;
  mitigatedAt?: Date;
  retested: boolean;
  retestedAt?: Date;
  strength: number;
}

// Fair Value Gap
export interface FairValueGap {
  id?: string;
  symbolId: string;
  timeframe: Timeframe;
  type: FVGType;
  gapTop: number;
  gapBottom: number;
  candleIndex: number;
  filled: boolean;
  filledAt?: Date;
  fillPercentage: number;
}

// Confluence Data
export interface ConfluenceData {
  liquiditySweep: boolean;
  liquidityScore: number;
  bos: boolean;
  bosScore: number;
  orderBlockTouch: boolean;
  obScore: number;
  fvgPresent: boolean;
  fvgScore: number;
  volumeSpike: boolean;
  volumeScore: number;
  totalScore: number;
}

// Trade Setup
export interface TradeSetup {
  id?: string;
  symbolId: string;
  timeframe: Timeframe;
  timestamp: Date;
  direction: TradeDirection;
  confluence: ConfluenceData;
  htfBias?: MarketDirection;
  mtfStructure?: StructureType;
  regime?: MarketRegime;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  status: SetupStatus;
  aiDecision?: AgentDecision;
  aiReasoning?: string;
}

// Executed Trade
export interface Trade {
  id?: string;
  symbolId: string;
  setupId?: string;
  direction: TradeDirection;
  status: TradeStatus;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  stopLoss: number;
  takeProfit?: number;
  pnl?: number;
  pnlPercent?: number;
  fees: number;
  riskPercent: number;
  riskAmount?: number;
  brokerOrderId?: string;
  executedAt: Date;
  closedAt?: Date;
  tags?: string[];
  notes?: string;
}

// Agent Decision Record
export interface AgentDecisionRecord {
  id?: string;
  agentType: AgentType;
  symbol?: string;
  setupId?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  decision?: AgentDecision;
  confidence?: number;
  reasoning?: string;
  processingTime?: number;
}

// Learning Record
export interface LearningRecordData {
  id?: string;
  tradeId?: string;
  setupType: string;
  trendDirection?: MarketDirection;
  regime?: MarketRegime;
  volatility?: VolatilityLevel;
  volumeProfile?: VolumeProfile;
  htfAlignment?: boolean;
  session?: TradingSession;
  dayOfWeek?: number;
  result: TradeResult;
  pnlPercent?: number;
  holdTime?: number;
  setupScore?: number;
  confidence?: number;
}

// Probability Entry
export interface ProbabilityEntry {
  setupType: string;
  regime?: MarketRegime;
  trendDirection?: MarketDirection;
  volumeProfile?: VolumeProfile;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnl: number;
  avgHoldTime?: number;
}

// Risk State
export interface RiskState {
  startingCapital: number;
  currentCapital: number;
  dailyPnL: number;
  dailyLoss: number;
  dailyTrades: number;
  openPositions: number;
  dailyLossLimit: boolean;
  tradeLimitHit: boolean;
  tradingHalted: boolean;
  haltReason?: string;
}

// Risk Config
export interface RiskConfigData {
  maxRiskPerTrade: number;
  maxDailyLoss: number;
  maxWeeklyLoss: number;
  maxDrawdown: number;
  maxTradesPerDay: number;
  maxOpenPositions: number;
  maxCorrelatedPos: number;
  minRiskReward: number;
  tradingStartTime: string;
  tradingEndTime: string;
  noTradeDays: number[];
}

// Market Regime Data
export interface MarketRegimeData {
  id?: string;
  symbol: string;
  timeframe: Timeframe;
  timestamp: Date;
  regime: MarketRegime;
  trendStrength: number;
  volatility: number;
  atr: number;
  emaSpread?: number;
  avgRange?: number;
  rangeRatio?: number;
}

// Scanner Result
export interface ScannerResult {
  symbol: string;
  score: number;
  reasons: string[];
  trend: MarketDirection;
  regime: MarketRegime;
  volume: VolumeProfile;
  lastScanned: Date;
}

// Backtest Config
export interface BacktestConfig {
  symbol: string;
  timeframe: Timeframe;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  riskPerTrade: number;
  minConfluenceScore: number;
  maxPositions: number;
}

// Backtest Result
export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  maxDrawdown: number;
  expectancy: number;
  profitFactor: number;
  sharpeRatio?: number;
  trades: BacktestTradeResult[];
}

// Backtest Trade Result
export interface BacktestTradeResult {
  symbol: string;
  direction: TradeDirection;
  entryTime: Date;
  exitTime: Date;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit?: number;
  pnl: number;
  result: TradeResult;
  holdTime: number;
  setupType?: string;
  setupScore?: number;
}

// System Log Entry
export interface SystemLogEntry {
  id?: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, unknown>;
  symbol?: string;
}

// Dashboard Stats
export interface DashboardStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  todayPnL: number;
  openPositions: number;
  currentCapital: number;
  maxDrawdown: number;
  expectancy: number;
}

// Chart Data Point
export interface ChartDataPoint {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Chart Annotation
export interface ChartAnnotation {
  type: 'swing' | 'structure' | 'ob' | 'fvg' | 'liq';
  timestamp: Date;
  price: number;
  label: string;
  color: string;
  direction?: MarketDirection;
}

// API Response Wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
