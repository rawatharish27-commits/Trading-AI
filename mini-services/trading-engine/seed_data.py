"""
Seed Database with Sample Market Data
Creates realistic candle data for SMC Analysis testing
"""

import sys
import os
import random
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import database models
from app.database import Base, Symbol, Candle

# Sample symbols with realistic price ranges
SYMBOLS = {
    'RELIANCE': {'base': 2450, 'name': 'Reliance Industries'},
    'TCS': {'base': 3850, 'name': 'Tata Consultancy Services'},
    'HDFCBANK': {'base': 1650, 'name': 'HDFC Bank'},
    'ICICIBANK': {'base': 1050, 'name': 'ICICI Bank'},
    'INFY': {'base': 1450, 'name': 'Infosys'},
    'SBIN': {'base': 650, 'name': 'State Bank of India'},
    'BHARTIARTL': {'base': 1250, 'name': 'Bharti Airtel'},
    'ITC': {'base': 450, 'name': 'ITC Limited'},
    'KOTAKBANK': {'base': 1750, 'name': 'Kotak Mahindra Bank'},
    'LT': {'base': 3500, 'name': 'Larsen & Toubro'},
}

def generate_candles(symbol: str, base_price: float, num_candles: int = 500) -> list:
    """Generate realistic OHLCV candle data with trends and patterns"""
    candles = []
    price = base_price
    trend = random.choice(['bullish', 'bearish', 'ranging'])
    trend_strength = random.uniform(0.3, 0.7)
    
    # Start from 7 days ago
    start_time = datetime.now() - timedelta(days=7)
    
    for i in range(num_candles):
        # 5-minute intervals
        timestamp = start_time + timedelta(minutes=5 * i)
        
        # Skip non-market hours (9:15 AM to 3:30 PM IST)
        hour = timestamp.hour
        minute = timestamp.minute
        if hour < 9 or (hour == 9 and minute < 15) or hour >= 15 or (hour == 15 and minute > 30):
            continue
        if hour >= 12 and hour < 13:
            continue  # Lunch break
        
        # Generate realistic price movement
        volatility = base_price * 0.002  # 0.2% volatility
        
        # Trend bias
        if trend == 'bullish':
            bias = trend_strength * volatility
        elif trend == 'bearish':
            bias = -trend_strength * volatility
        else:
            bias = 0
        
        # Random price movement
        change = random.gauss(bias, volatility)
        
        # Generate OHLC
        open_price = price
        close_price = price + change
        
        # High and low with some randomness
        high_offset = abs(random.gauss(0, volatility * 0.5))
        low_offset = abs(random.gauss(0, volatility * 0.5))
        
        high_price = max(open_price, close_price) + high_offset
        low_price = min(open_price, close_price) - low_offset
        
        # Volume with some patterns
        volume = random.randint(50000, 500000)
        if abs(change) > volatility * 1.5:
            volume *= 1.5  # Higher volume on big moves
        
        candles.append({
            'timestamp': timestamp,
            'open': round(open_price, 2),
            'high': round(high_price, 2),
            'low': round(low_price, 2),
            'close': round(close_price, 2),
            'volume': volume
        })
        
        price = close_price
        
        # Occasionally change trend
        if random.random() < 0.01:
            trend = random.choice(['bullish', 'bearish', 'ranging'])
            trend_strength = random.uniform(0.3, 0.7)
    
    return candles


def seed_database():
    """Seed database with sample data"""
    print("🌱 Seeding database with sample market data...")
    
    # Get database URL
    database_url = os.environ.get('DATABASE_URL', 'sqlite:///./trading_ai_local.db')
    print(f"  Using database: {database_url.split('/')[-1]}")
    
    # Create engine
    if database_url.startswith('sqlite'):
        engine = create_engine(database_url, connect_args={"check_same_thread": False})
    else:
        engine = create_engine(database_url)
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Create session
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()
    
    try:
        total_candles = 0
        
        for symbol, info in SYMBOLS.items():
            # Create or get symbol
            symbol_obj = db.query(Symbol).filter(Symbol.symbol == symbol).first()
            if not symbol_obj:
                symbol_obj = Symbol(symbol=symbol, name=info['name'])
                db.add(symbol_obj)
                db.commit()
                db.refresh(symbol_obj)
                print(f"  ✓ Created symbol: {symbol}")
            
            # Check if candles already exist
            existing = db.query(Candle).filter(Candle.symbol_id == symbol_obj.id).count()
            if existing > 100:
                print(f"  ⏭️  {symbol} already has {existing} candles, skipping...")
                continue
            
            # Generate and insert candles
            candles_data = generate_candles(symbol, info['base'], 500)
            
            for candle_data in candles_data:
                candle = Candle(
                    symbol_id=symbol_obj.id,
                    timeframe='5m',
                    timestamp=candle_data['timestamp'],
                    open=candle_data['open'],
                    high=candle_data['high'],
                    low=candle_data['low'],
                    close=candle_data['close'],
                    volume=candle_data['volume']
                )
                db.add(candle)
            
            db.commit()
            total_candles += len(candles_data)
            print(f"  ✓ Added {len(candles_data)} candles for {symbol}")
        
        print(f"\n✅ Seeding complete! Total candles: {total_candles}")
        return True
        
    except Exception as e:
        print(f"❌ Error seeding database: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
