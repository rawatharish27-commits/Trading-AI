// Trading System - Main Index
// Exports all trading modules

// Types
export * from './types';

// SMC Engine
export * from './smc';

// AI Agents
export * from './agents';

// SMC Modules (individual exports for advanced use)
export { detectSwings, isSwingHigh, isSwingLow } from './smc/swing';
export { detectStructure, detectBOS, detectCHoCH, getTrendDirection } from './smc/structure';
export { detectLiquidity, detectLiquiditySweep } from './smc/liquidity';
export { detectOrderBlocks, getNearestOrderBlock } from './smc/orderblock';
export { detectFVG, getUnfilledFVGs } from './smc/fvg';
export { calculateConfluence, generateTradeSetup } from './smc/confluence';
export { detectRegime, calculateATR, calculateTrendStrength } from './smc/regime';

// Agents
export { runDecisionAgent, quickDecision } from './agents/decision-agent';
export { scanSymbol, scanSymbols } from './agents/research-agent';
export { 
  calculatePositionSize, 
  checkTradeAllowed, 
  updateRiskState,
  initializeRiskState 
} from './agents/risk-agent';
export { 
  createLearningRecord, 
  updateProbabilityTable,
  getSetupProbability,
  generateLearningReport 
} from './agents/learning-agent';
