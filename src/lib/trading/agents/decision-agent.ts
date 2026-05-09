// AI Agent - Decision Agent
// LLM-powered decision making for trade validation

import { 
  TradeSetup, 
  AgentDecision, 
  MarketDirection, 
  MarketRegime,
  ConfluenceData 
} from '../types';

const LLM_API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1';

// System prompt for trading decision
const DECISION_SYSTEM_PROMPT = `You are an expert institutional trading decision agent. Your role is to analyze trade setups and provide APPROVE or REJECT decisions.

CRITICAL RULES:
1. Only approve HIGH PROBABILITY setups (confluence score >= 75)
2. Reject setups in VOLATILE markets
3. Reject setups that don't align with HTF bias
4. Reject setups with risk/reward below 1.5

ANALYSIS FRAMEWORK:
- Market Structure: Is the setup aligned with the trend?
- Liquidity: Is there a clear liquidity sweep?
- Order Block: Is price at a validated order block?
- FVG: Is there fair value gap confluence?
- Volume: Is there volume confirmation?

Respond in JSON format:
{
  "decision": "APPROVE" or "REJECT",
  "confidence": 0-100,
  "reasoning": "Detailed explanation",
  "risk_factors": ["factor1", "factor2"],
  "suggestions": ["improvement suggestions"]
}`;

/**
 * Decision Agent Input
 */
export interface DecisionAgentInput {
  setup: TradeSetup;
  marketContext: {
    symbol: string;
    htfBias: MarketDirection;
    regime: MarketRegime;
    recentBOS: boolean;
    liquiditySwept: boolean;
  };
  historicalContext?: {
    similarSetupWinRate: number;
    totalSimilarSetups: number;
  };
}

/**
 * Decision Agent Output
 */
export interface DecisionAgentOutput {
  decision: AgentDecision;
  confidence: number;
  reasoning: string;
  riskFactors: string[];
  suggestions: string[];
}

/**
 * Run Decision Agent
 * Analyzes trade setup and returns decision
 */
export async function runDecisionAgent(
  input: DecisionAgentInput
): Promise<DecisionAgentOutput> {
  const { setup, marketContext, historicalContext } = input;

  // Build analysis prompt
  const userPrompt = buildAnalysisPrompt(setup, marketContext, historicalContext);

  // Call LLM
  try {
    const response = await callLLM(DECISION_SYSTEM_PROMPT, userPrompt);
    const parsed = JSON.parse(response);

    return {
      decision: parsed.decision === 'APPROVE' ? AgentDecision.APPROVE : AgentDecision.REJECT,
      confidence: parsed.confidence || 50,
      reasoning: parsed.reasoning || '',
      riskFactors: parsed.risk_factors || [],
      suggestions: parsed.suggestions || []
    };
  } catch (error) {
    console.error('Decision Agent Error:', error);
    
    // Fallback to rule-based decision
    return fallbackDecision(setup, marketContext, historicalContext);
  }
}

/**
 * Build analysis prompt for LLM
 */
function buildAnalysisPrompt(
  setup: TradeSetup,
  marketContext: DecisionAgentInput['marketContext'],
  historicalContext?: DecisionAgentInput['historicalContext']
): string {
  return `
Analyze this trade setup:

SETUP DETAILS:
- Symbol: ${marketContext.symbol}
- Direction: ${setup.direction}
- Confluence Score: ${setup.confluence.totalScore}/100
- Risk/Reward: ${setup.riskReward?.toFixed(2) || 'N/A'}

CONFLUENCE BREAKDOWN:
- Liquidity Sweep: ${setup.confluence.liquiditySweep ? 'YES (+30)' : 'NO'}  
- BOS Present: ${setup.confluence.bos ? 'YES (+25)' : 'NO'}
- Order Block Touch: ${setup.confluence.orderBlockTouch ? 'YES (+25)' : 'NO'}
- FVG Present: ${setup.confluence.fvgPresent ? 'YES (+10)' : 'NO'}
- Volume Spike: ${setup.confluence.volumeSpike ? 'YES (+10)' : 'NO'}

MARKET CONTEXT:
- HTF Bias: ${marketContext.htfBias}
- Market Regime: ${marketContext.regime}
- Recent BOS: ${marketContext.recentBOS ? 'YES' : 'NO'}
- Liquidity Swept: ${marketContext.liquiditySwept ? 'YES' : 'NO'}

${historicalContext ? `
HISTORICAL PERFORMANCE:
- Similar Setup Win Rate: ${historicalContext.similarSetupWinRate.toFixed(1)}%
- Total Similar Setups: ${historicalContext.totalSimilarSetups}
` : ''}

Provide your decision in the specified JSON format.`;
}

/**
 * Call LLM API using z-ai-web-dev-sdk compatible format
 */
async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  // Use z-ai-web-dev-sdk LLM capability
  const response = await fetch('/api/trading/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content || data.choices?.[0]?.message?.content || '';
}

/**
 * Fallback rule-based decision
 */
function fallbackDecision(
  setup: TradeSetup,
  marketContext: DecisionAgentInput['marketContext'],
  historicalContext?: DecisionAgentInput['historicalContext']
): DecisionAgentOutput {
  const riskFactors: string[] = [];
  const suggestions: string[] = [];
  let confidence = 50;
  let approved = true;

  // Check confluence score
  if (setup.confluence.totalScore < 70) {
    approved = false;
    riskFactors.push('Low confluence score');
    confidence -= 20;
  }

  // Check HTF alignment
  if (marketContext.htfBias === MarketDirection.NEUTRAL) {
    approved = false;
    riskFactors.push('No clear HTF bias');
    confidence -= 15;
  }

  // Check regime
  if (marketContext.regime === MarketRegime.VOLATILE) {
    approved = false;
    riskFactors.push('Volatile market conditions');
    confidence -= 25;
  }

  // Check risk/reward
  if (setup.riskReward && setup.riskReward < 1.5) {
    approved = false;
    riskFactors.push('Risk/reward below 1.5');
    suggestions.push('Wait for better entry with improved R:R');
    confidence -= 10;
  }

  // Check historical win rate if available
  if (historicalContext && historicalContext.similarSetupWinRate < 50) {
    approved = false;
    riskFactors.push(`Low historical win rate (${historicalContext.similarSetupWinRate.toFixed(1)}%)`);
    confidence -= 15;
  }

  // Add positive factors
  if (setup.confluence.liquiditySweep) {
    confidence += 10;
  }
  if (setup.confluence.bos) {
    confidence += 10;
  }
  if (setup.confluence.orderBlockTouch) {
    confidence += 10;
  }

  confidence = Math.max(0, Math.min(100, confidence));

  return {
    decision: approved ? AgentDecision.APPROVE : AgentDecision.REJECT,
    confidence,
    reasoning: approved 
      ? `Setup meets minimum criteria. Confluence score: ${setup.confluence.totalScore}. R:R: ${setup.riskReward?.toFixed(2)}`
      : `Setup rejected due to: ${riskFactors.join(', ')}`,
    riskFactors,
    suggestions
  };
}

/**
 * Quick decision without full analysis
 */
export function quickDecision(setup: TradeSetup): AgentDecision {
  // Minimum requirements for approval
  if (setup.confluence.totalScore >= 70 &&
      setup.riskReward && setup.riskReward >= 1.5 &&
      setup.htfBias !== MarketDirection.NEUTRAL) {
    return AgentDecision.APPROVE;
  }
  
  return AgentDecision.REJECT;
}
