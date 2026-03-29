"""
Fetch Real Market Data from Angel One
Run this script to populate database with live data
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.data.angel_one import AngelOneClient, get_angel_one_client
from app.database import Base, Symbol, Candle
from app.core.config import settings
from app.core.logger import logger


def fetch_real_market_data():
    """Fetch real market data from Angel One and store in database"""
    
    print("🚀 Fetching REAL market data from Angel One...")
    print("=" * 50)
    
    # Initialize Angel One client
    client = get_angel_one_client()
    if not client:
        print("❌ Angel One client not configured. Check credentials in .env")
        return False
    
    # Login
    print("📡 Logging in to Angel One...")
    if not client.login():
        print("❌ Login failed. Check your credentials.")
        return False
    
    print("✅ Login successful!")
    print()
    
    # Initialize database
    database_url = os.environ.get('DATABASE_URL', 'sqlite:///./trading_ai_local.db')
    print(f"📦 Using database: {database_url.split('/')[-1]}")
    
    if database_url.startswith('sqlite'):
        engine = create_engine(database_url, connect_args={"check_same_thread": False})
    else:
        engine = create_engine(database_url)
    
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()
    
    try:
        # Fetch data for each symbol
        symbols = list(AngelOneClient.SYMBOL_TOKENS.keys())
        total_candles = 0
        
        for symbol in symbols:
            print(f"\n📊 Fetching {symbol}...")
            
            try:
                # Fetch historical data (last 30 days)
                candles = client.get_historical_data(
                    symbol=symbol,
                    interval='FIVE_MINUTE',
                    days=30
                )
                
                if not candles:
                    print(f"  ⚠️  No data received for {symbol}")
                    continue
                
                # Get or create symbol
                symbol_obj = db.query(Symbol).filter(Symbol.symbol == symbol).first()
                if not symbol_obj:
                    symbol_obj = Symbol(symbol=symbol, name=symbol)
                    db.add(symbol_obj)
                    db.commit()
                    db.refresh(symbol_obj)
                
                # Store candles
                stored = 0
                for candle in candles:
                    # Check if exists
                    existing = db.query(Candle).filter(
                        Candle.symbol_id == symbol_obj.id,
                        Candle.timeframe == '5m',
                        Candle.timestamp == candle.timestamp
                    ).first()
                    
                    if not existing:
                        db_candle = Candle(
                            symbol_id=symbol_obj.id,
                            timeframe='5m',
                            timestamp=candle.timestamp,
                            open=candle.open,
                            high=candle.high,
                            low=candle.low,
                            close=candle.close,
                            volume=candle.volume
                        )
                        db.add(db_candle)
                        stored += 1
                
                db.commit()
                total_candles += len(candles)
                print(f"  ✅ {len(candles)} candles received, {stored} new stored")
                
                # Rate limiting
                time.sleep(0.5)
                
            except Exception as e:
                print(f"  ❌ Error fetching {symbol}: {e}")
                continue
        
        print()
        print("=" * 50)
        print(f"✅ COMPLETE! Total candles: {total_candles}")
        print()
        
        # Fetch live quotes
        print("📈 Fetching live quotes...")
        quotes = client.get_all_symbols_quote(symbols[:5])  # Top 5 symbols
        
        for symbol, quote in quotes.items():
            print(f"  {symbol}: ₹{quote['ltp']:.2f} ({quote['change_percent']:+.2f}%)")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False
    finally:
        db.close()
        client.logout()


def start_live_data_feed():
    """Start continuous live data feed (for running in background)"""
    
    print("🔴 Starting LIVE data feed...")
    print("Press Ctrl+C to stop")
    print()
    
    client = get_angel_one_client()
    if not client or not client.login():
        print("❌ Cannot start live feed - login failed")
        return
    
    database_url = os.environ.get('DATABASE_URL', 'sqlite:///./trading_ai_local.db')
    if database_url.startswith('sqlite'):
        engine = create_engine(database_url, connect_args={"check_same_thread": False})
    else:
        engine = create_engine(database_url)
    
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    symbols = list(AngelOneClient.SYMBOL_TOKENS.keys())[:10]  # Top 10 symbols
    
    try:
        while True:
            db = Session()
            try:
                # Fetch current time
                now = datetime.now()
                
                # Only during market hours (9:15 AM - 3:30 PM IST)
                if 9 <= now.hour < 16:
                    if now.hour == 9 and now.minute < 15:
                        time.sleep(60)
                        continue
                    
                    for symbol in symbols:
                        quote = client.get_quote(symbol)
                        if quote:
                            # Store as candle (aggregate later)
                            symbol_obj = db.query(Symbol).filter(
                                Symbol.symbol == symbol
                            ).first()
                            
                            if symbol_obj:
                                # Check for 5-min candle
                                candle_time = now.replace(
                                    minute=(now.minute // 5) * 5,
                                    second=0,
                                    microsecond=0
                                )
                                
                                print(f"  {symbol}: ₹{quote['ltp']:.2f}")
                                
                                # Here you would update/create the candle
                                # For now just log the price
                                
                        time.sleep(0.2)
                    
                    print(f"  ⏰ Updated at {now.strftime('%H:%M:%S')}")
                
                # Sleep for 5 seconds
                time.sleep(5)
                
            finally:
                db.close()
                
    except KeyboardInterrupt:
        print("\n🛑 Stopped live feed")
        client.logout()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Fetch market data from Angel One')
    parser.add_argument('--live', action='store_true', help='Start live data feed')
    args = parser.parse_args()
    
    if args.live:
        start_live_data_feed()
    else:
        fetch_real_market_data()
