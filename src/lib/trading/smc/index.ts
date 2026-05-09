// SMC Engine - Main Entry Point
// Exports all SMC modules for unified access

export * from './swing';
export * from './structure';
export * from './liquidity';
export * from './orderblock';
export * from './fvg';
export * from './confluence';
export * from './regime';

import { Candle, Swing, StructurePoint, LiquidityZone, OrderBlock, FairValueGap, MarketRegimeData, TradeSetup, MarketDirection } from '../types';
import { detectSwings } from './swing';
import { detectStructure, detectBOS, detectCHoCH, getTrendDirection } from './structure';
import { detectLiquidity } from './liquidity';
import { detectOrderBlocks } from './orderblock';
import { detectFVG } from './fvg';
import { calculateConfluence, generateTradeSetup } from './confluence';
import { detectRegime } from './regime';

export interface SMCAnalysisResult {
  swings: Swing[];
  structures: StructurePoint[];
  liquidityZones: LiquidityZone[];
  orderBlocks: OrderBlock[];
  fvgs: FairValueGap[];
  regime: MarketRegimeData;
  trend: MarketDirection;
  tradeSetup: TradeSetup | null;
}

/**
 * Complete SMC Analysis
 * Runs all SMC modules and returns comprehensive analysis
 */
export function runSMCAnalysis(
  symbolId: string,
  timeframe: string,
  candles: Candle[],
  htfTrend: MarketDirection = MarketDirection.NEUTRAL
): SMCAnalysisResult {
  // 1. Detect Swings
  const swings = detectSwings(candles);

  // 2. Detect Market Structure
  const basicStructures = detectStructure(swings);
  const bosPoints = detectBOS(candles, swings);
  const chochPoints = detectCHoCH(candles, swings, basicStructures);
  const structures = [...basicStructures, ...bosPoints, ...chochPoints];

  // 3. Detect Liquidity Zones
  const liquidityZones = detectLiquidity(candles, swings);

  // 4. Detect Order Blocks
  const orderBlocks = detectOrderBlocks(candles);

  // 5. Detect FVGs
  const fvgs = detectFVG(candles);

  // 6. Detect Market Regime
  const regime = detectRegime(symbolId, timeframe as any, candles);

  // 7. Determine Trend Direction
  const trend = getTrendDirection(structures);

  // 8. Generate Trade Setup if conditions met
  const tradeSetup = generateTradeSetup(
    symbolId,
    timeframe,
    candles,
    structures,
    liquidityZones,
    orderBlocks,
    fvgs,
    regime.regime as any,
    htfTrend
  );

  return {
    swings,
    structures,
    liquidityZones,
    orderBlocks,
    fvgs,
    regime,
    trend,
    tradeSetup
  };
}

/**
 * Quick SMC Signal Check
 * Returns true if there's a valid trading signal
 */
export function hasValidSignal(
  candles: Candle[],
  minConfluenceScore: number = 70
): boolean {
  const result = runSMCAnalysis('', '', candles);
  
  return result.tradeSetup !== null && 
         result.tradeSetup.confluence.totalScore >= minConfluenceScore;
}
