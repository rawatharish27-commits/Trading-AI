// SMC Engine - Order Block Detection Module
// Detects institutional order blocks (entry zones)

import { Candle, OrderBlock, OrderBlockType, StructurePoint, StructureType, MarketDirection } from '../types';

export interface OrderBlockConfig {
  minImpulsePercent: number;  // Minimum impulse move percentage
  lookbackPeriod: number;     // Candles to look back
  maxCandlesBack: number;     // Max candles to look for OB
}

const DEFAULT_CONFIG: OrderBlockConfig = {
  minImpulsePercent: 0.5,  // 0.5% impulse move
  lookbackPeriod: 50,
  maxCandlesBack: 10
};

/**
 * Detect Bullish Order Blocks
 * A bullish OB is the last bearish candle before a strong bullish move
 */
export function detectBullishOrderBlocks(
  candles: Candle[],
  config: OrderBlockConfig = DEFAULT_CONFIG
): OrderBlock[] {
  const orderBlocks: OrderBlock[] = [];

  if (candles.length < 5) return orderBlocks;

  const avgCandleSize = calculateAverageCandleSize(candles);
  const impulseThreshold = avgCandleSize * 2;

  for (let i = 2; i < candles.length - 1; i++) {
    const candle = candles[i];
    const nextCandle = candles[i + 1];

    // Check if current candle is bearish
    const isBearish = candle.close < candle.open;

    // Check if next candle shows strong bullish impulse
    const impulse = nextCandle.close - nextCandle.open;
    const isStrongBullishImpulse = impulse > impulseThreshold;

    // Check volume spike
    const avgVolume = calculateAverageVolume(candles.slice(Math.max(0, i - 20), i));
    const volumeSpike = nextCandle.volume > avgVolume * 1.2;

    if (isBearish && isStrongBullishImpulse) {
      // Calculate OB strength based on impulse magnitude
      const strength = Math.min((impulse / avgCandleSize) / 2, 3);

      orderBlocks.push({
        symbolId: candle.symbolId,
        timeframe: candle.timeframe,
        type: OrderBlockType.BULLISH,
        highPrice: candle.high,
        lowPrice: candle.low,
        candleIndex: i,
        volume: candle.volume,
        mitagated: false,
        retested: false,
        strength: strength
      });
    }
  }

  return orderBlocks;
}

/**
 * Detect Bearish Order Blocks
 * A bearish OB is the last bullish candle before a strong bearish move
 */
export function detectBearishOrderBlocks(
  candles: Candle[],
  config: OrderBlockConfig = DEFAULT_CONFIG
): OrderBlock[] {
  const orderBlocks: OrderBlock[] = [];

  if (candles.length < 5) return orderBlocks;

  const avgCandleSize = calculateAverageCandleSize(candles);
  const impulseThreshold = avgCandleSize * 2;

  for (let i = 2; i < candles.length - 1; i++) {
    const candle = candles[i];
    const nextCandle = candles[i + 1];

    // Check if current candle is bullish
    const isBullish = candle.close > candle.open;

    // Check if next candle shows strong bearish impulse
    const impulse = candle.open - candle.close; // Use candle.open for next candle
    const bearishImpulse = nextCandle.open - nextCandle.close;
    const isStrongBearishImpulse = bearishImpulse > impulseThreshold;

    if (isBullish && isStrongBearishImpulse) {
      const strength = Math.min((bearishImpulse / avgCandleSize) / 2, 3);

      orderBlocks.push({
        symbolId: candle.symbolId,
        timeframe: candle.timeframe,
        type: OrderBlockType.BEARISH,
        highPrice: candle.high,
        lowPrice: candle.low,
        candleIndex: i,
        volume: candle.volume,
        mitagated: false,
        retested: false,
        strength: strength
      });
    }
  }

  return orderBlocks;
}

/**
 * Detect all order blocks
 */
export function detectOrderBlocks(
  candles: Candle[],
  config: OrderBlockConfig = DEFAULT_CONFIG
): OrderBlock[] {
  const bullishOBs = detectBullishOrderBlocks(candles, config);
  const bearishOBs = detectBearishOrderBlocks(candles, config);

  // Update mitigation and retest status
  const allOBs = [...bullishOBs, ...bearishOBs];
  
  for (const ob of allOBs) {
    updateOrderBlockStatus(candles, ob);
  }

  return allOBs;
}

/**
 * Update order block mitigation and retest status
 */
function updateOrderBlockStatus(candles: Candle[], ob: OrderBlock): void {
  for (let i = ob.candleIndex + 1; i < candles.length; i++) {
    const candle = candles[i];

    if (ob.type === OrderBlockType.BULLISH) {
      // Check for mitigation (price trades through OB)
      if (candle.low <= ob.lowPrice && !ob.mitagated) {
        ob.mitagated = true;
        ob.mitigatedAt = candle.timestamp;
      }

      // Check for retest (price touches OB zone and bounces)
      if (
        candle.low <= ob.highPrice &&
        candle.low >= ob.lowPrice &&
        candle.close > ob.highPrice &&
        !ob.retested
      ) {
        ob.retested = true;
        ob.retestedAt = candle.timestamp;
      }
    } else {
      // Bearish OB
      if (candle.high >= ob.highPrice && !ob.mitagated) {
        ob.mitagated = true;
        ob.mitigatedAt = candle.timestamp;
      }

      if (
        candle.high >= ob.lowPrice &&
        candle.high <= ob.highPrice &&
        candle.close < ob.lowPrice &&
        !ob.retested
      ) {
        ob.retested = true;
        ob.retestedAt = candle.timestamp;
      }
    }
  }
}

/**
 * Find order block associated with BOS
 */
export function findOBForBOS(
  candles: Candle[],
  ob: OrderBlock[],
  bos: StructurePoint
): OrderBlock | null {
  if (bos.type !== StructureType.BOS) return null;

  const bosIndex = candles.findIndex(c => 
    c.timestamp.getTime() === bos.timestamp.getTime()
  );

  if (bosIndex === -1) return null;

  // Look for OB before the BOS
  for (const orderBlock of ob) {
    if (orderBlock.candleIndex < bosIndex) {
      if (
        (bos.direction === MarketDirection.BULLISH && orderBlock.type === OrderBlockType.BULLISH) ||
        (bos.direction === MarketDirection.BEARISH && orderBlock.type === OrderBlockType.BEARISH)
      ) {
        return orderBlock;
      }
    }
  }

  return null;
}

/**
 * Check if price is in order block zone
 */
export function isPriceInOBZone(
  price: number,
  ob: OrderBlock
): boolean {
  return price >= ob.lowPrice && price <= ob.highPrice;
}

/**
 * Get nearest active order block
 */
export function getNearestOrderBlock(
  price: number,
  orderBlocks: OrderBlock[],
  type: OrderBlockType,
  includeMitigated: boolean = false
): OrderBlock | null {
  const filtered = orderBlocks.filter(ob => 
    ob.type === type && (includeMitigated || !ob.mitagated)
  );

  if (filtered.length === 0) return null;

  // Sort by distance from price
  filtered.sort((a, b) => {
    const distA = Math.min(
      Math.abs(price - a.highPrice),
      Math.abs(price - a.lowPrice)
    );
    const distB = Math.min(
      Math.abs(price - b.highPrice),
      Math.abs(price - b.lowPrice)
    );
    return distA - distB;
  });

  return filtered[0];
}

/**
 * Calculate average candle size
 */
function calculateAverageCandleSize(candles: Candle[]): number {
  if (candles.length === 0) return 0;

  const totalSize = candles.reduce((sum, c) => sum + (c.high - c.low), 0);
  return totalSize / candles.length;
}

/**
 * Calculate average volume
 */
function calculateAverageVolume(candles: Candle[]): number {
  if (candles.length === 0) return 0;

  const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);
  return totalVolume / candles.length;
}

/**
 * Get unmitigated order blocks
 */
export function getUnmitigatedOrderBlocks(orderBlocks: OrderBlock[]): OrderBlock[] {
  return orderBlocks.filter(ob => !ob.mitagated);
}

/**
 * Get retested order blocks (high probability zones)
 */
export function getRetestedOrderBlocks(orderBlocks: OrderBlock[]): OrderBlock[] {
  return orderBlocks.filter(ob => ob.retested && !ob.mitagated);
}
