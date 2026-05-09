/**
 * Check database status
 */

import { db } from '../src/lib/db';

async function main() {
  const totalStocks = await db.stock.count();
  const stocksWithData = await db.stock.count({
    where: { dailyCandles: { some: {} } },
  });
  
  const totalCandles = await db.dailyCandle.count();
  
  const oldestCandle = await db.dailyCandle.findFirst({
    orderBy: { date: 'asc' },
  });
  
  const newestCandle = await db.dailyCandle.findFirst({
    orderBy: { date: 'desc' },
  });
  
  console.log('\n========================================');
  console.log('📊 DATABASE STATUS');
  console.log('========================================');
  console.log(`📋 Total Stocks: ${totalStocks}`);
  console.log(`📈 Stocks with Data: ${stocksWithData}`);
  console.log(`📊 Total Candles: ${totalCandles}`);
  
  if (oldestCandle && newestCandle) {
    console.log(`📅 Date Range: ${oldestCandle.date.toLocaleDateString()} - ${newestCandle.date.toLocaleDateString()}`);
  }
  console.log('========================================\n');
  
  process.exit(0);
}

main();
