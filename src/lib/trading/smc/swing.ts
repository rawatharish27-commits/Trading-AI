// SMC Engine - Swing Detection Module
// Detects swing highs and swing lows in price data

import { Swing, SwingType, Candle } from '../types';

export interface SwingDetectionConfig {
  strength: number;  // Number of candles on each side
  confirmThreshold: number; // Candles needed to confirm swing
}

const DEFAULT_CONFIG: SwingDetectionConfig = {
  strength: 3,
  confirmThreshold: 2
};

/**
 * Detect Swing High
 * A swing high is formed when a candle's high is the highest among
 * 'n' candles on each side
 */
export function isSwingHigh(
  candles: Candle[],
  index: number,
  strength: number = 3
): boolean {
  if (index < strength || index >= candles.length - strength) {
    return false;
  }

  const currentHigh = candles[index].high;

  for (let i = index - strength; i <= index + strength; i++) {
    if (i !== index && candles[i].high >= currentHigh) {
      return false;
    }
  }

  return true;
}

/**
 * Detect Swing Low
 * A swing low is formed when a candle's low is the lowest among
 * 'n' candles on each side
 */
export function isSwingLow(
  candles: Candle[],
  index: number,
  strength: number = 3
): boolean {
  if (index < strength || index >= candles.length - strength) {
    return false;
  }

  const currentLow = candles[index].low;

  for (let i = index - strength; i <= index + strength; i++) {
    if (i !== index && candles[i].low <= currentLow) {
      return false;
    }
  }

  return true;
}

/**
 * Detect all swings in candle data
 */
export function detectSwings(
  candles: Candle[],
  config: SwingDetectionConfig = DEFAULT_CONFIG
): Swing[] {
  const swings: Swing[] = [];
  const { strength, confirmThreshold } = config;

  if (candles.length < 2 * strength + 1) {
    return swings;
  }

  for (let i = strength; i < candles.length - strength; i++) {
    const candle = candles[i];

    if (isSwingHigh(candles, i, strength)) {
      const confirmed = isSwingConfirmed(candles, i, SwingType.HIGH, confirmThreshold);
      
      swings.push({
        symbolId: candle.symbolId,
        timeframe: candle.timeframe,
        timestamp: candle.timestamp,
        type: SwingType.HIGH,
        price: candle.high,
        strength: strength,
        confirmed: confirmed
      });
    }

    if (isSwingLow(candles, i, strength)) {
      const confirmed = isSwingConfirmed(candles, i, SwingType.LOW, confirmThreshold);
      
      swings.push({
        symbolId: candle.symbolId,
        timeframe: candle.timeframe,
        timestamp: candle.timestamp,
        type: SwingType.LOW,
        price: candle.low,
        strength: strength,
        confirmed: confirmed
      });
    }
  }

  return swings;
}

/**
 * Check if a swing is confirmed by subsequent price action
 */
function isSwingConfirmed(
  candles: Candle[],
  swingIndex: number,
  swingType: SwingType,
  threshold: number
): boolean {
  const swingCandle = candles[swingIndex];
  let confirmCount = 0;

  for (let i = swingIndex + 1; i < candles.length; i++) {
    if (swingType === SwingType.HIGH) {
      if (candles[i].close < swingCandle.low) {
        confirmCount++;
      }
    } else {
      if (candles[i].close > swingCandle.high) {
        confirmCount++;
      }
    }

    if (confirmCount >= threshold) {
      return true;
    }
  }

  return false;
}

/**
 * Get the most recent swing of a specific type
 */
export function getRecentSwing(
  swings: Swing[],
  type: SwingType,
  confirmed: boolean = true
): Swing | null {
  const filteredSwings = swings.filter(s => 
    s.type === type && (!confirmed || s.confirmed)
  );

  if (filteredSwings.length === 0) {
    return null;
  }

  return filteredSwings[filteredSwings.length - 1];
}

/**
 * Get swings within a price range
 */
export function getSwingsInRange(
  swings: Swing[],
  fromPrice: number,
  toPrice: number
): Swing[] {
  const minPrice = Math.min(fromPrice, toPrice);
  const maxPrice = Math.max(fromPrice, toPrice);

  return swings.filter(s => s.price >= minPrice && s.price <= maxPrice);
}
