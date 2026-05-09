// Market Regime Detection Module
// Identifies market conditions: Trending, Ranging, Volatile

import { Candle, MarketRegime, MarketRegimeData, Timeframe } from '../types';

export interface RegimeConfig {
  atrPeriod: number;        // ATR calculation period
  emaShortPeriod: number;   // Short EMA period
  emaLongPeriod: number;    // Long EMA period
  trendThreshold: number;   // EMA spread threshold for trending
  volatilityMult: number;   // Volatility multiplier
}

const DEFAULT_CONFIG: RegimeConfig = {
  atrPeriod: 14,
  emaShortPeriod: 50,
  emaLongPeriod: 200,
  trendThreshold: 0.5,  // 0.5% EMA spread indicates trend
  volatilityMult: 1.5
};

/**
 * Calculate ATR (Average True Range)
 */
export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;

  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // Simple moving average of TR
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;

  const multiplier = 2 / (period + 1);
  
  // Start with SMA
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

  // Calculate EMA
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate trend strength based on EMA spread
 */
export function calculateTrendStrength(
  candles: Candle[],
  config: RegimeConfig = DEFAULT_CONFIG
): number {
  if (candles.length < config.emaLongPeriod) return 0;

  const closes = candles.map(c => c.close);
  const emaShort = calculateEMA(closes, config.emaShortPeriod);
  const emaLong = calculateEMA(closes, config.emaLongPeriod);

  const spread = Math.abs(emaShort - emaLong);
  const avgPrice = (emaShort + emaLong) / 2;
  const spreadPercent = (spread / avgPrice) * 100;

  // Normalize to 0-100 scale
  return Math.min(spreadPercent * 20, 100);
}

/**
 * Calculate volatility level
 */
export function calculateVolatility(
  candles: Candle[],
  config: RegimeConfig = DEFAULT_CONFIG
): number {
  const atr = calculateATR(candles, config.atrPeriod);
  const avgPrice = candles[candles.length - 1]?.close || 1;
  
  return (atr / avgPrice) * 100;
}

/**
 * Detect current market regime
 */
export function detectRegime(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
  config: RegimeConfig = DEFAULT_CONFIG
): MarketRegimeData {
  const currentCandle = candles[candles.length - 1];
  
  // Calculate metrics
  const trendStrength = calculateTrendStrength(candles, config);
  const atr = calculateATR(candles, config.atrPeriod);
  const volatility = calculateVolatility(candles, config);
  
  // Calculate EMA spread
  const closes = candles.map(c => c.close);
  const emaShort = calculateEMA(closes, config.emaShortPeriod);
  const emaLong = calculateEMA(closes, config.emaLongPeriod);
  const emaSpread = emaShort - emaLong;

  // Calculate average range
  const ranges = candles.slice(-20).map(c => c.high - c.low);
  const avgRange = ranges.reduce((sum, r) => sum + r, 0) / ranges.length;
  const currentRange = currentCandle.high - currentCandle.low;
  const rangeRatio = currentRange / avgRange;

  // Determine regime
  let regime: MarketRegime;

  // Check for volatile market first
  const historicalATR = calculateHistoricalATR(candles, config.atrPeriod, 50);
  if (atr > historicalATR * config.volatilityMult) {
    regime = MarketRegime.VOLATILE;
  }
  // Check for trending market
  else if (trendStrength > 30 && Math.abs(emaSpread) > 0) {
    regime = MarketRegime.TRENDING;
  }
  // Default to ranging
  else {
    regime = MarketRegime.RANGING;
  }

  return {
    symbol,
    timeframe,
    timestamp: currentCandle.timestamp,
    regime,
    trendStrength,
    volatility,
    atr,
    emaSpread,
    avgRange,
    rangeRatio
  };
}

/**
 * Calculate historical ATR average
 */
function calculateHistoricalATR(
  candles: Candle[],
  atrPeriod: number,
  lookback: number
): number {
  if (candles.length < atrPeriod + lookback) {
    return calculateATR(candles, atrPeriod);
  }

  const atrValues: number[] = [];
  
  for (let i = atrPeriod + 1; i < candles.length && atrValues.length < lookback; i++) {
    const slice = candles.slice(0, i);
    atrValues.push(calculateATR(slice, atrPeriod));
  }

  return atrValues.reduce((sum, atr) => sum + atr, 0) / atrValues.length;
}

/**
 * Check if conditions are suitable for trading
 */
export function isTradeable(regime: MarketRegimeData): boolean {
  // Don't trade in volatile markets
  if (regime.regime === MarketRegime.VOLATILE) {
    return false;
  }

  // Avoid trading in extreme volatility
  if (regime.volatility > 3) { // More than 3% daily ATR
    return false;
  }

  return true;
}

/**
 * Get recommended strategy for current regime
 */
export function getRecommendedStrategy(regime: MarketRegimeData): string {
  switch (regime.regime) {
    case MarketRegime.TRENDING:
      if (regime.trendStrength > 60) {
        return 'BOS_FOLLOW'; // Follow break of structure
      }
      return 'PULLBACK'; // Trade pullbacks to key levels;

    case MarketRegime.RANGING:
      return 'LIQUIDITY'; // Trade liquidity sweeps at range extremes;

    case MarketRegime.VOLATILE:
      return 'AVOID'; // Stay out of the market;

    default:
      return 'NEUTRAL';
  }
}

/**
 * Detect trend direction from regime data
 */
export function getRegimeTrend(regime: MarketRegimeData): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (regime.regime !== MarketRegime.TRENDING) {
    return 'NEUTRAL';
  }

  return regime.emaSpread && regime.emaSpread > 0 ? 'BULLISH' : 'BEARISH';
}

/**
 * Calculate ADX (Average Directional Index) for trend strength
 */
export function calculateADX(candles: Candle[], period: number = 14): number {
  if (candles.length < period * 2) return 0;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    // True Range
    tr.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    ));
  }

  // Smoothed values
  const smoothTR = smoothArray(tr, period);
  const smoothPlusDM = smoothArray(plusDM, period);
  const smoothMinusDM = smoothArray(minusDM, period);

  // Directional Index
  const plusDI = smoothPlusDM.map((dm, i) => (smoothTR[i] > 0 ? (dm / smoothTR[i]) * 100 : 0));
  const minusDI = smoothMinusDM.map((dm, i) => (smoothTR[i] > 0 ? (dm / smoothTR[i]) * 100 : 0));

  // DX
  const dx = plusDI.map((pdi, i) => {
    const total = pdi + minusDI[i];
    return total > 0 ? (Math.abs(pdi - minusDI[i]) / total) * 100 : 0;
  });

  // ADX (smoothed DX)
  return smoothArray(dx, period).pop() || 0;
}

/**
 * Smooth array using Wilder's smoothing
 */
function smoothArray(data: number[], period: number): number[] {
  if (data.length < period) return [];

  const smoothed: number[] = [];
  
  // First value is SMA
  let sum = data.slice(0, period).reduce((s, v) => s + v, 0);
  smoothed.push(sum / period);

  // Subsequent values use Wilder's smoothing
  for (let i = period; i < data.length; i++) {
    const newValue = (smoothed[smoothed.length - 1] * (period - 1) + data[i]) / period;
    smoothed.push(newValue);
  }

  return smoothed;
}

/**
 * Get regime summary for display
 */
export function getRegimeSummary(regime: MarketRegimeData): string {
  const trend = getRegimeTrend(regime);
  const strategy = getRecommendedStrategy(regime);
  
  return `Market: ${regime.regime} | Trend: ${trend} | Strategy: ${strategy} | Strength: ${regime.trendStrength.toFixed(1)}%`;
}
