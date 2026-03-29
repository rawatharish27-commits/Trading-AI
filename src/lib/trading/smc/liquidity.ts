// SMC Engine - Liquidity Detection Module
// Detects liquidity pools, equal highs/lows, and liquidity sweeps

import { Candle, LiquidityZone, LiquidityType, Swing, SwingType } from '../types';

export interface LiquidityConfig {
  equalThreshold: number;  // Percentage threshold for equal highs/lows
  volumeMultiplier: number; // Volume threshold for significant zones
  lookbackPeriod: number;  // Number of candles to look back
}

const DEFAULT_CONFIG: LiquidityConfig = {
  equalThreshold: 0.1,  // 0.1% difference
  volumeMultiplier: 1.5,
  lookbackPeriod: 50
};

/**
 * Detect Equal Highs (Double/Triple Tops)
 * Equal highs create liquidity pools where stop losses cluster
 */
export function detectEqualHighs(
  candles: Candle[],
  swings: Swing[],
  config: LiquidityConfig = DEFAULT_CONFIG
): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const swingHighs = swings.filter(s => s.type === SwingType.HIGH);

  if (swingHighs.length < 2) return zones;

  for (let i = 0; i < swingHighs.length - 1; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      const swing1 = swingHighs[i];
      const swing2 = swingHighs[j];

      const priceDiff = Math.abs(swing1.price - swing2.price);
      const avgPrice = (swing1.price + swing2.price) / 2;
      const percentDiff = (priceDiff / avgPrice) * 100;

      if (percentDiff <= config.equalThreshold) {
        // Check if already swept
        const swept = isZoneSwept(candles, avgPrice, swing2.timestamp, 'HIGH');

        zones.push({
          symbolId: swing1.symbolId,
          timeframe: swing1.timeframe,
          type: LiquidityType.EQUAL_HIGHS,
          priceLevel: avgPrice,
          tolerance: config.equalThreshold,
          volume: getVolumeAtLevel(candles, avgPrice),
          swept: swept,
          sweptAt: swept ? findSweepTime(candles, avgPrice, swing2.timestamp, 'HIGH') : undefined
        });
      }
    }
  }

  return zones;
}

/**
 * Detect Equal Lows (Double/Triple Bottoms)
 */
export function detectEqualLows(
  candles: Candle[],
  swings: Swing[],
  config: LiquidityConfig = DEFAULT_CONFIG
): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const swingLows = swings.filter(s => s.type === SwingType.LOW);

  if (swingLows.length < 2) return zones;

  for (let i = 0; i < swingLows.length - 1; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      const swing1 = swingLows[i];
      const swing2 = swingLows[j];

      const priceDiff = Math.abs(swing1.price - swing2.price);
      const avgPrice = (swing1.price + swing2.price) / 2;
      const percentDiff = (priceDiff / avgPrice) * 100;

      if (percentDiff <= config.equalThreshold) {
        const swept = isZoneSwept(candles, avgPrice, swing2.timestamp, 'LOW');

        zones.push({
          symbolId: swing1.symbolId,
          timeframe: swing1.timeframe,
          type: LiquidityType.EQUAL_LOWS,
          priceLevel: avgPrice,
          tolerance: config.equalThreshold,
          volume: getVolumeAtLevel(candles, avgPrice),
          swept: swept,
          sweptAt: swept ? findSweepTime(candles, avgPrice, swing2.timestamp, 'LOW') : undefined
        });
      }
    }
  }

  return zones;
}

/**
 * Detect Buy-Side Liquidity (Above swing highs)
 * Stop losses for short positions sit above swing highs
 */
export function detectBuySideLiquidity(
  candles: Candle[],
  swings: Swing[],
  config: LiquidityConfig = DEFAULT_CONFIG
): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const swingHighs = swings.filter(s => s.type === SwingType.HIGH);

  if (swingHighs.length === 0) return zones;

  // Find recent swing highs that haven't been swept
  const recentHighs = swingHighs.slice(-5);

  for (const swing of recentHighs) {
    const swept = isZoneSwept(candles, swing.price, swing.timestamp, 'HIGH');

    zones.push({
      symbolId: swing.symbolId,
      timeframe: swing.timeframe,
      type: LiquidityType.BUY_SIDE,
      priceLevel: swing.price,
      tolerance: config.equalThreshold,
      volume: swing.strength,
      swept: swept,
      sweptAt: swept ? findSweepTime(candles, swing.price, swing.timestamp, 'HIGH') : undefined
    });
  }

  return zones;
}

/**
 * Detect Sell-Side Liquidity (Below swing lows)
 * Stop losses for long positions sit below swing lows
 */
export function detectSellSideLiquidity(
  candles: Candle[],
  swings: Swing[],
  config: LiquidityConfig = DEFAULT_CONFIG
): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const swingLows = swings.filter(s => s.type === SwingType.LOW);

  if (swingLows.length === 0) return zones;

  const recentLows = swingLows.slice(-5);

  for (const swing of recentLows) {
    const swept = isZoneSwept(candles, swing.price, swing.timestamp, 'LOW');

    zones.push({
      symbolId: swing.symbolId,
      timeframe: swing.timeframe,
      type: LiquidityType.SELL_SIDE,
      priceLevel: swing.price,
      tolerance: config.equalThreshold,
      volume: swing.strength,
      swept: swept,
      sweptAt: swept ? findSweepTime(candles, swing.price, swing.timestamp, 'LOW') : undefined
    });
  }

  return zones;
}

/**
 * Detect all liquidity zones
 */
export function detectLiquidity(
  candles: Candle[],
  swings: Swing[],
  config: LiquidityConfig = DEFAULT_CONFIG
): LiquidityZone[] {
  const equalHighs = detectEqualHighs(candles, swings, config);
  const equalLows = detectEqualLows(candles, swings, config);
  const buySide = detectBuySideLiquidity(candles, swings, config);
  const sellSide = detectSellSideLiquidity(candles, swings, config);

  return [...equalHighs, ...equalLows, ...buySide, ...sellSide];
}

/**
 * Check if a liquidity zone has been swept
 */
function isZoneSwept(
  candles: Candle[],
  priceLevel: number,
  afterTime: Date,
  direction: 'HIGH' | 'LOW'
): boolean {
  const afterCandles = candles.filter(c => c.timestamp > afterTime);

  for (const candle of afterCandles) {
    if (direction === 'HIGH') {
      // Swept if price went above and closed below
      if (candle.high > priceLevel && candle.close < priceLevel) {
        return true;
      }
    } else {
      // Swept if price went below and closed above
      if (candle.low < priceLevel && candle.close > priceLevel) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Find the time when sweep occurred
 */
function findSweepTime(
  candles: Candle[],
  priceLevel: number,
  afterTime: Date,
  direction: 'HIGH' | 'LOW'
): Date | undefined {
  const afterCandles = candles.filter(c => c.timestamp > afterTime);

  for (const candle of afterCandles) {
    if (direction === 'HIGH') {
      if (candle.high > priceLevel && candle.close < priceLevel) {
        return candle.timestamp;
      }
    } else {
      if (candle.low < priceLevel && candle.close > priceLevel) {
        return candle.timestamp;
      }
    }
  }

  return undefined;
}

/**
 * Get volume at a price level
 */
function getVolumeAtLevel(candles: Candle[], priceLevel: number): number {
  let totalVolume = 0;
  const tolerance = priceLevel * 0.001; // 0.1% tolerance

  for (const candle of candles) {
    if (candle.high >= priceLevel - tolerance && candle.low <= priceLevel + tolerance) {
      totalVolume += candle.volume;
    }
  }

  return totalVolume;
}

/**
 * Detect liquidity sweep pattern (stop hunt)
 * Returns true if a sweep has just occurred
 */
export function detectLiquiditySweep(
  candles: Candle[],
  zones: LiquidityZone[],
  lookback: number = 5
): { swept: boolean; zone: LiquidityZone | null; direction: 'BULLISH' | 'BEARISH' | null } {
  if (candles.length < lookback || zones.length === 0) {
    return { swept: false, zone: null, direction: null };
  }

  const recentCandles = candles.slice(-lookback);
  const unsweptZones = zones.filter(z => !z.swept);

  for (const zone of unsweptZones) {
    for (const candle of recentCandles) {
      if (zone.type === LiquidityType.EQUAL_HIGHS || zone.type === LiquidityType.BUY_SIDE) {
        // Bullish sweep: price breaks above and closes below
        if (candle.high > zone.priceLevel && candle.close < zone.priceLevel) {
          return { swept: true, zone, direction: 'BULLISH' };
        }
      } else {
        // Bearish sweep: price breaks below and closes above
        if (candle.low < zone.priceLevel && candle.close > zone.priceLevel) {
          return { swept: true, zone, direction: 'BEARISH' };
        }
      }
    }
  }

  return { swept: false, zone: null, direction: null };
}

/**
 * Calculate liquidity strength based on touches
 */
export function calculateLiquidityStrength(
  candles: Candle[],
  zone: LiquidityZone
): number {
  let touches = 0;
  const tolerance = zone.priceLevel * (zone.tolerance / 100);

  for (const candle of candles) {
    const priceRange = Math.abs(candle.high - candle.low);
    
    if (zone.type === LiquidityType.EQUAL_HIGHS || zone.type === LiquidityType.BUY_SIDE) {
      if (Math.abs(candle.high - zone.priceLevel) <= tolerance) {
        touches++;
      }
    } else {
      if (Math.abs(candle.low - zone.priceLevel) <= tolerance) {
        touches++;
      }
    }
  }

  return Math.min(touches / 3, 1); // Normalize to 0-1
}
