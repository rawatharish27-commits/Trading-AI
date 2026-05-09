/**
 * Trading Brain - LLM-based Decision Agent
 * Uses local LLaMA model for intelligent trading decisions
 * 
 * This is the "brain" of the trading system that:
 * - Analyzes market conditions
 * - Makes trade decisions
 * - Generates reasoning for signals
 * - Learns from past trades
 * - Improves strategies
 */

import ZAI from 'z-ai-web-dev-sdk';

// ============================================
// TYPES
// ============================================

export interface MarketData {
  symbol: string;
  sector: string | null;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  avgVolume: number;
  high52w: number;
  low52w: number;
}

export interface TechnicalIndicators {
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  atr: number;
  adx: number;
  macd: { value: number; signal: number; histogram: number };
  volumeRatio: number;
}

export interface MarketContext {
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  trendStrength: number;
  regime: 'TRENDING' | 'RANGING' | 'VOLATILE';
  support: number[];
  resistance: number[];
}

export interface LLMAnalysisInput {
  symbol: string;
  marketData: MarketData;
  indicators: TechnicalIndicators;
  context: MarketContext;
  historicalPerformance?: {
    totalSignals: number;
    successRate: number;
    avgPnl: number;
  };
}

export interface LLMDecision {
  decision: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskReward: number;
  holdingDays: number;
  reasoning: string;
  keyFactors: string[];
  riskFactors: string[];
  marketOutlook: string;
}

export interface LLMLearningInput {
  symbol: string;
  decision: LLMDecision;
  result: 'SUCCESS' | 'LOSS' | 'BREAKEVEN';
  pnlPercent: number;
  maxProfit: number;
  maxLoss: number;
  daysHeld: number;
  marketConditionAtEntry: MarketContext;
  marketConditionAtExit: MarketContext;
}

export interface LLMLearningOutput {
  whatWentRight: string;
  whatWentWrong: string;
  improvementSuggestions: string[];
  patternIdentified: string;
  avoidInFuture: string[];
  doMoreOften: string[];
}

// ============================================
// TRADING BRAIN CLASS
// ============================================

class TradingBrain {
  private zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;
  private conversationHistory: Array<{ role: string; content: string }> = [];
  
  // System prompt for trading decisions
  private readonly SYSTEM_PROMPT = `You are an expert stock trader and technical analyst specializing in NSE Nifty 500 stocks. You have deep knowledge of:

1. Technical Analysis: EMA, RSI, MACD, ATR, ADX, Support/Resistance
2. Smart Money Concepts: Order blocks, liquidity zones, fair value gaps
3. Swing Trading: 3-5 day holding periods
4. Risk Management: Position sizing, stop loss placement, risk-reward ratios
5. Market Psychology: Understanding market sentiment and behavior

YOUR TRADING RULES:
- Only recommend trades with 80%+ confidence
- Minimum risk-reward ratio: 1.5:1
- Stop loss should be based on ATR (2x ATR)
- Target should be based on support/resistance (minimum 3x ATR)
- Consider market regime before recommending
- Always explain your reasoning clearly
- Be conservative - capital preservation is priority

RESPONSE FORMAT:
You must respond in valid JSON format:
{
  "decision": "BUY|SELL|HOLD",
  "confidence": <number 0-100>,
  "entryPrice": <number>,
  "stopLoss": <number>,
  "targetPrice": <number>,
  "riskReward": <number>,
  "holdingDays": <number 3-5>,
  "reasoning": "<detailed explanation>",
  "keyFactors": ["<factor1>", "<factor2>", ...],
  "riskFactors": ["<risk1>", "<risk2>", ...],
  "marketOutlook": "<short term outlook>"
}

IMPORTANT:
- If confidence < 80, decision should be HOLD
- Never recommend trades that don't meet criteria
- Always consider the broader market context
- Learn from past mistakes`;

  // Learning system prompt
  private readonly LEARNING_PROMPT = `You are a trading strategy improvement engine. Your job is to analyze past trades, identify patterns, and suggest improvements.

Analyze what worked, what didn't, and how to improve future trading decisions.

RESPONSE FORMAT (JSON):
{
  "whatWentRight": "<analysis of successful aspects>",
  "whatWentWrong": "<analysis of failures>",
  "improvementSuggestions": ["<suggestion1>", "<suggestion2>", ...],
  "patternIdentified": "<pattern description>",
  "avoidInFuture": ["<thing to avoid1>", ...],
  "doMoreOften": ["<thing to do more>", ...]
}`;

  private initialized: boolean = false;
  private useFallback: boolean = false;

  /**
   * Initialize the LLM
   */
  async initialize(): Promise<boolean> {
    try {
      this.zai = await ZAI.create();
      this.conversationHistory = [
        { role: 'assistant', content: this.SYSTEM_PROMPT }
      ];
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Trading Brain, using fallback mode:', error);
      this.initialized = true;
      this.useFallback = true;
      return true;
    }
  }

  /**
   * Analyze a stock and make a trading decision
   */
  async analyzeAndDecide(input: LLMAnalysisInput): Promise<LLMDecision> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Use fallback mode if LLM not available
    if (this.useFallback) {
      return this.getFallbackDecision(input);
    }

    const prompt = this.buildAnalysisPrompt(input);
    
    try {
      const completion = await this.zai!.chat.completions.create({
        messages: [
          { role: 'assistant', content: this.SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        thinking: { type: 'disabled' }
      });

      const response = completion.choices[0]?.message?.content || '';
      
      // Parse JSON response
      const decision = this.parseDecision(response, input);
      
      // Store in conversation history
      this.conversationHistory.push(
        { role: 'user', content: prompt },
        { role: 'assistant', content: JSON.stringify(decision) }
      );
      
      return decision;
    } catch (error) {
      console.error('LLM Analysis failed, using fallback:', error);
      return this.getFallbackDecision(input);
    }
  }

  /**
   * Learn from a completed trade
   */
  async learnFromTrade(input: LLMLearningInput): Promise<LLMLearningOutput> {
    if (!this.zai) {
      await this.initialize();
    }

    const prompt = this.buildLearningPrompt(input);
    
    try {
      const completion = await this.zai!.chat.completions.create({
        messages: [
          { role: 'assistant', content: this.LEARNING_PROMPT },
          { role: 'user', content: prompt }
        ],
        thinking: { type: 'disabled' }
      });

      const response = completion.choices[0]?.message?.content || '';
      
      return this.parseLearning(response);
    } catch (error) {
      console.error('LLM Learning failed:', error);
      return this.getDefaultLearning(input);
    }
  }

  /**
   * Batch analyze multiple stocks
   */
  async batchAnalyze(inputs: LLMAnalysisInput[]): Promise<Map<string, LLMDecision>> {
    const results = new Map<string, LLMDecision>();
    
    // Process in parallel with concurrency limit
    const batchSize = 5;
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      const decisions = await Promise.all(
        batch.map(input => this.analyzeAndDecide(input))
      );
      
      batch.forEach((input, idx) => {
        results.set(input.symbol, decisions[idx]);
      });
      
      // Small delay between batches
      if (i + batchSize < inputs.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    return results;
  }

  /**
   * Get strategy recommendation based on market conditions
   */
  async getStrategyRecommendation(
    marketConditions: { regime: string; trend: string; volatility: string },
    recentPerformance: { winRate: number; avgPnl: number }
  ): Promise<{
    strategy: string;
    positionSizeAdvice: string;
    riskLevel: string;
    recommendations: string[];
  }> {
    if (!this.zai) {
      await this.initialize();
    }

    const prompt = `Based on current market conditions and recent performance, recommend a trading strategy.

MARKET CONDITIONS:
- Regime: ${marketConditions.regime}
- Trend: ${marketConditions.trend}
- Volatility: ${marketConditions.volatility}

RECENT PERFORMANCE:
- Win Rate: ${recentPerformance.winRate.toFixed(1)}%
- Average P&L: ${recentPerformance.avgPnl.toFixed(2)}%

Recommend an appropriate trading strategy. Respond in JSON:
{
  "strategy": "<strategy name>",
  "positionSizeAdvice": "<advice>",
  "riskLevel": "<LOW|MEDIUM|HIGH>",
  "recommendations": ["<rec1>", "<rec2>", ...]
}`;

    try {
      const completion = await this.zai!.chat.completions.create({
        messages: [
          { role: 'assistant', content: 'You are a trading strategy advisor. Provide clear, actionable recommendations.' },
          { role: 'user', content: prompt }
        ],
        thinking: { type: 'disabled' }
      });

      const response = completion.choices[0]?.message?.content || '';
      return JSON.parse(response);
    } catch {
      return {
        strategy: 'Conservative swing trading',
        positionSizeAdvice: 'Reduce position sizes by 25%',
        riskLevel: 'MEDIUM',
        recommendations: ['Wait for clearer setups', 'Use tighter stop losses']
      };
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [
      { role: 'assistant', content: this.SYSTEM_PROMPT }
    ];
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private buildAnalysisPrompt(input: LLMAnalysisInput): string {
    const { symbol, marketData, indicators, context, historicalPerformance } = input;

    return `Analyze the following stock and provide a trading recommendation:

STOCK: ${symbol}
Sector: ${marketData.sector || 'Unknown'}

CURRENT MARKET DATA:
- Current Price: ₹${marketData.currentPrice.toFixed(2)}
- Price Change: ${marketData.priceChangePercent >= 0 ? '+' : ''}${marketData.priceChangePercent.toFixed(2)}%
- Volume: ${(marketData.volume / 1000000).toFixed(2)}M shares
- Volume vs Average: ${(marketData.volume / marketData.avgVolume * 100).toFixed(0)}%
- 52-Week High: ₹${marketData.high52w.toFixed(2)}
- 52-Week Low: ₹${marketData.low52w.toFixed(2)}

TECHNICAL INDICATORS:
- EMA 20: ₹${indicators.ema20.toFixed(2)} (Price ${marketData.currentPrice > indicators.ema20 ? 'above' : 'below'})
- EMA 50: ₹${indicators.ema50.toFixed(2)} (Price ${marketData.currentPrice > indicators.ema50 ? 'above' : 'below'})
- EMA 200: ₹${indicators.ema200.toFixed(2)} (Price ${marketData.currentPrice > indicators.ema200 ? 'above' : 'below'})
- RSI (14): ${indicators.rsi.toFixed(1)} ${indicators.rsi < 30 ? '(OVERSOLD)' : indicators.rsi > 70 ? '(OVERBOUGHT)' : ''}
- ATR (14): ₹${indicators.atr.toFixed(2)}
- ADX (14): ${indicators.adx.toFixed(1)} ${indicators.adx > 25 ? '(TRENDING)' : '(RANGING)'}
- MACD: ${indicators.macd.value.toFixed(2)}
- MACD Signal: ${indicators.macd.signal.toFixed(2)}
- MACD Histogram: ${indicators.macd.histogram.toFixed(2)} ${indicators.macd.histogram > 0 ? '(BULLISH)' : '(BEARISH)'}

MARKET CONTEXT:
- Trend: ${context.trend} (Strength: ${context.trendStrength.toFixed(0)}%)
- Regime: ${context.regime}
- Nearest Support: ₹${context.support[0]?.toFixed(2) || 'N/A'}
- Nearest Resistance: ₹${context.resistance[0]?.toFixed(2) || 'N/A'}

${historicalPerformance ? `
HISTORICAL PERFORMANCE FOR THIS STOCK:
- Previous Signals: ${historicalPerformance.totalSignals}
- Success Rate: ${historicalPerformance.successRate.toFixed(1)}%
- Average P&L: ${historicalPerformance.avgPnl.toFixed(2)}%
` : ''}

Provide your trading recommendation as a JSON response.`;
  }

  private buildLearningPrompt(input: LLMLearningInput): string {
    const { symbol, decision, result, pnlPercent, maxProfit, maxLoss, daysHeld, marketConditionAtEntry, marketConditionAtExit } = input;

    return `Analyze this completed trade and provide learning insights:

TRADE DETAILS:
- Symbol: ${symbol}
- Decision: ${decision.decision}
- Entry Price: ₹${decision.entryPrice.toFixed(2)}
- Stop Loss: ₹${decision.stopLoss.toFixed(2)}
- Target Price: ₹${decision.targetPrice.toFixed(2)}
- Intended Holding: ${decision.holdingDays} days
- Actual Holding: ${daysHeld} days

RESULT:
- Outcome: ${result}
- P&L: ${pnlPercent.toFixed(2)}%
- Maximum Profit During Trade: ${maxProfit.toFixed(2)}%
- Maximum Loss During Trade: ${maxLoss.toFixed(2)}%

MARKET CONDITIONS AT ENTRY:
- Trend: ${marketConditionAtEntry.trend}
- Regime: ${marketConditionAtEntry.regime}

MARKET CONDITIONS AT EXIT:
- Trend: ${marketConditionAtExit.trend}
- Regime: ${marketConditionAtExit.regime}

ORIGINAL REASONING:
${decision.reasoning}

KEY FACTORS IDENTIFIED:
${decision.keyFactors.join(', ')}

RISK FACTORS IDENTIFIED:
${decision.riskFactors.join(', ')}

Analyze what worked, what didn't, and suggest improvements. Respond in JSON format.`;
  }

  private parseDecision(response: string, input: LLMAnalysisInput): LLMDecision {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate and clamp values
        const confidence = Math.min(100, Math.max(0, parsed.confidence || 0));
        
        return {
          decision: ['BUY', 'SELL', 'HOLD'].includes(parsed.decision) ? parsed.decision : 'HOLD',
          confidence,
          entryPrice: parsed.entryPrice || input.marketData.currentPrice,
          stopLoss: parsed.stopLoss || input.marketData.currentPrice * 0.95,
          targetPrice: parsed.targetPrice || input.marketData.currentPrice * 1.05,
          riskReward: parsed.riskReward || 1,
          holdingDays: Math.min(5, Math.max(3, parsed.holdingDays || 5)),
          reasoning: parsed.reasoning || 'No reasoning provided',
          keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors : [],
          riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
          marketOutlook: parsed.marketOutlook || 'Neutral'
        };
      }
    } catch (error) {
      console.error('Failed to parse LLM decision:', error);
    }
    
    return this.getDefaultDecision(input);
  }

  private parseLearning(response: string): LLMLearningOutput {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        return {
          whatWentRight: parsed.whatWentRight || 'Analysis incomplete',
          whatWentWrong: parsed.whatWentWrong || 'Analysis incomplete',
          improvementSuggestions: Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : [],
          patternIdentified: parsed.patternIdentified || 'No pattern identified',
          avoidInFuture: Array.isArray(parsed.avoidInFuture) ? parsed.avoidInFuture : [],
          doMoreOften: Array.isArray(parsed.doMoreOften) ? parsed.doMoreOften : []
        };
      }
    } catch (error) {
      console.error('Failed to parse LLM learning:', error);
    }
    
    return this.getDefaultLearning({} as LLMLearningInput);
  }

  private getDefaultDecision(input: LLMAnalysisInput): LLMDecision {
    const atr = input.indicators.atr;
    const price = input.marketData.currentPrice;
    
    return {
      decision: 'HOLD',
      confidence: 0,
      entryPrice: price,
      stopLoss: price - (2 * atr),
      targetPrice: price + (3 * atr),
      riskReward: 1.5,
      holdingDays: 5,
      reasoning: 'Unable to analyze - insufficient data or LLM error. Defaulting to HOLD for safety.',
      keyFactors: [],
      riskFactors: ['Insufficient analysis'],
      marketOutlook: 'Unknown'
    };
  }

  /**
   * Fallback decision using technical analysis rules
   * Used when LLM is not available
   */
  private getFallbackDecision(input: LLMAnalysisInput): LLMDecision {
    const { marketData, indicators, context } = input;
    const price = marketData.currentPrice;
    const atr = indicators.atr;
    
    // Calculate technical score
    let bullishScore = 0;
    let bearishScore = 0;
    const keyFactors: string[] = [];
    const riskFactors: string[] = [];
    
    // EMA Analysis
    if (price > indicators.ema20) {
      bullishScore += 2;
      keyFactors.push('Price above EMA20');
    } else {
      bearishScore += 2;
      riskFactors.push('Price below EMA20');
    }
    
    if (price > indicators.ema50) {
      bullishScore += 2;
      keyFactors.push('Price above EMA50');
    } else {
      bearishScore += 2;
    }
    
    if (price > indicators.ema200) {
      bullishScore += 2;
      keyFactors.push('Price above EMA200 (long-term bullish)');
    } else {
      bearishScore += 2;
      riskFactors.push('Price below EMA200 (long-term bearish)');
    }
    
    // EMA alignment
    if (indicators.ema20 > indicators.ema50 && indicators.ema50 > indicators.ema200) {
      bullishScore += 3;
      keyFactors.push('Bullish EMA alignment (20>50>200)');
    } else if (indicators.ema20 < indicators.ema50 && indicators.ema50 < indicators.ema200) {
      bearishScore += 3;
      riskFactors.push('Bearish EMA alignment (20<50<200)');
    }
    
    // RSI Analysis
    if (indicators.rsi < 30) {
      bullishScore += 3;
      keyFactors.push(`RSI oversold (${indicators.rsi.toFixed(1)})`);
    } else if (indicators.rsi > 70) {
      bearishScore += 3;
      riskFactors.push(`RSI overbought (${indicators.rsi.toFixed(1)})`);
    } else if (indicators.rsi > 50) {
      bullishScore += 1;
    } else {
      bearishScore += 1;
    }
    
    // MACD Analysis
    if (indicators.macd.histogram > 0) {
      bullishScore += 2;
      keyFactors.push('MACD histogram positive');
    } else {
      bearishScore += 2;
      riskFactors.push('MACD histogram negative');
    }
    
    // ADX Trend Strength
    if (indicators.adx > 25) {
      keyFactors.push(`Strong trend (ADX: ${indicators.adx.toFixed(1)})`);
    } else {
      riskFactors.push(`Weak trend (ADX: ${indicators.adx.toFixed(1)})`);
    }
    
    // Volume Analysis
    if (indicators.volumeRatio > 1.5) {
      keyFactors.push(`High volume (${(indicators.volumeRatio * 100).toFixed(0)}% of avg)`);
      bullishScore += 1;
    } else if (indicators.volumeRatio < 0.7) {
      riskFactors.push(`Low volume (${(indicators.volumeRatio * 100).toFixed(0)}% of avg)`);
    }
    
    // Support/Resistance proximity
    const nearestSupport = context.support[0] || price * 0.95;
    const nearestResistance = context.resistance[0] || price * 1.05;
    const supportDistance = ((price - nearestSupport) / price) * 100;
    const resistanceDistance = ((nearestResistance - price) / price) * 100;
    
    if (supportDistance < 2) {
      bullishScore += 2;
      keyFactors.push('Near support level');
    }
    if (resistanceDistance < 2) {
      bearishScore += 2;
      riskFactors.push('Near resistance level');
    }
    
    // Calculate decision
    const totalScore = bullishScore + bearishScore;
    let decision: 'BUY' | 'SELL' | 'HOLD';
    let confidence: number;
    let reasoning: string;
    
    const bullishPct = (bullishScore / totalScore) * 100;
    
    if (bullishScore > bearishScore + 5 && bullishPct >= 60) {
      decision = 'BUY';
      confidence = Math.min(95, 50 + bullishPct * 0.5);
      reasoning = `Technical analysis indicates BUY. Bullish score: ${bullishScore}, Bearish score: ${bearishScore}. Multiple bullish indicators aligned.`;
    } else if (bearishScore > bullishScore + 5 && (100 - bullishPct) >= 60) {
      decision = 'SELL';
      confidence = Math.min(95, 50 + (100 - bullishPct) * 0.5);
      reasoning = `Technical analysis indicates SELL. Bearish score: ${bearishScore}, Bullish score: ${bullishScore}. Multiple bearish indicators aligned.`;
    } else {
      decision = 'HOLD';
      confidence = 50;
      reasoning = `Mixed signals - Bullish: ${bullishScore}, Bearish: ${bearishScore}. No clear direction, recommending HOLD for safety.`;
    }
    
    // Calculate entry, SL, target
    const entryPrice = price;
    const stopLoss = decision === 'BUY' 
      ? price - (2 * atr)
      : price + (2 * atr);
    const targetPrice = decision === 'BUY'
      ? price + (3 * atr)
      : price - (3 * atr);
    const riskReward = Math.abs(targetPrice - entryPrice) / Math.abs(entryPrice - stopLoss);
    
    return {
      decision,
      confidence: Math.round(confidence),
      entryPrice,
      stopLoss,
      targetPrice,
      riskReward: Math.round(riskReward * 100) / 100,
      holdingDays: 5,
      reasoning,
      keyFactors,
      riskFactors,
      marketOutlook: context.trend === 'BULLISH' ? 'Positive' : context.trend === 'BEARISH' ? 'Negative' : 'Neutral'
    };
  }

  private getDefaultLearning(input: LLMLearningInput): LLMLearningOutput {
    return {
      whatWentRight: 'Analysis not available',
      whatWentWrong: 'Analysis not available',
      improvementSuggestions: ['Improve data quality for better analysis'],
      patternIdentified: 'Unable to identify patterns due to missing analysis',
      avoidInFuture: [],
      doMoreOften: []
    };
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let tradingBrainInstance: TradingBrain | null = null;

export async function getTradingBrain(): Promise<TradingBrain> {
  if (!tradingBrainInstance) {
    tradingBrainInstance = new TradingBrain();
    await tradingBrainInstance.initialize();
  }
  return tradingBrainInstance;
}

export { TradingBrain };
