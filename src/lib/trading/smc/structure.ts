// SMC Engine - Market Structure Detection Module
// Detects BOS (Break of Structure), CHoCH (Change of Character), HH, HL, LH, LL

import { Swing, SwingType, StructurePoint, StructureType, MarketDirection, Candle } from '../types';

export interface StructureConfig {
  minBreakPercent: number;  // Minimum percentage break to qualify
  confirmCandles: number;   // Candles needed for confirmation
}

const DEFAULT_CONFIG: StructureConfig = {
  minBreakPercent: 0.1,
  confirmCandles: 2
};

/**
 * Detect Market Structure from Swings
 * Identifies HH, HL, LH, LL patterns
 */
export function detectStructure(
  swings: Swing[],
  config: StructureConfig = DEFAULT_CONFIG
): StructurePoint[] {
  const structures: StructurePoint[] = [];

  if (swings.length < 2) {
    return structures;
  }

  // Sort swings by timestamp
  const sortedSwings = [...swings].sort((a, b) => 
    a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Alternate between highs and lows
  let lastHigh: Swing | null = null;
  let lastLow: Swing | null = null;

  for (let i = 0; i < sortedSwings.length; i++) {
    const currentSwing = sortedSwings[i];
    const prevSwing = i > 0 ? sortedSwings[i - 1] : null;

    if (currentSwing.type === SwingType.HIGH) {
      if (lastHigh) {
        if (currentSwing.price > lastHigh.price) {
          // Higher High
          structures.push({
            symbolId: currentSwing.symbolId,
            timeframe: currentSwing.timeframe,
            timestamp: currentSwing.timestamp,
            type: StructureType.HH,
            direction: MarketDirection.BULLISH,
            price: currentSwing.price,
            swingId: currentSwing.id,
            confirmed: currentSwing.confirmed
          });
        } else {
          // Lower High
          structures.push({
            symbolId: currentSwing.symbolId,
            timeframe: currentSwing.timeframe,
            timestamp: currentSwing.timestamp,
            type: StructureType.LH,
            direction: MarketDirection.BEARISH,
            price: currentSwing.price,
            swingId: currentSwing.id,
            confirmed: currentSwing.confirmed
          });
        }
      }
      lastHigh = currentSwing;
    } else {
      if (lastLow) {
        if (currentSwing.price < lastLow.price) {
          // Lower Low
          structures.push({
            symbolId: currentSwing.symbolId,
            timeframe: currentSwing.timeframe,
            timestamp: currentSwing.timestamp,
            type: StructureType.LL,
            direction: MarketDirection.BEARISH,
            price: currentSwing.price,
            swingId: currentSwing.id,
            confirmed: currentSwing.confirmed
          });
        } else {
          // Higher Low
          structures.push({
            symbolId: currentSwing.symbolId,
            timeframe: currentSwing.timeframe,
            timestamp: currentSwing.timestamp,
            type: StructureType.HL,
            direction: MarketDirection.BULLISH,
            price: currentSwing.price,
            swingId: currentSwing.id,
            confirmed: currentSwing.confirmed
          });
        }
      }
      lastLow = currentSwing;
    }
  }

  return structures;
}

/**
 * Detect Break of Structure (BOS)
 * BOS occurs when price breaks a significant swing point
 */
export function detectBOS(
  candles: Candle[],
  swings: Swing[],
  config: StructureConfig = DEFAULT_CONFIG
): StructurePoint[] {
  const bosPoints: StructurePoint[] = [];

  if (candles.length < 5 || swings.length < 2) {
    return bosPoints;
  }

  // Get confirmed swing highs and lows
  const swingHighs = swings.filter(s => s.type === SwingType.HIGH && s.confirmed);
  const swingLows = swings.filter(s => s.type === SwingType.LOW && s.confirmed);

  // Detect bullish BOS (break above swing high)
  for (const swingHigh of swingHighs) {
    const swingIndex = candles.findIndex(c => 
      c.timestamp.getTime() === swingHigh.timestamp.getTime()
    );

    if (swingIndex === -1) continue;

    // Look for break after the swing
    for (let i = swingIndex + 1; i < candles.length; i++) {
      const candle = candles[i];
      const breakPercent = ((candle.close - swingHigh.price) / swingHigh.price) * 100;

      if (breakPercent >= config.minBreakPercent && candle.close > swingHigh.price) {
        // Check confirmation
        let confirmed = true;
        for (let j = i + 1; j < Math.min(i + 1 + config.confirmCandles, candles.length); j++) {
          if (candles[j].close < swingHigh.price) {
            confirmed = false;
            break;
          }
        }

        if (confirmed) {
          bosPoints.push({
            symbolId: candle.symbolId,
            timeframe: candle.timeframe,
            timestamp: candle.timestamp,
            type: StructureType.BOS,
            direction: MarketDirection.BULLISH,
            price: candle.close,
            brokenLevel: swingHigh.price,
            confirmed: true
          });
          break;
        }
      }
    }
  }

  // Detect bearish BOS (break below swing low)
  for (const swingLow of swingLows) {
    const swingIndex = candles.findIndex(c => 
      c.timestamp.getTime() === swingLow.timestamp.getTime()
    );

    if (swingIndex === -1) continue;

    for (let i = swingIndex + 1; i < candles.length; i++) {
      const candle = candles[i];
      const breakPercent = ((swingLow.price - candle.close) / swingLow.price) * 100;

      if (breakPercent >= config.minBreakPercent && candle.close < swingLow.price) {
        let confirmed = true;
        for (let j = i + 1; j < Math.min(i + 1 + config.confirmCandles, candles.length); j++) {
          if (candles[j].close > swingLow.price) {
            confirmed = false;
            break;
          }
        }

        if (confirmed) {
          bosPoints.push({
            symbolId: candle.symbolId,
            timeframe: candle.timeframe,
            timestamp: candle.timestamp,
            type: StructureType.BOS,
            direction: MarketDirection.BEARISH,
            price: candle.close,
            brokenLevel: swingLow.price,
            confirmed: true
          });
          break;
        }
      }
    }
  }

  return bosPoints;
}

/**
 * Detect Change of Character (CHoCH)
 * CHoCH indicates a potential trend reversal
 */
export function detectCHoCH(
  candles: Candle[],
  swings: Swing[],
  structures: StructurePoint[]
): StructurePoint[] {
  const chochPoints: StructurePoint[] = [];

  if (structures.length < 3) {
    return chochPoints;
  }

  // Sort structures by timestamp
  const sortedStructures = [...structures].sort((a, b) => 
    a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Look for CHoCH patterns
  for (let i = 2; i < sortedStructures.length; i++) {
    const current = sortedStructures[i];
    const prev1 = sortedStructures[i - 1];
    const prev2 = sortedStructures[i - 2];

    // Bullish CHoCH: After series of LLs and LHs, we get HH
    if (
      prev2.type === StructureType.LL &&
      prev1.type === StructureType.LH &&
      current.type === StructureType.HH
    ) {
      chochPoints.push({
        symbolId: current.symbolId,
        timeframe: current.timeframe,
        timestamp: current.timestamp,
        type: StructureType.CHOCH,
        direction: MarketDirection.BULLISH,
        price: current.price,
        confirmed: current.confirmed
      });
    }

    // Bearish CHoCH: After series of HHs and HLs, we get LL
    if (
      prev2.type === StructureType.HH &&
      prev1.type === StructureType.HL &&
      current.type === StructureType.LL
    ) {
      chochPoints.push({
        symbolId: current.symbolId,
        timeframe: current.timeframe,
        timestamp: current.timestamp,
        type: StructureType.CHOCH,
        direction: MarketDirection.BEARISH,
        price: current.price,
        confirmed: current.confirmed
      });
    }
  }

  return chochPoints;
}

/**
 * Determine current market trend direction
 */
export function getTrendDirection(structures: StructurePoint[]): MarketDirection {
  if (structures.length < 2) {
    return MarketDirection.NEUTRAL;
  }

  const recentStructures = structures.slice(-4);
  let bullishCount = 0;
  let bearishCount = 0;

  for (const s of recentStructures) {
    if (s.direction === MarketDirection.BULLISH) {
      bullishCount++;
    } else if (s.direction === MarketDirection.BEARISH) {
      bearishCount++;
    }
  }

  if (bullishCount > bearishCount) {
    return MarketDirection.BULLISH;
  } else if (bearishCount > bullishCount) {
    return MarketDirection.BEARISH;
  }

  return MarketDirection.NEUTRAL;
}

/**
 * Check if structure is broken
 */
export function isStructureBroken(
  candles: Candle[],
  structure: StructurePoint
): boolean {
  const structIndex = candles.findIndex(c => 
    c.timestamp.getTime() === structure.timestamp.getTime()
  );

  if (structIndex === -1) return false;

  for (let i = structIndex + 1; i < candles.length; i++) {
    if (structure.direction === MarketDirection.BULLISH) {
      if (candles[i].close < structure.price) {
        return true;
      }
    } else {
      if (candles[i].close > structure.price) {
        return true;
      }
    }
  }

  return false;
}
