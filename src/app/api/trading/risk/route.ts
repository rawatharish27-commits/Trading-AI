import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { 
  calculatePositionSize, 
  checkTradeAllowed, 
  initializeRiskState,
  updateRiskState,
  DEFAULT_RISK_CONFIG 
} from '@/lib/trading/agents/risk-agent';
import { TradeSetup, TradeDirection } from '@/lib/trading/types';

// Risk Management API Route
export async function GET(request: NextRequest) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get or create today's risk state
    let riskState = await db.dailyRiskState.findUnique({
      where: { date: today }
    });

    if (!riskState) {
      // Initialize new risk state for today
      const capital = 100000; // Default capital - should come from config
      
      // Calculate starting capital from previous trades
      const yesterdayTrades = await db.trade.findMany({
        where: {
          executedAt: { lt: today },
          status: 'CLOSED'
        }
      });
      
      const totalPnL = yesterdayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const currentCapital = capital + totalPnL;

      riskState = await db.dailyRiskState.create({
        data: {
          date: today,
          startingCapital: currentCapital,
          currentCapital,
          dailyPnL: 0,
          dailyLoss: 0,
          dailyTrades: 0,
          openPositions: 0,
          dailyLossLimit: false,
          tradeLimitHit: false,
          tradingHalted: false
        }
      });
    }

    // Get open trades count
    const openTrades = await db.trade.count({
      where: { status: 'OPEN' }
    });

    // Get today's trades count
    const todayTrades = await db.trade.count({
      where: {
        executedAt: { gte: today }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        riskState: {
          ...riskState,
          openPositions: openTrades,
          dailyTrades: todayTrades
        },
        config: DEFAULT_RISK_CONFIG,
        remainingRisk: {
          percent: DEFAULT_RISK_CONFIG.maxDailyLoss - (riskState.dailyLoss / riskState.startingCapital * 100),
          amount: (riskState.startingCapital * DEFAULT_RISK_CONFIG.maxDailyLoss / 100) - riskState.dailyLoss
        }
      }
    });
  } catch (error) {
    console.error('Risk State Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch risk state'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, setup, capital } = body;

    if (action === 'calculate_position') {
      // Calculate position size for a setup
      const { entryPrice, stopLoss, riskPercent } = body;
      
      const positionSize = calculatePositionSize(
        capital || 100000,
        entryPrice,
        stopLoss,
        riskPercent || DEFAULT_RISK_CONFIG.maxRiskPerTrade
      );

      return NextResponse.json({
        success: true,
        data: {
          positionSize,
          riskAmount: Math.abs(entryPrice - stopLoss) * positionSize,
          riskPercent: riskPercent || DEFAULT_RISK_CONFIG.maxRiskPerTrade
        }
      });
    }

    if (action === 'check_allowed') {
      // Check if a trade is allowed
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const riskState = await db.dailyRiskState.findUnique({
        where: { date: today }
      }) || initializeRiskState(capital || 100000);

      const result = checkTradeAllowed(setup as TradeSetup, riskState, DEFAULT_RISK_CONFIG);

      return NextResponse.json({
        success: true,
        data: result
      });
    }

    if (action === 'update_state') {
      // Update risk state after trade
      const { tradeId, isOpening } = body;

      const trade = await db.trade.findUnique({
        where: { id: tradeId },
        include: { symbol: true }
      });

      if (!trade) {
        return NextResponse.json({
          success: false,
          error: 'Trade not found'
        }, { status: 404 });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let riskState = await db.dailyRiskState.findUnique({
        where: { date: today }
      });

      if (!riskState) {
        riskState = await db.dailyRiskState.create({
          data: {
            date: today,
            startingCapital: 100000,
            currentCapital: 100000,
            dailyPnL: 0,
            dailyLoss: 0,
            dailyTrades: 0,
            openPositions: 0,
            dailyLossLimit: false,
            tradeLimitHit: false,
            tradingHalted: false
          }
        });
      }

      const newState = updateRiskState(riskState, trade as any, isOpening);

      riskState = await db.dailyRiskState.update({
        where: { date: today },
        data: {
          currentCapital: newState.currentCapital,
          dailyPnL: newState.dailyPnL,
          dailyLoss: newState.dailyLoss,
          dailyTrades: newState.dailyTrades,
          openPositions: newState.openPositions,
          dailyLossLimit: newState.dailyLossLimit,
          tradeLimitHit: newState.tradeLimitHit,
          tradingHalted: newState.tradingHalted,
          haltReason: newState.haltReason
        }
      });

      return NextResponse.json({
        success: true,
        data: riskState
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 });
  } catch (error) {
    console.error('Risk Action Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to perform risk action'
    }, { status: 500 });
  }
}
