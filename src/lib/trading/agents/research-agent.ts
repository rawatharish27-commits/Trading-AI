// AI Agent - Research Agent
// Scans markets for trading opportunities

import { 
  ScannerResult, 
  MarketDirection, 
  MarketRegime, 
  VolumeProfile,
  Candle 
} from '../types';
import { detectRegime, calculateTrendStrength } from '../smc/regime';
import { detectSwings } from '../smc/swing';
import { detectStructure, getTrendDirection } from '../smc/structure';
import { detectLiquidity } from '../smc/liquidity';
import { calculateATR } from '../smc/regime';

export interface ResearchConfig {
  minVolume: number;
  minATR: number;
  minLiquidity: number;
  scanLimit: number;
}

const DEFAULT_CONFIG: ResearchConfig = {
  minVolume: 100000,
  minATR: 0.5,
  minLiquidity: 1,
  scanLimit: 10
};

/**
 * Scan a single symbol for opportunity
 */
export function scanSymbol(
  symbol: string,
  candles: Candle[],
  config: ResearchConfig = DEFAULT_CONFIG
): ScannerResult {
  const result: ScannerResult = {
    symbol,
    score: 0,
    reasons: [],
    trend: MarketDirection.NEUTRAL,
    regime: MarketRegime.RANGING,
    volume: VolumeProfile.NORMAL,
    lastScanned: new Date()
  };

  if (candles.length < 100) {
    return result;
  }

  // 1. Detect Regime
  const regime = detectRegime(symbol, candles[0].timeframe as any, candles);
  result.regime = regime.regime as any;

  // Skip volatile markets
  if (regime.regime === MarketRegime.VOLATILE) {
    result.reasons.push('Volatile market - avoid');
    return result;
  }

  // 2. Detect Trend
  const swings = detectSwings(candles);
  const structures = detectStructure(swings);
  const trend = getTrendDirection(structures);
  result.trend = trend;

  // Score for trend
  if (trend !== MarketDirection.NEUTRAL) {
    result.score += 20;
    result.reasons.push(`Clear ${trend.toLowerCase()} trend`);
  }

  // 3. Check Liquidity
  const liquidityZones = detectLiquidity(candles, swings);
  const unsweptLiquidity = liquidityZones.filter(z => !z.swept);

  if (unsweptLiquidity.length >= config.minLiquidity) {
    result.score += 25;
    result.reasons.push(`${unsweptLiquidity.length} liquidity zones available`);
  }

  // 4. Check Volume
  const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
  const recentVolume = candles.slice(-5).reduce((sum, c) => sum + c.volume, 0) / 5;
  
  if (recentVolume > avgVolume * 1.3) {
    result.volume = VolumeProfile.HIGH;
    result.score += 15;
    result.reasons.push('Volume expansion detected');
  } else if (recentVolume < avgVolume * 0.7) {
    result.volume = VolumeProfile.LOW;
    result.score -= 10;
    result.reasons.push('Low volume');
  }

  // 5. Check ATR (Volatility for trading)
  const atr = calculateATR(candles);
  const avgPrice = candles[candles.length - 1].close;
  const atrPercent = (atr / avgPrice) * 100;

  if (atrPercent >= config.minATR && atrPercent <= 3) {
    result.score += 15;
    result.reasons.push(`ATR: ${atrPercent.toFixed(2)}% - Good for trading`);
  } else if (atrPercent > 3) {
    result.score -= 20;
    result.reasons.push(`High ATR: ${atrPercent.toFixed(2)}% - Too volatile`);
  }

  // 6. Trend Strength
  const trendStrength = calculateTrendStrength(candles);
  if (trendStrength > 50) {
    result.score += 15;
    result.reasons.push(`Strong trend: ${trendStrength.toFixed(0)}%`);
  }

  // 7. Structure Quality
  const recentStructures = structures.slice(-5);
  const cleanStructure = recentStructures.filter(s => s.confirmed).length;
  
  if (cleanStructure >= 3) {
    result.score += 10;
    result.reasons.push('Clean market structure');
  }

  return result;
}

/**
 * Scan multiple symbols and rank by opportunity
 */
export function scanSymbols(
  symbolsData: Map<string, Candle[]>,
  config: ResearchConfig = DEFAULT_CONFIG
): ScannerResult[] {
  const results: ScannerResult[] = [];

  for (const [symbol, candles] of symbolsData) {
    const result = scanSymbol(symbol, candles, config);
    results.push(result);
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Return top results
  return results.slice(0, config.scanLimit);
}

/**
 * Get watchlist recommendations
 */
export function getWatchlistRecommendations(
  scanResults: ScannerResult[],
  minScore: number = 50
): string[] {
  return scanResults
    .filter(r => r.score >= minScore && !r.reasons.includes('Volatile market - avoid'))
    .map(r => r.symbol);
}

/**
 * Check if symbol meets trading criteria
 */
export function meetsTradingCriteria(result: ScannerResult): boolean {
  return (
    result.score >= 50 &&
    result.regime !== MarketRegime.VOLATILE &&
    result.trend !== MarketDirection.NEUTRAL &&
    !result.reasons.includes('Low volume')
  );
}

/**
 * Generate research report
 */
export function generateResearchReport(results: ScannerResult[]): string {
  const topPicks = results.slice(0, 5);
  
  let report = '# Market Research Report\n\n';
  report += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  report += '## Top Opportunities\n\n';
  
  for (let i = 0; i < topPicks.length; i++) {
    const pick = topPicks[i];
    report += `### ${i + 1}. ${pick.symbol}\n`;
    report += `- **Score:** ${pick.score}\n`;
    report += `- **Trend:** ${pick.trend}\n`;
    report += `- **Regime:** ${pick.regime}\n`;
    report += `- **Volume:** ${pick.volume}\n`;
    report += `- **Reasons:** ${pick.reasons.join(', ')}\n\n`;
  }

  const volatile = results.filter(r => r.regime === MarketRegime.VOLATILE);
  if (volatile.length > 0) {
    report += `\n## Avoid (Volatile)\n`;
    report += volatile.map(r => r.symbol).join(', ') + '\n';
  }

  return report;
}
