// AI Agent - Risk Manager Agent
// Manages position sizing and risk controls

import { 
  RiskState, 
  RiskConfigData, 
  TradeSetup, 
  TradeDirection,
  Trade 
} from '../types';

export const DEFAULT_RISK_CONFIG: RiskConfigData = {
  maxRiskPerTrade: 1.0,      // 1% per trade
  maxDailyLoss: 3.0,         // 3% daily loss limit
  maxWeeklyLoss: 6.0,        // 6% weekly loss limit
  maxDrawdown: 10.0,         // 10% max drawdown
  maxTradesPerDay: 3,        // Max 3 trades per day
  maxOpenPositions: 3,       // Max 3 open positions
  maxCorrelatedPos: 1,       // Max 1 correlated position
  minRiskReward: 1.5,        // Min 1.5:1 R:R
  tradingStartTime: '09:15',
  tradingEndTime: '15:30',
  noTradeDays: [6, 0]        // Saturday, Sunday
};

/**
 * Calculate position size based on risk
 */
export function calculatePositionSize(
  capital: number,
  entryPrice: number,
  stopLoss: number,
  riskPercent: number = DEFAULT_RISK_CONFIG.maxRiskPerTrade
): number {
  const riskAmount = capital * (riskPercent / 100);
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  
  if (riskPerShare === 0) return 0;
  
  const positionSize = Math.floor(riskAmount / riskPerShare);
  return positionSize;
}

/**
 * Calculate risk amount in currency
 */
export function calculateRiskAmount(
  capital: number,
  riskPercent: number
): number {
  return capital * (riskPercent / 100);
}

/**
 * Check if trade is allowed based on risk rules
 */
export function checkTradeAllowed(
  setup: TradeSetup,
  riskState: RiskState,
  config: RiskConfigData = DEFAULT_RISK_CONFIG
): { allowed: boolean; reason?: string } {
  // Check daily loss limit
  if (riskState.dailyLoss >= config.maxDailyLoss) {
    return { allowed: false, reason: 'Daily loss limit reached' };
  }

  // Check weekly loss limit
  const weeklyLossPercent = ((riskState.startingCapital - riskState.currentCapital) / riskState.startingCapital) * 100;
  if (weeklyLossPercent >= config.maxWeeklyLoss) {
    return { allowed: false, reason: 'Weekly loss limit reached' };
  }

  // Check max drawdown
  if (weeklyLossPercent >= config.maxDrawdown) {
    return { allowed: false, reason: 'Max drawdown reached - trading halted' };
  }

  // Check daily trade limit
  if (riskState.dailyTrades >= config.maxTradesPerDay) {
    return { allowed: false, reason: 'Daily trade limit reached' };
  }

  // Check open positions
  if (riskState.openPositions >= config.maxOpenPositions) {
    return { allowed: false, reason: 'Max open positions reached' };
  }

  // Check risk/reward
  if (setup.riskReward && setup.riskReward < config.minRiskReward) {
    return { allowed: false, reason: `Risk/Reward below minimum (${setup.riskReward.toFixed(2)} < ${config.minRiskReward})` };
  }

  // Check trading hours
  if (!isWithinTradingHours(config)) {
    return { allowed: false, reason: 'Outside trading hours' };
  }

  // Check trading day
  if (!isTradingDay(config)) {
    return { allowed: false, reason: 'Non-trading day' };
  }

  // Check if already halted
  if (riskState.tradingHalted) {
    return { allowed: false, reason: riskState.haltReason || 'Trading halted' };
  }

  return { allowed: true };
}

/**
 * Check if within trading hours
 */
export function isWithinTradingHours(config: RiskConfigData): boolean {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  
  return currentTime >= config.tradingStartTime && currentTime <= config.tradingEndTime;
}

/**
 * Check if today is a trading day
 */
export function isTradingDay(config: RiskConfigData): boolean {
  const dayOfWeek = new Date().getDay();
  return !config.noTradeDays.includes(dayOfWeek);
}

/**
 * Update risk state after trade
 */
export function updateRiskState(
  state: RiskState,
  trade: Trade,
  isOpening: boolean
): RiskState {
  const newState = { ...state };

  if (isOpening) {
    newState.dailyTrades += 1;
    newState.openPositions += 1;
  } else {
    newState.openPositions -= 1;
    
    if (trade.pnl) {
      newState.currentCapital += trade.pnl;
      newState.dailyPnL += trade.pnl;
      
      if (trade.pnl < 0) {
        newState.dailyLoss += Math.abs(trade.pnl);
      }
    }
  }

  // Check if limits hit
  const dailyLossPercent = (newState.dailyLoss / newState.startingCapital) * 100;
  
  if (dailyLossPercent >= DEFAULT_RISK_CONFIG.maxDailyLoss) {
    newState.dailyLossLimit = true;
    newState.tradingHalted = true;
    newState.haltReason = 'Daily loss limit reached';
  }

  if (newState.dailyTrades >= DEFAULT_RISK_CONFIG.maxTradesPerDay) {
    newState.tradeLimitHit = true;
  }

  return newState;
}

/**
 * Initialize daily risk state
 */
export function initializeRiskState(capital: number): RiskState {
  return {
    startingCapital: capital,
    currentCapital: capital,
    dailyPnL: 0,
    dailyLoss: 0,
    dailyTrades: 0,
    openPositions: 0,
    dailyLossLimit: false,
    tradeLimitHit: false,
    tradingHalted: false
  };
}

/**
 * Calculate max loss allowed for the day
 */
export function getMaxDailyLoss(
  capital: number,
  config: RiskConfigData = DEFAULT_RISK_CONFIG
): number {
  return capital * (config.maxDailyLoss / 100);
}

/**
 * Calculate remaining risk capacity
 */
export function getRemainingRiskCapacity(
  state: RiskState,
  config: RiskConfigData = DEFAULT_RISK_CONFIG
): { percent: number; amount: number } {
  const maxDailyLoss = state.startingCapital * (config.maxDailyLoss / 100);
  const remaining = maxDailyLoss - state.dailyLoss;
  const percent = (remaining / state.startingCapital) * 100;
  
  return {
    percent: Math.max(0, percent),
    amount: Math.max(0, remaining)
  };
}

/**
 * Calculate potential PnL
 */
export function calculatePotentialPnL(
  entryPrice: number,
  quantity: number,
  direction: TradeDirection,
  exitPrice: number
): number {
  const multiplier = direction === TradeDirection.LONG ? 1 : -1;
  return multiplier * (exitPrice - entryPrice) * quantity;
}

/**
 * Risk assessment for a setup
 */
export interface RiskAssessment {
  riskAmount: number;
  rewardAmount: number;
  positionSize: number;
  riskPercentOfCapital: number;
  maxLossPercent: number;
  potentialGainPercent: number;
}

export function assessRisk(
  setup: TradeSetup,
  capital: number,
  config: RiskConfigData = DEFAULT_RISK_CONFIG
): RiskAssessment {
  const entryPrice = setup.entryPrice || 0;
  const stopLoss = setup.stopLoss || 0;
  const takeProfit = setup.takeProfit || 0;

  const riskPerShare = Math.abs(entryPrice - stopLoss);
  const rewardPerShare = Math.abs(takeProfit - entryPrice);

  const positionSize = calculatePositionSize(capital, entryPrice, stopLoss, config.maxRiskPerTrade);
  
  const riskAmount = riskPerShare * positionSize;
  const rewardAmount = rewardPerShare * positionSize;

  return {
    riskAmount,
    rewardAmount,
    positionSize,
    riskPercentOfCapital: (riskAmount / capital) * 100,
    maxLossPercent: (riskAmount / capital) * 100,
    potentialGainPercent: (rewardAmount / capital) * 100
  };
}

/**
 * Emergency stop check
 */
export function checkEmergencyStop(
  state: RiskState,
  config: RiskConfigData = DEFAULT_RISK_CONFIG
): { stop: boolean; reason?: string } {
  // Check drawdown
  const drawdown = ((state.startingCapital - state.currentCapital) / state.startingCapital) * 100;
  
  if (drawdown >= config.maxDrawdown) {
    return { stop: true, reason: `Max drawdown reached: ${drawdown.toFixed(1)}%` };
  }

  // Check consecutive losses
  if (state.dailyLossLimit) {
    return { stop: true, reason: 'Daily loss limit triggered' };
  }

  return { stop: false };
}
