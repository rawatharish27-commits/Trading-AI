"""
AI Agents - Research Agent
Market opportunity scanner

Tasks:
- Top stocks scan
- Volume expansion
- Liquidity zones
- Setup scoring

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from datetime import datetime
import numpy as np

from app.smc import Candle, SwingDetector, StructureDetector, LiquidityDetector
from app.smc import OrderBlockDetector, FVGDetector, RegimeDetector, MarketRegime


@dataclass
class ScannerResult:
    """Scanner Result for a Symbol"""
    symbol: str
    score: int
    reasons: List[str]
    trend: str  # BULLISH, BEARISH, NEUTRAL
    regime: str  # TRENDING, RANGING, VOLATILE
    volume_profile: str  # HIGH, NORMAL, LOW
    liquidity_score: int
    structure_score: int
    last_scanned: datetime


class ResearchAgent:
    """
    Research Agent - Market Scanner
    
    Scans multiple symbols and identifies trading opportunities.
    Uses SMC analysis for opportunity detection.
    """
    
    def __init__(self, 
                 min_score: int = 50,
                 min_volume_mult: float = 1.3):
        """
        Initialize Research Agent
        
        Args:
            min_score: Minimum score to qualify as opportunity
            min_volume_mult: Minimum volume multiplier for expansion
        """
        self.min_score = min_score
        self.min_volume_mult = min_volume_mult
        
        # Detectors
        self.swing_detector = SwingDetector()
        self.structure_detector = StructureDetector()
        self.liq_detector = LiquidityDetector()
        self.ob_detector = OrderBlockDetector()
        self.fvg_detector = FVGDetector()
        self.regime_detector = RegimeDetector()
    
    def scan_symbol(self, symbol: str, candles: List[Candle]) -> ScannerResult:
        """
        Scan a single symbol for opportunity
        
        Scoring:
        - Trend clarity: 20 points
        - Liquidity zones: 25 points
        - Volume expansion: 15 points
        - ATR suitability: 15 points
        - Trend strength: 15 points
        - Clean structure: 10 points
        """
        result = ScannerResult(
            symbol=symbol,
            score=0,
            reasons=[],
            trend='NEUTRAL',
            regime='RANGING',
            volume_profile='NORMAL',
            liquidity_score=0,
            structure_score=0,
            last_scanned=datetime.utcnow()
        )
        
        if len(candles) < 100:
            result.reasons.append("Insufficient data")
            return result
        
        # 1. Detect Regime
        regime_data = self.regime_detector.detect_regime(candles)
        result.regime = regime_data.regime.value
        
        # Skip volatile markets
        if regime_data.regime == MarketRegime.VOLATILE:
            result.reasons.append("Volatile market - avoid")
            return result
        
        # 2. Detect Swings
        swings = self.swing_detector.detect_swings(candles)
        
        # 3. Detect Structure
        structures = self.structure_detector.detect_basic_structure(swings)
        trend = self.structure_detector.get_trend_direction(structures)
        result.trend = trend.value
        
        # Score for trend
        if trend.value != 'NEUTRAL':
            result.score += 20
            result.reasons.append(f"Clear {trend.value.lower()} trend")
        
        # 4. Detect Liquidity
        liquidity = self.liq_detector.detect_all_liquidity(swings, candles)
        unswept = [z for z in liquidity if not z.swept]
        
        if len(unswept) >= 1:
            result.score += 25
            result.liquidity_score = len(unswept) * 10
            result.reasons.append(f"{len(unswept)} liquidity zones available")
        
        # 5. Volume Analysis
        volumes = [c.volume for c in candles[-20:]]
        avg_volume = np.mean(volumes)
        recent_volume = np.mean([c.volume for c in candles[-5:]])
        
        if recent_volume > avg_volume * self.min_volume_mult:
            result.volume_profile = 'HIGH'
            result.score += 15
            result.reasons.append("Volume expansion detected")
        elif recent_volume < avg_volume * 0.7:
            result.volume_profile = 'LOW'
            result.score -= 10
            result.reasons.append("Low volume")
        
        # 6. ATR Analysis
        atr_percent = regime_data.volatility
        if 0.5 <= atr_percent <= 2.5:
            result.score += 15
            result.reasons.append(f"ATR: {atr_percent:.2f}% - Suitable for trading")
        elif atr_percent > 3:
            result.score -= 20
            result.reasons.append(f"High ATR: {atr_percent:.2f}% - Too volatile")
        
        # 7. Trend Strength
        if regime_data.trend_strength > 50:
            result.score += 15
            result.reasons.append(f"Strong trend: {regime_data.trend_strength:.0f}%")
        
        # 8. Structure Quality
        confirmed_structures = [s for s in structures if s.confirmed]
        if len(confirmed_structures) >= 3:
            result.score += 10
            result.structure_score = len(confirmed_structures) * 3
            result.reasons.append("Clean market structure")
        
        return result
    
    def scan_multiple(self, 
                     symbols_data: Dict[str, List[Candle]],
                     limit: int = 10) -> List[ScannerResult]:
        """
        Scan multiple symbols and return ranked results
        
        Args:
            symbols_data: Dict mapping symbol to candles
            limit: Maximum results to return
        
        Returns:
            List of ScannerResult sorted by score
        """
        results = []
        
        for symbol, candles in symbols_data.items():
            result = self.scan_symbol(symbol, candles)
            results.append(result)
        
        # Sort by score descending
        results.sort(key=lambda x: x.score, reverse=True)
        
        # Filter minimum score
        results = [r for r in results if r.score >= self.min_score]
        
        return results[:limit]
    
    def get_watchlist_recommendations(self, 
                                     results: List[ScannerResult],
                                     min_score: int = 60) -> List[str]:
        """Get recommended watchlist symbols"""
        return [r.symbol for r in results if r.score >= min_score]
    
    def generate_research_report(self, results: List[ScannerResult]) -> str:
        """Generate text research report"""
        report = "# Market Research Report\n\n"
        report += f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
        
        # Top opportunities
        top = results[:5]
        report += "## Top Opportunities\n\n"
        
        for i, r in enumerate(top):
            report += f"### {i+1}. {r.symbol}\n"
            report += f"- **Score:** {r.score}\n"
            report += f"- **Trend:** {r.trend}\n"
            report += f"- **Regime:** {r.regime}\n"
            report += f"- **Volume:** {r.volume_profile}\n"
            report += f"- **Reasons:** {', '.join(r.reasons)}\n\n"
        
        # Avoid symbols
        avoid = [r for r in results if 'Volatile' in ' '.join(r.reasons)]
        if avoid:
            report += "## Avoid (Volatile)\n\n"
            report += ", ".join([r.symbol for r in avoid]) + "\n"
        
        return report
    
    def check_trading_conditions(self, result: ScannerResult) -> bool:
        """Check if symbol meets trading conditions"""
        return (
            result.score >= self.min_score and
            result.regime != 'VOLATILE' and
            result.trend != 'NEUTRAL' and
            'Low volume' not in result.reasons
        )
