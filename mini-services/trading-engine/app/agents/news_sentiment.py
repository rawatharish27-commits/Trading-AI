"""
AI Agents - News Sentiment Agent
Market news analysis and sentiment scoring

Features:
- News fetching from multiple sources
- Sentiment analysis (positive/negative/neutral)
- Impact scoring for stocks
- Market mood assessment
- Integration with Decision Agent

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import re

from app.core.config import settings
from app.core.logger import logger


class Sentiment(Enum):
    """Sentiment classification"""
    VERY_BEARISH = "VERY_BEARISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"
    BULLISH = "BULLISH"
    VERY_BULLISH = "VERY_BULLISH"


class NewsImpact(Enum):
    """Impact level"""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass
class NewsItem:
    """News item structure"""
    title: str
    summary: str
    source: str
    url: str
    published_at: datetime
    symbols_mentioned: List[str] = field(default_factory=list)
    sentiment: Sentiment = Sentiment.NEUTRAL
    impact: NewsImpact = NewsImpact.MEDIUM
    confidence: float = 0.0
    processed_at: datetime = None
    
    def __post_init__(self):
        if self.processed_at is None:
            self.processed_at = datetime.utcnow()


@dataclass
class SentimentResult:
    """Sentiment analysis result"""
    overall_sentiment: Sentiment
    sentiment_score: float  # -1 to 1
    bullish_count: int
    bearish_count: int
    neutral_count: int
    impact_score: float  # 0 to 1
    key_topics: List[str]
    risk_factors: List[str]
    opportunities: List[str]
    confidence: float
    analyzed_at: datetime = None
    
    def __post_init__(self):
        if self.analyzed_at is None:
            self.analyzed_at = datetime.utcnow()


class NewsSentimentAgent:
    """
    News Sentiment Agent
    
    Analyzes market news and provides sentiment scoring:
    1. Fetches news from multiple sources
    2. Extracts relevant symbols
    3. Analyzes sentiment
    4. Assesses impact
    5. Generates recommendations
    """
    
    # Keywords for sentiment analysis
    BULLISH_KEYWORDS = [
        "surge", "rally", "gain", "profit", "growth", "rise", "soar",
        "outperform", "upgrade", "buy", "bullish", "positive", "beat",
        "exceed", "strong", "record", "high", "jump", "climb", "advance",
        "breakthrough", "expansion", "acquisition", "merger", "dividend"
    ]
    
    BEARISH_KEYWORDS = [
        "fall", "drop", "decline", "loss", "downgrade", "sell", "bearish",
        "negative", "miss", "below", "weak", "low", "crash", "plunge",
        "concern", "risk", "warning", "downgrade", "reduce", "cut",
        "bankruptcy", "lawsuit", "investigation", "fine", "penalty"
    ]
    
    # High impact keywords
    CRITICAL_KEYWORDS = [
        "earnings", "results", "guidance", "forecast", "fda", "approval",
        "regulatory", "merger", "acquisition", "buyback", "dividend",
        "split", "ipo", "delisting", "bankruptcy"
    ]
    
    # Market sectors
    SECTORS = {
        "BANKING": ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "BAJFINANCE"],
        "IT": ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM"],
        "PHARMA": ["SUNPHARMA", "DRREDDY", "CIPLA", "LUPIN"],
        "AUTO": ["MARUTI", "TATAMOTORS", "HEROMOTOCO", "BAJAJ-AUTO"],
        "FMCG": ["HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA"],
        "ENERGY": ["RELIANCE", "ONGC", "POWERGRID", "NTPC"]
    }
    
    def __init__(self,
                 min_confidence: float = 0.6,
                 cache_ttl_minutes: int = 30):
        """
        Initialize News Sentiment Agent
        
        Args:
            min_confidence: Minimum confidence threshold
            cache_ttl_minutes: Cache TTL for news
        """
        self.min_confidence = min_confidence
        self.cache_ttl = timedelta(minutes=cache_ttl_minutes)
        
        # Cache
        self._news_cache: Dict[str, List[NewsItem]] = {}
        self._sentiment_cache: Dict[str, SentimentResult] = {}
        self._last_fetch: Dict[str, datetime] = {}
    
    async def fetch_news(self, symbol: str = None, limit: int = 20) -> List[NewsItem]:
        """
        Fetch news for symbol or market
        
        Uses web search skill to get latest news
        
        Args:
            symbol: Stock symbol (optional, fetches market news if None)
            limit: Maximum news items to fetch
            
        Returns:
            List of NewsItem objects
        """
        cache_key = symbol or "MARKET"
        
        # Check cache
        if cache_key in self._news_cache:
            last_fetch = self._last_fetch.get(cache_key)
            if last_fetch and datetime.utcnow() - last_fetch < self.cache_ttl:
                return self._news_cache[cache_key][:limit]
        
        try:
            # Use web search skill
            from z_ai_web_dev_sdk import WebSearchSDK
            
            sdk = WebSearchSDK()
            
            query = f"{symbol} stock news India NSE" if symbol else "Indian stock market news today NSE Nifty"
            
            search_results = await sdk.search(query)
            
            news_items = []
            
            for result in search_results.get("results", [])[:limit]:
                # Create news item
                item = NewsItem(
                    title=result.get("title", ""),
                    summary=result.get("snippet", ""),
                    source=result.get("source", "Unknown"),
                    url=result.get("url", ""),
                    published_at=datetime.utcnow(),  # Would parse from result
                    symbols_mentioned=self._extract_symbols(result.get("title", "") + " " + result.get("snippet", ""))
                )
                
                # Analyze sentiment
                item.sentiment, item.confidence = self._analyze_sentiment(item.title, item.summary)
                item.impact = self._assess_impact(item.title, item.summary)
                
                news_items.append(item)
            
            # Cache results
            self._news_cache[cache_key] = news_items
            self._last_fetch[cache_key] = datetime.utcnow()
            
            return news_items
            
        except Exception as e:
            logger.error(f"Error fetching news: {e}")
            return []
    
    def _extract_symbols(self, text: str) -> List[str]:
        """Extract stock symbols from text"""
        symbols = []
        text_upper = text.upper()
        
        # Check known symbols
        all_symbols = []
        for sector_symbols in self.SECTORS.values():
            all_symbols.extend(sector_symbols)
        
        for symbol in all_symbols:
            if symbol in text_upper:
                symbols.append(symbol)
        
        return symbols
    
    def _analyze_sentiment(self, title: str, summary: str) -> tuple:
        """
        Analyze sentiment of news text
        
        Returns:
            Tuple of (Sentiment, confidence)
        """
        text = (title + " " + summary).lower()
        
        # Count keywords
        bullish_count = sum(1 for kw in self.BULLISH_KEYWORDS if kw in text)
        bearish_count = sum(1 for kw in self.BEARISH_KEYWORDS if kw in text)
        
        total = bullish_count + bearish_count
        
        if total == 0:
            return Sentiment.NEUTRAL, 0.5
        
        # Calculate sentiment score
        sentiment_score = (bullish_count - bearish_count) / total
        
        # Determine sentiment
        if sentiment_score >= 0.5:
            return Sentiment.VERY_BULLISH, min(1.0, 0.5 + abs(sentiment_score))
        elif sentiment_score >= 0.2:
            return Sentiment.BULLISH, min(1.0, 0.5 + abs(sentiment_score))
        elif sentiment_score <= -0.5:
            return Sentiment.VERY_BEARISH, min(1.0, 0.5 + abs(sentiment_score))
        elif sentiment_score <= -0.2:
            return Sentiment.BEARISH, min(1.0, 0.5 + abs(sentiment_score))
        else:
            return Sentiment.NEUTRAL, 0.5
    
    def _assess_impact(self, title: str, summary: str) -> NewsImpact:
        """Assess impact level of news"""
        text = (title + " " + summary).lower()
        
        # Check for critical keywords
        for kw in self.CRITICAL_KEYWORDS:
            if kw in text:
                return NewsImpact.CRITICAL
        
        # Check for company-specific news
        if self._extract_symbols(text):
            return NewsImpact.HIGH
        
        # Check for market-wide news
        market_keywords = ["market", "nifty", "sensex", "index", "rbi", "rate"]
        if any(kw in text for kw in market_keywords):
            return NewsImpact.MEDIUM
        
        return NewsImpact.LOW
    
    async def analyze_sentiment(self, symbol: str = None) -> SentimentResult:
        """
        Analyze overall sentiment for symbol or market
        
        Args:
            symbol: Stock symbol (optional)
            
        Returns:
            SentimentResult with analysis
        """
        news_items = await self.fetch_news(symbol)
        
        if not news_items:
            return SentimentResult(
                overall_sentiment=Sentiment.NEUTRAL,
                sentiment_score=0,
                bullish_count=0,
                bearish_count=0,
                neutral_count=0,
                impact_score=0,
                key_topics=[],
                risk_factors=[],
                opportunities=[],
                confidence=0
            )
        
        # Count sentiments
        bullish = sum(1 for n in news_items if n.sentiment in [Sentiment.BULLISH, Sentiment.VERY_BULLISH])
        bearish = sum(1 for n in news_items if n.sentiment in [Sentiment.BEARISH, Sentiment.VERY_BEARISH])
        neutral = len(news_items) - bullish - bearish
        
        # Calculate sentiment score (-1 to 1)
        total = len(news_items)
        sentiment_score = (bullish - bearish) / total if total > 0 else 0
        
        # Determine overall sentiment
        if sentiment_score >= 0.4:
            overall = Sentiment.VERY_BULLISH
        elif sentiment_score >= 0.15:
            overall = Sentiment.BULLISH
        elif sentiment_score <= -0.4:
            overall = Sentiment.VERY_BEARISH
        elif sentiment_score <= -0.15:
            overall = Sentiment.BEARISH
        else:
            overall = Sentiment.NEUTRAL
        
        # Calculate impact score
        impact_scores = {
            NewsImpact.CRITICAL: 1.0,
            NewsImpact.HIGH: 0.75,
            NewsImpact.MEDIUM: 0.5,
            NewsImpact.LOW: 0.25
        }
        avg_impact = sum(impact_scores.get(n.impact, 0.5) for n in news_items) / total
        
        # Extract key topics
        all_text = " ".join([n.title + " " + n.summary for n in news_items])
        key_topics = self._extract_topics(all_text)
        
        # Identify risk factors and opportunities
        risk_factors = []
        opportunities = []
        
        for item in news_items:
            if item.sentiment in [Sentiment.BEARISH, Sentiment.VERY_BEARISH]:
                risk_factors.append(item.title[:100])
            elif item.sentiment in [Sentiment.BULLISH, Sentiment.VERY_BULLISH]:
                opportunities.append(item.title[:100])
        
        # Calculate confidence
        confidence = sum(n.confidence for n in news_items) / total if total > 0 else 0
        
        result = SentimentResult(
            overall_sentiment=overall,
            sentiment_score=sentiment_score,
            bullish_count=bullish,
            bearish_count=bearish,
            neutral_count=neutral,
            impact_score=avg_impact,
            key_topics=key_topics[:5],
            risk_factors=risk_factors[:3],
            opportunities=opportunities[:3],
            confidence=confidence
        )
        
        return result
    
    def _extract_topics(self, text: str) -> List[str]:
        """Extract key topics from text"""
        topics = []
        
        # Check for sector mentions
        for sector, symbols in self.SECTORS.items():
            if any(s in text.upper() for s in symbols):
                topics.append(sector)
        
        # Check for common topics
        topic_keywords = {
            "EARNINGS": ["earnings", "results", "quarterly", "annual"],
            "REGULATORY": ["rbi", "sebi", "regulatory", "government", "policy"],
            "GLOBAL": ["us fed", "fed rate", "global", "international", "china"],
            "COMMODITY": ["crude", "oil", "gold", "commodity"],
            "CURRENCY": ["rupee", "dollar", "forex", "currency"]
        }
        
        for topic, keywords in topic_keywords.items():
            if any(kw in text.lower() for kw in keywords):
                topics.append(topic)
        
        return topics
    
    async def get_market_mood(self) -> Dict[str, Any]:
        """
        Get overall market mood assessment
        
        Returns:
            Market mood analysis
        """
        sentiment = await self.analyze_sentiment()
        
        return {
            "mood": sentiment.overall_sentiment.value,
            "score": sentiment.sentiment_score,
            "confidence": sentiment.confidence,
            "news_count": sentiment.bullish_count + sentiment.bearish_count + sentiment.neutral_count,
            "bullish_ratio": sentiment.bullish_count / (sentiment.bullish_count + sentiment.bearish_count + sentiment.neutral_count) if sentiment.bullish_count + sentiment.bearish_count + sentiment.neutral_count > 0 else 0,
            "key_topics": sentiment.key_topics,
            "risks": sentiment.risk_factors,
            "opportunities": sentiment.opportunities,
            "recommendation": self._generate_recommendation(sentiment),
            "timestamp": sentiment.analyzed_at.isoformat()
        }
    
    def _generate_recommendation(self, sentiment: SentimentResult) -> str:
        """Generate trading recommendation based on sentiment"""
        if sentiment.overall_sentiment == Sentiment.VERY_BULLISH:
            return "Strong positive sentiment. Consider long positions with proper risk management."
        elif sentiment.overall_sentiment == Sentiment.BULLISH:
            return "Positive sentiment. Look for buying opportunities on dips."
        elif sentiment.overall_sentiment == Sentiment.VERY_BEARISH:
            return "Strong negative sentiment. Avoid new long positions. Consider hedging."
        elif sentiment.overall_sentiment == Sentiment.BEARISH:
            return "Negative sentiment. Be cautious with new positions. Wait for reversal signals."
        else:
            return "Neutral sentiment. Wait for clearer market direction."
    
    async def check_symbol_sentiment(self, symbol: str) -> Dict[str, Any]:
        """
        Check sentiment for specific symbol
        
        Args:
            symbol: Stock symbol
            
        Returns:
            Symbol sentiment analysis
        """
        sentiment = await self.analyze_sentiment(symbol)
        news = await self.fetch_news(symbol, limit=5)
        
        return {
            "symbol": symbol,
            "sentiment": sentiment.overall_sentiment.value,
            "score": sentiment.sentiment_score,
            "confidence": sentiment.confidence,
            "impact": sentiment.impact_score,
            "recent_news": [
                {
                    "title": n.title,
                    "sentiment": n.sentiment.value,
                    "impact": n.impact.value,
                    "source": n.source
                }
                for n in news
            ],
            "recommendation": self._generate_recommendation(sentiment)
        }


# Singleton instance
_sentiment_agent: Optional[NewsSentimentAgent] = None


def get_sentiment_agent() -> Optional[NewsSentimentAgent]:
    """Get sentiment agent singleton"""
    return _sentiment_agent


def init_sentiment_agent(min_confidence: float = 0.6) -> NewsSentimentAgent:
    """Initialize sentiment agent singleton"""
    global _sentiment_agent
    _sentiment_agent = NewsSentimentAgent(min_confidence=min_confidence)
    return _sentiment_agent
