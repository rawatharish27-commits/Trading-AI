// SMC Engine - Fair Value Gap (FVG) Detection Module
// Detects price imbalances that act as magnets

import { Candle, FairValueGap, FVGType } from '../types';

export interface FVGConfig {
  minGapPercent: number;   // Minimum gap size as percentage
  fillThreshold: number;   // Percentage considered filled
}

const DEFAULT_CONFIG: FVGConfig = {
  minGapPercent: 0.1,  // 0.1% minimum gap
  fillThreshold: 50    // 50% filled threshold
};

/**
 * Detect Bullish FVG
 * Forms when candle1.high < candle3.low (gap up)
 */
export function detectBullishFVG(
  candles: Candle[],
  config: FVGConfig = DEFAULT_CONFIG
): FairValueGap[] {
  const fvgs: FairValueGap[] = [];

  if (candles.length < 3) return fvgs;

  for (let i = 1; i < candles.length - 1; i++) {
    const candle1 = candles[i - 1];
    const candle3 = candles[i + 1];
    const candle2 = candles[i]; // The impulse candle

    // Bullish FVG: candle1 high < candle3 low
    if (candle1.high < candle3.low) {
      const gapTop = candle3.low;
      const gapBottom = candle1.high;
      const gapSize = gapTop - gapBottom;
      const avgPrice = (gapTop + gapBottom) / 2;
      const gapPercent = (gapSize / avgPrice) * 100;

      if (gapPercent >= config.minGapPercent) {
        const { filled, fillPercentage, filledAt } = checkFVGFill(
          candles,
          i + 1,
          gapTop,
          gapBottom,
          'BULLISH'
        );

        fvgs.push({
          symbolId: candle2.symbolId,
          timeframe: candle2.timeframe,
          type: FVGType.BULLISH,
          gapTop: gapTop,
          gapBottom: gapBottom,
          candleIndex: i,
          filled: fillPercentage >= config.fillThreshold,
          filledAt: filledAt,
          fillPercentage: fillPercentage
        });
      }
    }
  }

  return fvgs;
}

/**
 * Detect Bearish FVG
 * Forms when candle1.low > candle3.high (gap down)
 */
export function detectBearishFVG(
  candles: Candle[],
  config: FVGConfig = DEFAULT_CONFIG
): FairValueGap[] {
  const fvgs: FairValueGap[] = [];

  if (candles.length < 3) return fvgs;

  for (let i = 1; i < candles.length - 1; i++) {
    const candle1 = candles[i - 1];
    const candle3 = candles[i + 1];
    const candle2 = candles[i];

    // Bearish FVG: candle1 low > candle3 high
    if (candle1.low > candle3.high) {
      const gapTop = candle1.low;
      const gapBottom = candle3.high;
      const gapSize = gapTop - gapBottom;
      const avgPrice = (gapTop + gapBottom) / 2;
      const gapPercent = (gapSize / avgPrice) * 100;

      if (gapPercent >= config.minGapPercent) {
        const { filled, fillPercentage, filledAt } = checkFVGFill(
          candles,
          i + 1,
          gapTop,
          gapBottom,
          'BEARISH'
        );

        fvgs.push({
          symbolId: candle2.symbolId,
          timeframe: candle2.timeframe,
          type: FVGType.BEARISH,
          gapTop: gapTop,
          gapBottom: gapBottom,
          candleIndex: i,
          filled: fillPercentage >= config.fillThreshold,
          filledAt: filledAt,
          fillPercentage: fillPercentage
        });
      }
    }
  }

  return fvgs;
}

/**
 * Detect all FVGs
 */
export function detectFVG(
  candles: Candle[],
  config: FVGConfig = DEFAULT_CONFIG
): FairValueGap[] {
  const bullishFVGs = detectBullishFVG(candles, config);
  const bearishFVGs = detectBearishFVG(candles, config);

  return [...bullishFVGs, ...bearishFVGs];
}

/**
 * Check if FVG is filled
 */
function checkFVGFill(
  candles: Candle[],
  startIndex: number,
  gapTop: number,
  gapBottom: number,
  type: 'BULLISH' | 'BEARISH'
): { filled: boolean; fillPercentage: number; filledAt?: Date } {
  const gapSize = gapTop - gapBottom;
  let maxFill = 0;
  let filledAt: Date | undefined;

  for (let i = startIndex + 1; i < candles.length; i++) {
    const candle = candles[i];

    if (type === 'BULLISH') {
      // Check how much of the gap was filled from the top
      if (candle.low <= gapTop) {
        const fillAmount = Math.min(gapTop - candle.low, gapSize);
        const fillPercent = (fillAmount / gapSize) * 100;
        
        if (fillPercent > maxFill) {
          maxFill = fillPercent;
          if (fillPercent >= 50) {
            filledAt = candle.timestamp;
          }
        }
      }
    } else {
      // Bearish FVG - filled from below
      if (candle.high >= gapBottom) {
        const fillAmount = Math.min(candle.high - gapBottom, gapSize);
        const fillPercent = (fillAmount / gapSize) * 100;
        
        if (fillPercent > maxFill) {
          maxFill = fillPercent;
          if (fillPercent >= 50) {
            filledAt = candle.timestamp;
          }
        }
      }
    }
  }

  return {
    filled: maxFill >= 50,
    fillPercentage: maxFill,
    filledAt: filledAt
  };
}

/**
 * Check if price is in FVG zone
 */
export function isPriceInFVG(
  price: number,
  fvg: FairValueGap
): boolean {
  return price >= fvg.gapBottom && price <= fvg.gapTop;
}

/**
 * Get unfilled FVGs
 */
export function getUnfilledFVGs(fvgs: FairValueGap[]): FairValueGap[] {
  return fvgs.filter(f => !f.filled);
}

/**
 * Get partially filled FVGs (high probability zones)
 */
export function getPartiallyFilledFVGs(
  fvgs: FairValueGap[],
  minFill: number = 25,
  maxFill: number = 75
): FairValueGap[] {
  return fvgs.filter(f => 
    f.fillPercentage >= minFill && 
    f.fillPercentage <= maxFill
  );
}

/**
 * Find FVG near price level
 */
export function findFVGNearPrice(
  price: number,
  fvgs: FairValueGap[],
  tolerance: number = 0.1
): FairValueGap | null {
  const toleranceAmount = price * tolerance;

  for (const fvg of fvgs) {
    const midGap = (fvg.gapTop + fvg.gapBottom) / 2;
    if (Math.abs(price - midGap) <= toleranceAmount) {
      return fvg;
    }
  }

  return null;
}

/**
 * Calculate FVG strength based on size and volume
 */
export function calculateFVGStrength(
  fvg: FairValueGap,
  candles: Candle[],
  avgVolume: number
): number {
  const impulseCandle = candles[fvg.candleIndex];
  if (!impulseCandle) return 0;

  const gapSize = fvg.gapTop - fvg.gapBottom;
  const avgPrice = (fvg.gapTop + fvg.gapBottom) / 2;
  const gapPercent = (gapSize / avgPrice) * 100;

  // Volume factor (normalized)
  const volumeFactor = impulseCandle.volume / avgVolume;

  // Size factor (normalized to 0-1)
  const sizeFactor = Math.min(gapPercent / 1, 1); // 1% = max

  // Combined strength
  return Math.min((sizeFactor * 0.6 + volumeFactor * 0.4), 1);
}

/**
 * Get FVG confluence with other levels
 */
export function getFVGConfluence(
  fvg: FairValueGap,
  orderBlockZone: { high: number; low: number } | null,
  liquidityLevel: number | null
): number {
  let confluence = 0;

  // Check if FVG aligns with order block
  if (orderBlockZone) {
    const obMid = (orderBlockZone.high + orderBlockZone.low) / 2;
    const fvgMid = (fvg.gapTop + fvg.gapBottom) / 2;
    
    if (Math.abs(obMid - fvgMid) < fvg.gapTop - fvg.gapBottom) {
      confluence += 30;
    }
  }

  // Check if FVG aligns with liquidity level
  if (liquidityLevel) {
    if (liquidityLevel >= fvg.gapBottom && liquidityLevel <= fvg.gapTop) {
      confluence += 25;
    }
  }

  return confluence;
}
