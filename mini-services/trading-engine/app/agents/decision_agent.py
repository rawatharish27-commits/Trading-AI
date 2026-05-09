"""
AI Agents - Decision Agent
LLM-powered trade validation

Input:
{
  "setup_score": 82,
  "trend": "bullish",
  "regime": "trending"
}

Output:
APPROVE / REJECT

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import Dict, Any, Optional
from datetime import datetime
import httpx
import json

from app.core.config import settings
from app.core.logger import logger


@dataclass
class DecisionInput:
    """Input for Decision Agent"""
    setup: Dict[str, Any]
    market_context: Dict[str, Any]
    historical_context: Optional[Dict[str, Any]] = None


@dataclass
class DecisionOutput:
    """Output from Decision Agent"""
    decision: str  # APPROVE, REJECT
    confidence: float  # 0-100
    reasoning: str
    risk_factors: list
    suggestions: list
    processing_time_ms: int = 0


# System prompt for trading decisions
DECISION_SYSTEM_PROMPT = """You are an expert institutional trading decision agent. Your role is to analyze trade setups and provide APPROVE or REJECT decisions.

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

Respond in JSON format only:
{
  "decision": "APPROVE" or "REJECT",
  "confidence": 0-100,
  "reasoning": "Detailed explanation",
  "risk_factors": ["factor1", "factor2"],
  "suggestions": ["improvement suggestions"]
}"""


class DecisionAgent:
    """
    Decision Agent - LLM-powered trade validation
    
    Uses LLM to analyze trade setups and make decisions.
    Falls back to rule-based logic if LLM unavailable.
    """
    
    def __init__(self, model: str = None, temperature: float = None):
        self.model = model or settings.LLM_MODEL
        self.temperature = temperature or settings.LLM_TEMPERATURE
    
    async def make_decision(self, input_data: DecisionInput) -> DecisionOutput:
        """
        Make trading decision
        
        Args:
            input_data: Decision input with setup and context
        
        Returns:
            DecisionOutput with decision and reasoning
        """
        start_time = datetime.utcnow()
        
        # Build analysis prompt
        user_prompt = self._build_analysis_prompt(input_data)
        
        # Try LLM call
        try:
            response = await self._call_llm(DECISION_SYSTEM_PROMPT, user_prompt)
            
            processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            # Parse response
            return DecisionOutput(
                decision=response.get('decision', 'REJECT'),
                confidence=response.get('confidence', 50),
                reasoning=response.get('reasoning', ''),
                risk_factors=response.get('risk_factors', []),
                suggestions=response.get('suggestions', []),
                processing_time_ms=int(processing_time)
            )
        
        except Exception as e:
            logger.error(f"LLM error: {e}")
            
            # Fallback to rule-based decision
            return self._fallback_decision(input_data)
    
    def _build_analysis_prompt(self, input_data: DecisionInput) -> str:
        """Build analysis prompt for LLM"""
        setup = input_data.setup
        ctx = input_data.market_context
        hist = input_data.historical_context
        
        prompt = f"""
Analyze this trade setup:

SETUP DETAILS:
- Symbol: {ctx.get('symbol', 'Unknown')}
- Direction: {setup.get('direction', 'Unknown')}
- Confluence Score: {setup.get('confluence_score', 0)}/100
- Risk/Reward: {setup.get('risk_reward', 0):.2f}

CONFLUENCE BREAKDOWN:
- Liquidity Sweep: {'YES (+30)' if setup.get('liquidity_sweep') else 'NO'}
- BOS Present: {'YES (+25)' if setup.get('bos') else 'NO'}
- Order Block Touch: {'YES (+25)' if setup.get('orderblock_touch') else 'NO'}
- FVG Present: {'YES (+10)' if setup.get('fvg') else 'NO'}
- Volume Spike: {'YES (+10)' if setup.get('volume_spike') else 'NO'}

MARKET CONTEXT:
- HTF Bias: {ctx.get('htf_bias', 'NEUTRAL')}
- Market Regime: {ctx.get('regime', 'UNKNOWN')}
- Recent BOS: {'YES' if ctx.get('recent_bos') else 'NO'}
- Liquidity Swept: {'YES' if ctx.get('liquidity_swept') else 'NO'}
"""
        
        if hist:
            prompt += f"""
HISTORICAL PERFORMANCE:
- Similar Setup Win Rate: {hist.get('win_rate', 0):.1f}%
- Total Similar Setups: {hist.get('total_setups', 0)}
"""
        
        prompt += "\nProvide your decision in the specified JSON format."
        
        return prompt
    
    async def _call_llm(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        """Call LLM API"""
        if not settings.OPENAI_API_KEY:
            raise ValueError("OpenAI API key not configured")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": self.temperature,
                    "max_tokens": 500,
                    "response_format": {"type": "json_object"}
                }
            )
            
            response.raise_for_status()
            data = response.json()
            
            content = data['choices'][0]['message']['content']
            return json.loads(content)
    
    def _fallback_decision(self, input_data: DecisionInput) -> DecisionOutput:
        """Rule-based fallback decision"""
        setup = input_data.setup
        ctx = input_data.market_context
        
        risk_factors = []
        suggestions = []
        confidence = 50
        approved = True
        
        # Check confluence score
        confluence_score = setup.get('confluence_score', 0)
        if confluence_score < 70:
            approved = False
            risk_factors.append(f"Low confluence score ({confluence_score})")
            confidence -= 20
        
        # Check HTF alignment
        htf_bias = ctx.get('htf_bias', 'NEUTRAL')
        if htf_bias == 'NEUTRAL':
            approved = False
            risk_factors.append("No clear HTF bias")
            confidence -= 15
        
        # Check regime
        regime = ctx.get('regime', 'UNKNOWN')
        if regime == 'VOLATILE':
            approved = False
            risk_factors.append("Volatile market conditions")
            confidence -= 25
        
        # Check R:R
        risk_reward = setup.get('risk_reward', 0)
        if risk_reward < 1.5:
            approved = False
            risk_factors.append(f"Risk/Reward too low ({risk_reward:.2f})")
            suggestions.append("Wait for better entry with improved R:R")
            confidence -= 10
        
        # Add positive factors
        if setup.get('liquidity_sweep'):
            confidence += 10
        if setup.get('bos'):
            confidence += 10
        if setup.get('orderblock_touch'):
            confidence += 10
        
        confidence = max(0, min(100, confidence))
        
        return DecisionOutput(
            decision='APPROVE' if approved else 'REJECT',
            confidence=confidence,
            reasoning=f"Setup {'approved' if approved else 'rejected'}. "
                     f"Confluence: {confluence_score}, R:R: {risk_reward:.2f}",
            risk_factors=risk_factors,
            suggestions=suggestions
        )
    
    def quick_decision(self, setup: Dict[str, Any]) -> str:
        """Quick rule-based decision without LLM"""
        confluence = setup.get('confluence_score', 0)
        risk_reward = setup.get('risk_reward', 0)
        htf_bias = setup.get('htf_bias', 'NEUTRAL')
        
        if (confluence >= 70 and 
            risk_reward >= 1.5 and 
            htf_bias != 'NEUTRAL'):
            return 'APPROVE'
        
        return 'REJECT'
