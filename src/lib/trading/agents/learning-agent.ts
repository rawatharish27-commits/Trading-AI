// AI Agent - Learning Agent
// Self-improving system that learns from trade results

import { 
  LearningRecordData, 
  ProbabilityEntry, 
  TradeResult,
  MarketRegime,
  MarketDirection,
  VolumeProfile,
  TradingSession,
  Trade,
  TradeSetup 
} from '../types';

/**
 * Setup type definitions
 */
export const SETUP_TYPES = {
  OB_RETEST: 'OB_RETEST',
  LIQUIDITY_SWEEP: 'LIQUIDITY_SWEEP',
  BOS_FOLLOW: 'BOS_FOLLOW',
  FVG_FILL: 'FVG_FILL',
  CONFLUENCE: 'CONFLUENCE'
} as const;

/**
 * Create learning record from trade
 */
export function createLearningRecord(
  trade: Trade,
  setup: TradeSetup | null,
  result: TradeResult,
  holdTime: number
): LearningRecordData {
  const record: LearningRecordData = {
    tradeId: trade.id,
    setupType: determineSetupType(setup),
    trendDirection: setup?.htfBias,
    regime: setup?.regime,
    volatility: determineVolatility(trade),
    volumeProfile: determineVolumeProfile(setup),
    htfAlignment: checkHTFAlignment(setup),
    session: determineSession(trade.executedAt),
    dayOfWeek: trade.executedAt.getDay(),
    result,
    pnlPercent: trade.pnlPercent,
    holdTime,
    setupScore: setup?.confluence.totalScore
  };

  return record;
}

/**
 * Determine setup type from trade setup
 */
function determineSetupType(setup: TradeSetup | null): string {
  if (!setup) return 'UNKNOWN';

  const { confluence } = setup;

  // Priority-based classification
  if (confluence.liquiditySweep && confluence.orderBlockTouch) {
    return SETUP_TYPES.LIQUIDITY_SWEEP;
  }

  if (confluence.orderBlockTouch && confluence.bos) {
    return SETUP_TYPES.OB_RETEST;
  }

  if (confluence.bos) {
    return SETUP_TYPES.BOS_FOLLOW;
  }

  if (confluence.fvgPresent) {
    return SETUP_TYPES.FVG_FILL;
  }

  return SETUP_TYPES.CONFLUENCE;
}

/**
 * Determine volatility level from trade
 */
function determineVolatility(trade: Trade): string {
  const range = Math.abs(trade.entryPrice - trade.stopLoss);
  const rangePercent = (range / trade.entryPrice) * 100;

  if (rangePercent > 2) return 'HIGH';
  if (rangePercent < 0.5) return 'LOW';
  return 'NORMAL';
}

/**
 * Determine volume profile from setup
 */
function determineVolumeProfile(setup: TradeSetup | null): VolumeProfile {
  if (!setup) return VolumeProfile.NORMAL;

  if (setup.confluence.volumeSpike) {
    return VolumeProfile.HIGH;
  }

  return VolumeProfile.NORMAL;
}

/**
 * Check HTF alignment
 */
function checkHTFAlignment(setup: TradeSetup | null): boolean {
  if (!setup || !setup.htfBias) return false;

  // Check if trade direction aligns with HTF bias
  const isAligned = 
    (setup.direction === 'LONG' && setup.htfBias === MarketDirection.BULLISH) ||
    (setup.direction === 'SHORT' && setup.htfBias === MarketDirection.BEARISH);

  return isAligned;
}

/**
 * Determine trading session
 */
function determineSession(timestamp: Date): TradingSession {
  const hour = timestamp.getHours();
  const minute = timestamp.getMinutes();
  const time = hour * 60 + minute;

  // Market hours for Indian market (9:15 AM - 3:30 PM IST)
  if (time < 9 * 60 + 15) return TradingSession.PRE_MARKET;
  if (time < 10 * 60) return TradingSession.OPENING;
  if (time < 12 * 60) return TradingSession.MORNING;
  if (time < 14 * 60 + 30) return TradingSession.AFTERNOON;
  return TradingSession.CLOSING;
}

/**
 * Update probability table from learning records
 */
export function updateProbabilityTable(
  records: LearningRecordData[]
): ProbabilityEntry[] {
  const table = new Map<string, ProbabilityEntry>();

  for (const record of records) {
    const key = createProbabilityKey(record);
    
    const entry = table.get(key) || {
      setupType: record.setupType,
      regime: record.regime,
      trendDirection: record.trendDirection,
      volumeProfile: record.volumeProfile,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgPnl: 0,
      avgHoldTime: 0
    };

    entry.totalTrades++;
    
    if (record.result === TradeResult.WIN) {
      entry.wins++;
    } else if (record.result === TradeResult.LOSS) {
      entry.losses++;
    }

    if (record.pnlPercent) {
      entry.avgPnl = (entry.avgPnl * (entry.totalTrades - 1) + record.pnlPercent) / entry.totalTrades;
    }

    if (record.holdTime) {
      entry.avgHoldTime = (entry.avgHoldTime * (entry.totalTrades - 1) + record.holdTime) / entry.totalTrades;
    }

    entry.winRate = (entry.wins / entry.totalTrades) * 100;
    
    table.set(key, entry);
  }

  return Array.from(table.values());
}

/**
 * Create probability key from record
 */
function createProbabilityKey(record: LearningRecordData): string {
  return `${record.setupType}_${record.regime || 'ANY'}_${record.trendDirection || 'ANY'}_${record.volumeProfile || 'ANY'}`;
}

/**
 * Get probability for specific setup conditions
 */
export function getSetupProbability(
  table: ProbabilityEntry[],
  setupType: string,
  regime?: MarketRegime,
  trendDirection?: MarketDirection,
  volumeProfile?: VolumeProfile
): ProbabilityEntry | null {
  // Try exact match first
  let entry = table.find(e => 
    e.setupType === setupType &&
    e.regime === regime &&
    e.trendDirection === trendDirection &&
    e.volumeProfile === volumeProfile
  );

  if (entry) return entry;

  // Try without volume
  entry = table.find(e => 
    e.setupType === setupType &&
    e.regime === regime &&
    e.trendDirection === trendDirection
  );

  if (entry) return entry;

  // Try without trend
  entry = table.find(e => 
    e.setupType === setupType &&
    e.regime === regime
  );

  if (entry) return entry;

  // Return setup type only
  return table.find(e => e.setupType === setupType) || null;
}

/**
 * Calculate setup quality score
 */
export function calculateSetupQuality(
  table: ProbabilityEntry[],
  setupType: string,
  regime?: MarketRegime,
  trendDirection?: MarketDirection
): number {
  const probability = getSetupProbability(table, setupType, regime, trendDirection);
  
  if (!probability || probability.totalTrades < 10) {
    return 50; // Default neutral score for insufficient data
  }

  // Factor in win rate and sample size
  const winRateScore = probability.winRate;
  const sampleSizeBonus = Math.min(probability.totalTrades / 10, 10);
  
  return Math.min(winRateScore + sampleSizeBonus, 100);
}

/**
 * Get recommendations based on learning
 */
export function getLearningRecommendations(
  table: ProbabilityEntry[],
  regime: MarketRegime,
  trendDirection: MarketDirection
): { bestSetup: string; avoidSetup: string; confidence: number } {
  const relevantSetups = table.filter(e => 
    e.regime === regime &&
    e.trendDirection === trendDirection &&
    e.totalTrades >= 5
  );

  if (relevantSetups.length === 0) {
    return { 
      bestSetup: 'INSUFFICIENT_DATA', 
      avoidSetup: 'NONE',
      confidence: 0 
    };
  }

  // Sort by win rate
  relevantSetups.sort((a, b) => b.winRate - a.winRate);

  const best = relevantSetups[0];
  const worst = relevantSetups[relevantSetups.length - 1];

  return {
    bestSetup: best.setupType,
    avoidSetup: worst.winRate < 40 ? worst.setupType : 'NONE',
    confidence: Math.min(best.totalTrades, 30) / 30 * 100
  };
}

/**
 * Analyze session performance
 */
export function analyzeSessionPerformance(
  records: LearningRecordData[]
): Map<TradingSession, { winRate: number; avgPnL: number; count: number }> {
  const sessionStats = new Map<TradingSession, { wins: number; total: number; pnl: number }>();

  for (const record of records) {
    if (!record.session) continue;

    const stats = sessionStats.get(record.session) || { wins: 0, total: 0, pnl: 0 };
    
    stats.total++;
    if (record.result === TradeResult.WIN) {
      stats.wins++;
    }
    if (record.pnlPercent) {
      stats.pnl += record.pnlPercent;
    }

    sessionStats.set(record.session, stats);
  }

  const result = new Map<TradingSession, { winRate: number; avgPnL: number; count: number }>();
  
  for (const [session, stats] of sessionStats) {
    result.set(session, {
      winRate: (stats.wins / stats.total) * 100,
      avgPnL: stats.total > 0 ? stats.pnl / stats.total : 0,
      count: stats.total
    });
  }

  return result;
}

/**
 * Generate learning report
 */
export function generateLearningReport(
  table: ProbabilityEntry[],
  records: LearningRecordData[]
): string {
  let report = '# Learning Agent Report\n\n';
  report += `Total Trades Analyzed: ${records.length}\n\n`;

  // Best performing setups
  const sortedByWinRate = [...table].sort((a, b) => b.winRate - a.winRate);
  
  report += '## Top Performing Setups\n\n';
  for (let i = 0; i < Math.min(5, sortedByWinRate.length); i++) {
    const setup = sortedByWinRate[i];
    if (setup.totalTrades >= 5) {
      report += `${i + 1}. **${setup.setupType}**\n`;
      report += `   - Win Rate: ${setup.winRate.toFixed(1)}%\n`;
      report += `   - Trades: ${setup.totalTrades}\n`;
      report += `   - Avg PnL: ${setup.avgPn.toFixed(2)}%\n\n`;
    }
  }

  // Worst performing setups
  report += '\n## Avoid Setups\n\n';
  const avoidSetups = sortedByWinRate.filter(s => s.winRate < 40 && s.totalTrades >= 5);
  for (const setup of avoidSetups) {
    report += `- **${setup.setupType}**: ${setup.winRate.toFixed(1)}% win rate\n`;
  }

  // Regime analysis
  report += '\n## Regime Analysis\n\n';
  for (const regime of [MarketRegime.TRENDING, MarketRegime.RANGING]) {
    const regimeSetups = table.filter(s => s.regime === regime);
    const avgWinRate = regimeSetups.reduce((sum, s) => sum + s.winRate, 0) / regimeSetups.length || 0;
    report += `- ${regime}: ${avgWinRate.toFixed(1)}% average win rate\n`;
  }

  return report;
}
