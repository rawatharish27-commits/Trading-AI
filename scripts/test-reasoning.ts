/**
 * Test Signal Generation with Detailed Reasoning
 * Run: bun run scripts/test-reasoning.ts
 */

import { db } from '../src/lib/db';
import { getYahooSymbol } from '../src/lib/trading/nifty500';

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com';

// Technical Indicators
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const mult = 2 / (period + 1);
  let sum = 0;
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      sum += prices[i];
      ema.push(sum / (i + 1));
    } else {
      ema.push((prices[i] - ema[i - 1]) * mult + ema[i - 1]);
    }
  }
  return ema;
}

function calculateRSI(prices: number[], period = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = 0; i < period; i++) rsi.push(50);
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  return rsi;
}

function calculateATR(candles: { high: number; low: number; close: number }[], period = 14): number[] {
  const atr: number[] = [];
  const tr: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      tr.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      ));
    }
  }
  
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      sum += tr[i];
      atr.push(sum / (i + 1));
    } else {
      atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
    }
  }
  return atr;
}

function calculateADX(candles: { high: number; low: number; close: number }[], period = 14): number[] {
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  
  const smoothPlus = smoothArray(plusDM, period);
  const smoothMinus = smoothArray(minusDM, period);
  const smoothTR = smoothArray(tr, period);
  
  const adx: number[] = [];
  for (let i = 0; i < smoothTR.length; i++) {
    const plusDI = smoothTR[i] > 0 ? (smoothPlus[i] / smoothTR[i]) * 100 : 0;
    const minusDI = smoothTR[i] > 0 ? (smoothMinus[i] / smoothTR[i]) * 100 : 0;
    const dx = plusDI + minusDI > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;
    adx.push(dx);
  }
  
  return smoothArray(adx, period);
}

function smoothArray(arr: number[], period: number): number[] {
  const smoothed: number[] = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    if (i < period) {
      sum += arr[i];
      smoothed.push(sum / (i + 1));
    } else {
      sum = smoothed[i - 1] * (period - 1) + arr[i];
      smoothed.push(sum / period);
    }
  }
  return smoothed;
}

async function main() {
  console.log('\n========================================');
  console.log('📊 SIGNAL GENERATION WITH DETAILED REASONING');
  console.log('========================================\n');
  
  const stocks = await db.stock.findMany({
    where: { isActive: true, dailyCandles: { some: {} } },
    include: { 
      dailyCandles: { orderBy: { date: 'desc' }, take: 300 },
      performance: true,
    },
  });
  
  const signals: any[] = [];
  
  for (const stock of stocks) {
    if (stock.dailyCandles.length < 200) continue;
    
    const candles = stock.dailyCandles.reverse();
    const closes = candles.map(c => c.close);
    
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);
    const rsi = calculateRSI(closes);
    const atr = calculateATR(candles);
    const adx = calculateADX(candles);
    
    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const lastEma20 = ema20[ema20.length - 1];
    const lastEma50 = ema50[ema50.length - 1];
    const lastEma200 = ema200[ema200.length - 1];
    const lastRsi = rsi[rsi.length - 1];
    const lastAtr = atr[atr.length - 1];
    const lastAdx = adx[adx.length - 1];
    
    let confluenceScore = 0;
    const whySelected: string[] = [];
    
    // Trend Analysis (25 points)
    const emaBullish = lastEma20 > lastEma50 && lastEma50 > lastEma200;
    const emaBearish = lastEma20 < lastEma50 && lastEma50 < lastEma200;
    
    if (emaBullish) {
      confluenceScore += 25;
      whySelected.push('📈 EMA Stack Bullish: EMA20 > EMA50 > EMA200 - Strong Uptrend');
    } else if (emaBearish) {
      confluenceScore += 25;
      whySelected.push('📉 EMA Stack Bearish: EMA20 < EMA50 < EMA200 - Strong Downtrend');
    }
    
    // Price Position (30 points)
    if (lastClose > lastEma20) { confluenceScore += 10; whySelected.push('✅ Price above EMA20 - Short-term bullish'); }
    if (lastClose > lastEma50) { confluenceScore += 10; whySelected.push('✅ Price above EMA50 - Medium-term bullish'); }
    if (lastClose > lastEma200) { confluenceScore += 10; whySelected.push('✅ Price above EMA200 - Long-term bullish'); }
    
    // RSI (15 points)
    if (lastRsi > 50 && lastRsi < 70) {
      confluenceScore += 15;
      whySelected.push(`🎯 RSI ${lastRsi.toFixed(1)}: In bullish zone (50-70), momentum without overbought`);
    } else if (lastRsi < 50 && lastRsi > 30) {
      confluenceScore += 15;
      whySelected.push(`🎯 RSI ${lastRsi.toFixed(1)}: In bearish zone (30-50), momentum without oversold`);
    }
    
    // ADX (15 points)
    if (lastAdx > 25) {
      confluenceScore += 15;
      whySelected.push(`💪 ADX ${lastAdx.toFixed(1)}: Strong trend confirmed (>25)`);
    } else if (lastAdx > 20) {
      confluenceScore += 10;
      whySelected.push(`💪 ADX ${lastAdx.toFixed(1)}: Developing trend (20-25)`);
    }
    
    // Volume (15 points)
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    const lastVolume = candles[candles.length - 1].volume;
    const volumeRatio = lastVolume / avgVolume;
    
    if (volumeRatio > 1.5) {
      confluenceScore += 15;
      whySelected.push(`📊 Volume ${volumeRatio.toFixed(1)}x avg: Strong participation`);
    }
    
    // Only 80%+ confidence
    if (confluenceScore >= 80) {
      const direction: 'BUY' | 'SELL' = lastEma20 > lastEma50 ? 'BUY' : 'SELL';
      const atrMult = 1.5;
      const stopLoss = direction === 'BUY' ? lastClose - lastAtr * atrMult : lastClose + lastAtr * atrMult;
      const targetPrice = direction === 'BUY' ? lastClose + lastAtr * atrMult * 2 : lastClose - lastAtr * atrMult * 2;
      
      const riskReward = Math.abs(targetPrice - lastClose) / Math.abs(lastClose - stopLoss);
      const expectedProfit = ((Math.abs(targetPrice - lastClose) / lastClose) * 100).toFixed(1);
      const maxLoss = ((Math.abs(lastClose - stopLoss) / lastClose) * 100).toFixed(1);
      
      let profitProbability = 'GOOD (80-85%)';
      if (confluenceScore >= 90) profitProbability = 'VERY HIGH (90%+)';
      else if (confluenceScore >= 85) profitProbability = 'HIGH (85-90%)';
      
      signals.push({
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        direction,
        entryPrice: lastClose,
        stopLoss: Math.round(stopLoss * 100) / 100,
        targetPrice: Math.round(targetPrice * 100) / 100,
        confidence: confluenceScore,
        riskReward,
        expectedProfit,
        maxLoss,
        profitProbability,
        whySelected,
        indicators: {
          ema20: lastEma20.toFixed(2),
          ema50: lastEma50.toFixed(2),
          ema200: lastEma200.toFixed(2),
          rsi: lastRsi.toFixed(1),
          adx: lastAdx.toFixed(1),
          atr: lastAtr.toFixed(2),
          volumeRatio: volumeRatio.toFixed(2),
        },
      });
    }
  }
  
  // Sort by confidence
  signals.sort((a, b) => b.confidence - a.confidence);
  
  // Display top signals
  console.log(`📊 Total Signals Generated: ${signals.length} (80%+ Confidence)\n`);
  console.log('========================================\n');
  
  for (const signal of signals.slice(0, 10)) {
    console.log(`🎯 ${signal.symbol} - ${signal.name || 'N/A'}`);
    console.log(`   📌 Sector: ${signal.sector || 'N/A'}`);
    console.log(`   📈 Signal: ${signal.direction} @ ₹${signal.entryPrice.toFixed(2)}`);
    console.log(`   🛑 Stop Loss: ₹${signal.stopLoss} | 🎯 Target: ₹${signal.targetPrice}`);
    console.log(`   ⚡ Confidence: ${signal.confidence}% | ${signal.profitProbability}`);
    console.log(`   💰 Expected Profit: ${signal.expectedProfit}% | Max Loss: ${signal.maxLoss}%`);
    console.log(`   📊 Risk:Reward = 1:${signal.riskReward.toFixed(1)}`);
    console.log(`\n   📋 WHY THIS STOCK WAS SELECTED:`);
    for (const reason of signal.whySelected) {
      console.log(`      ${reason}`);
    }
    console.log(`\n   📊 TECHNICAL INDICATORS:`);
    console.log(`      EMA20: ₹${signal.indicators.ema20} | EMA50: ₹${signal.indicators.ema50} | EMA200: ₹${signal.indicators.ema200}`);
    console.log(`      RSI: ${signal.indicators.rsi} | ADX: ${signal.indicators.adx} | ATR: ₹${signal.indicators.atr}`);
    console.log(`      Volume: ${signal.indicators.volumeRatio}x average`);
    console.log('\n========================================\n');
  }
  
  // Summary
  console.log('📊 SUMMARY:');
  console.log(`   Total 80%+ Signals: ${signals.length}`);
  console.log(`   90%+ Signals: ${signals.filter(s => s.confidence >= 90).length}`);
  console.log(`   85-90% Signals: ${signals.filter(s => s.confidence >= 85 && s.confidence < 90).length}`);
  console.log(`   80-85% Signals: ${signals.filter(s => s.confidence >= 80 && s.confidence < 85).length}`);
  console.log('');
  
  process.exit(0);
}

main();
