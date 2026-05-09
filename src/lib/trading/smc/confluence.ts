// SMC Engine - Confluence Engine Module
// Combines all SMC signals to generate trade scores

import { 
  Candle, 
  ConfluenceData, 
  LiquidityZone, 
  OrderBlock, 
  FairValueGap, 
  StructurePoint,
  MarketDirection,
  TradeDirection,
  TradeSetup,
  LiquidityType,
  OrderBlockType,
  FVGType,
  StructureType,
  MarketRegime
} from '../types';
import { detectLiquiditySweep } from './liquidity';

export interface ConfluenceConfig {
  liquidityScore: number;    // Points for liquidity sweep
  bosScore: number;          // Points for BOS
  obScore: number;           // Points for OB touch
  fvgScore: number;          // Points for FVG
  volumeScore: number;       // Points for volume spike
  minTotalScore: number;     // Minimum score to generate signal
}

const DEFAULT_CONFIG: ConfluenceConfig = {
  liquidityScore: 30,
  bosScore: 25,
  obScore: 25,
  fvgScore: 10,
  volumeScore: 10,
  minTotalScore: 70
};

/**
 * Calculate confluence score for a trade setup
 */
export function calculateConfluence(
  candles: Candle[],
  currentPrice: number,
  direction: TradeDirection,
  structures: StructurePoint[],
  liquidityZones: LiquidityZone[],
  orderBlocks: OrderBlock[],
  fvgs: FairValueGap[],
  config: ConfluenceConfig = DEFAULT_CONFIG
): ConfluenceData {
  const confluence: ConfluenceData = {
    liquiditySweep: false,
    liquidityScore: 0,
    bos: false,
    bosScore: 0,
    orderBlockTouch: false,
    obScore: 0,
    fvgPresent: false,
    fvgScore: 0,
    volumeSpike: false,
    volumeScore: 0,
    totalScore: 0
  };

  // 1. Check Liquidity Sweep
  const sweepResult = detectLiquiditySweep(candles, liquidityZones);
  if (sweepResult.swept && sweepResult.zone) {
    const isValidSweep = (
      (direction === TradeDirection.LONG && sweepResult.direction === 'BULLISH') ||
      (direction === TradeDirection.SHORT && sweepResult.direction === 'BEARISH')
    );
    
    if (isValidSweep) {
      confluence.liquiditySweep = true;
      confluence.liquidityScore = config.liquidityScore;
    }
  }

  // 2. Check BOS
  const recentBOS = findRecentBOS(structures, direction);
  if (recentBOS) {
    confluence.bos = true;
    confluence.bosScore = config.bosScore;
  }

  // 3. Check Order Block Touch
  const obTouch = checkOrderBlockTouch(currentPrice, direction, orderBlocks);
  if (obTouch) {
    confluence.orderBlockTouch = true;
    confluence.obScore = config.obScore;
  }

  // 4. Check FVG
  const fvgPresent = checkFVGPresence(currentPrice, direction, fvgs);
  if (fvgPresent) {
    confluence.fvgPresent = true;
    confluence.fvgScore = config.fvgScore;
  }

  // 5. Check Volume Spike
  const volumeSpike = checkVolumeSpike(candles);
  if (volumeSpike) {
    confluence.volumeSpike = true;
    confluence.volumeScore = config.volumeScore;
  }

  // Calculate total score
  confluence.totalScore = 
    confluence.liquidityScore +
    confluence.bosScore +
    confluence.obScore +
    confluence.fvgScore +
    confluence.volumeScore;

  return confluence;
}

/**
 * Find recent BOS that aligns with trade direction
 */
function findRecentBOS(
  structures: StructurePoint[],
  direction: TradeDirection
): StructurePoint | null {
  const recentStructures = structures
    .filter(s => s.type === StructureType.BOS && s.confirmed)
    .slice(-5);

  for (const s of recentStructures) {
    if (
      (direction === TradeDirection.LONG && s.direction === MarketDirection.BULLISH) ||
      (direction === TradeDirection.SHORT && s.direction === MarketDirection.BEARISH)
    ) {
      return s;
    }
  }

  return null;
}

/**
 * Check if price is touching a relevant order block
 */
function checkOrderBlockTouch(
  price: number,
  direction: TradeDirection,
  orderBlocks: OrderBlock[]
): OrderBlock | null {
  const relevantOBs = orderBlocks.filter(ob => 
    !ob.mitagated &&
    (
      (direction === TradeDirection.LONG && ob.type === OrderBlockType.BULLISH) ||
      (direction === TradeDirection.SHORT && ob.type === OrderBlockType.BEARISH)
    )
  );

  for (const ob of relevantOBs) {
    if (price >= ob.lowPrice && price <= ob.highPrice) {
      return ob;
    }
  }

  return null;
}

/**
 * Check if price is in a relevant FVG
 */
function checkFVGPresence(
  price: number,
  direction: TradeDirection,
  fvgs: FairValueGap[]
): FairValueGap | null {
  const relevantFVGs = fvgs.filter(fvg => 
    !fvg.filled &&
    (
      (direction === TradeDirection.LONG && fvg.type === FVGType.BULLISH) ||
      (direction === TradeDirection.SHORT && fvg.type === FVGType.BEARISH)
    )
  );

  for (const fvg of relevantFVGs) {
    if (price >= fvg.gapBottom && price <= fvg.gapTop) {
      return fvg;
    }
  }

  return null;
}

/**
 * Check for volume spike in recent candles
 */
function checkVolumeSpike(candles: Candle[]): boolean {
  if (candles.length < 20) return false;

  const recentCandles = candles.slice(-5);
  const historicalCandles = candles.slice(-25, -5);

  const avgVolume = historicalCandles.reduce((sum, c) => sum + c.volume, 0) / historicalCandles.length;

  for (const candle of recentCandles) {
    if (candle.volume > avgVolume * 1.5) {
      return true;
    }
  }

  return false;
}

/**
 * Generate trade setup from confluence
 */
export function generateTradeSetup(
  symbolId: string,
  timeframe: string,
  candles: Candle[],
  structures: StructurePoint[],
  liquidityZones: LiquidityZone[],
  orderBlocks: OrderBlock[],
  fvgs: FairValueGap[],
  regime: MarketRegime,
  htfBias: MarketDirection,
  config: ConfluenceConfig = DEFAULT_CONFIG
): TradeSetup | null {
  const currentCandle = candles[candles.length - 1];
  const currentPrice = currentCandle.close;

  // Determine potential direction based on HTF bias
  const direction = htfBias === MarketDirection.BULLISH 
    ? TradeDirection.LONG 
    : htfBias === MarketDirection.BEARISH 
      ? TradeDirection.SHORT 
      : null;

  if (!direction) return null;

  // Calculate confluence
  const confluence = calculateConfluence(
    candles,
    currentPrice,
    direction,
    structures,
    liquidityZones,
    orderBlocks,
    fvgs,
    config
  );

  // Check if meets minimum score
  if (confluence.totalScore < config.minTotalScore) {
    return null;
  }

  // Calculate entry, SL, TP
  const { entry, stopLoss, takeProfit, riskReward } = calculateTradeLevels(
    currentPrice,
    direction,
    structures,
    orderBlocks,
    liquidityZones
  );

  return {
    symbolId,
    timeframe: timeframe as any,
    timestamp: new Date(),
    direction,
    confluence,
    htfBias,
    mtfStructure: structures[structures.length - 1]?.type,
    regime,
    entryPrice: entry,
    stopLoss,
    takeProfit,
    riskReward,
    status: 'PENDING' as any
  };
}

/**
 * Calculate trade entry, stop loss, and take profit levels
 */
function calculateTradeLevels(
  currentPrice: number,
  direction: TradeDirection,
  structures: StructurePoint[],
  orderBlocks: OrderBlock[],
  liquidityZones: LiquidityZone[]
): { entry: number; stopLoss: number; takeProfit: number; riskReward: number } {
  let entry = currentPrice;
  let stopLoss: number;
  let takeProfit: number;

  if (direction === TradeDirection.LONG) {
    // Find nearest sell-side liquidity for TP
    const sellSideLiquidity = liquidityZones
      .filter(z => z.type === LiquidityType.SELL_SIDE && !z.swept && z.priceLevel < currentPrice)
      .sort((a, b) => b.priceLevel - a.priceLevel)[0];

    // Find nearest buy-side liquidity for SL
    const buySideLiquidity = liquidityZones
      .filter(z => z.type === LiquidityType.BUY_SIDE && z.priceLevel > currentPrice)
      .sort((a, b) => a.priceLevel - b.priceLevel)[0];

    // Use structure for SL
    const recentLow = structures
      .filter(s => s.type === StructureType.HL || s.type === StructureType.LL)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    stopLoss = buySideLiquidity?.priceLevel || recentLow?.price || currentPrice * 0.98;
    stopLoss = Math.min(stopLoss, currentPrice * 0.98); // Max 2% risk

    takeProfit = sellSideLiquidity?.priceLevel || currentPrice + (currentPrice - stopLoss) * 2;

  } else {
    // SHORT direction
    const buySideLiquidity = liquidityZones
      .filter(z => z.type === LiquidityType.BUY_SIDE && !z.swept && z.priceLevel > currentPrice)
      .sort((a, b) => a.priceLevel - b.priceLevel)[0];

    const sellSideLiquidity = liquidityZones
      .filter(z => z.type === LiquidityType.SELL_SIDE && z.priceLevel < currentPrice)
      .sort((a, b) => b.priceLevel - a.priceLevel)[0];

    const recentHigh = structures
      .filter(s => s.type === StructureType.HH || s.type === StructureType.LH)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    stopLoss = sellSideLiquidity?.priceLevel || recentHigh?.price || currentPrice * 1.02;
    stopLoss = Math.max(stopLoss, currentPrice * 1.02);

    takeProfit = buySideLiquidity?.priceLevel || currentPrice - (stopLoss - currentPrice) * 2;
  }

  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  const riskReward = reward / risk;

  return { entry, stopLoss, takeProfit, riskReward };
}

/**
 * Check if setup is valid
 */
export function isSetupValid(setup: TradeSetup): { valid: boolean; reason?: string } {
  // Check risk/reward
  if (setup.riskReward && setup.riskReward < 1.5) {
    return { valid: false, reason: 'Risk/Reward below 1.5' };
  }

  // Check confluence score
  if (setup.confluence.totalScore < 70) {
    return { valid: false, reason: 'Confluence score below 70' };
  }

  // Check HTF alignment
  if (setup.htfBias === MarketDirection.NEUTRAL) {
    return { valid: false, reason: 'No clear HTF bias' };
  }

  return { valid: true };
}

/**
 * Get confluence breakdown for display
 */
export function getConfluenceBreakdown(confluence: ConfluenceData): string[] {
  const breakdown: string[] = [];

  if (confluence.liquiditySweep) {
    breakdown.push(`✓ Liquidity Sweep (+${confluence.liquidityScore})`);
  }

  if (confluence.bos) {
    breakdown.push(`✓ Break of Structure (+${confluence.bosScore})`);
  }

  if (confluence.orderBlockTouch) {
    breakdown.push(`✓ Order Block Touch (+${confluence.obScore})`);
  }

  if (confluence.fvgPresent) {
    breakdown.push(`✓ Fair Value Gap (+${confluence.fvgScore})`);
  }

  if (confluence.volumeSpike) {
    breakdown.push(`✓ Volume Spike (+${confluence.volumeScore})`);
  }

  return breakdown;
}
