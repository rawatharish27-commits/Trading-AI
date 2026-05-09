/**
 * Automation API Route
 * Runs directly on port 3000 (main Next.js app)
 * 
 * Schedule: Daily at 10:00 AM IST (lazy scheduler - checks on requests)
 * 
 * Endpoints:
 * - GET /api/automation?action=status - Get system status
 * - GET /api/automation?action=check - Check and run if needed
 * - POST /api/automation - Run automation manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runDailyAutomation, updateData, generateSignals, saveSignalsToDB, trackSignals, updateLearning } from '@/lib/trading/automation';
import { checkAndRunAutomation, getISTTimeInfo } from '@/lib/trading/scheduler';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  
  try {
    if (action === 'status') {
      const totalStocks = await db.stock.count();
      const stocksWithData = await db.stock.count({ where: { dailyCandles: { some: {} } } });
      const totalCandles = await db.dailyCandle.count();
      const totalSignals = await db.tradeSignal.count();
      const pendingSignals = await db.tradeSignal.count({ where: { status: 'PENDING' } });
      const successSignals = await db.tradeSignal.count({ where: { status: 'SUCCESS' } });
      const lossSignals = await db.tradeSignal.count({ where: { status: 'LOSS' } });
      const lastRun = await db.analysisRun.findFirst({ orderBy: { startedAt: 'desc' } });
      
      const timeInfo = getISTTimeInfo();
      
      return NextResponse.json({
        success: true,
        schedule: 'Daily at 10:00 AM IST',
        currentTime: timeInfo.currentTime,
        isPast10AM: timeInfo.isPast10AM,
        todayDate: timeInfo.todayDate,
        database: {
          totalStocks,
          stocksWithData,
          totalCandles,
        },
        signals: {
          total: totalSignals,
          pending: pendingSignals,
          success: successSignals,
          loss: lossSignals,
          successRate: (successSignals + lossSignals) > 0 ? ((successSignals / (successSignals + lossSignals)) * 100).toFixed(1) : 0,
        },
        lastRun: lastRun ? {
          id: lastRun.id,
          status: lastRun.status,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
          signalsGenerated: lastRun.signalsGenerated,
          durationMs: lastRun.durationMs,
        } : null,
      });
    }
    
    if (action === 'check') {
      // Check and run automation if needed (lazy scheduler)
      const result = await checkAndRunAutomation();
      return NextResponse.json({
        success: true,
        ...result,
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: status, check',
      usage: {
        getStatus: 'GET /api/automation?action=status',
        checkAndRun: 'GET /api/automation?action=check (runs if past 10 AM and not run today)',
        runManually: 'POST /api/automation with body: { "action": "run-all" }',
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    
    switch (action) {
      case 'run-all': {
        const result = await runDailyAutomation();
        return NextResponse.json({
          success: result.success,
          message: result.success ? 'Automation completed successfully' : 'Automation failed',
          result,
        });
      }
      
      case 'update-data': {
        const result = await updateData();
        return NextResponse.json({ success: true, result });
      }
      
      case 'generate-signals': {
        const signals = await generateSignals();
        const saved = await saveSignalsToDB(signals);
        return NextResponse.json({ success: true, signalsGenerated: saved });
      }
      
      case 'track-signals': {
        const result = await trackSignals();
        return NextResponse.json({ success: true, result });
      }
      
      case 'update-learning': {
        const analyzed = await updateLearning();
        return NextResponse.json({ success: true, analyzed });
      }
      
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action',
          availableActions: ['run-all', 'update-data', 'generate-signals', 'track-signals', 'update-learning'],
        });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
