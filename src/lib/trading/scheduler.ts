/**
 * Scheduler utilities for automation
 * 
 * Since Next.js API routes are serverless, we use a "lazy" scheduler:
 * - Check on each request if automation should run
 * - Run if: It's past 10 AM IST AND no automation has run today
 */

import { runDailyAutomation } from './automation';

// Track last check time
let lastCheckTime = 0;
const CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour max

// Check if it's past 10 AM IST
function isPast10AMIST(): boolean {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const istTime = new Date(utcTime + istOffset);
  
  return istTime.getHours() >= 10;
}

// Get today's date string in IST
function getTodayISTDate(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const istTime = new Date(utcTime + istOffset);
  
  return istTime.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Check and run automation if needed (lazy scheduler)
export async function checkAndRunAutomation(): Promise<{ ran: boolean; message: string }> {
  const now = Date.now();
  
  // Don't check more than once per hour
  if (now - lastCheckTime < CHECK_INTERVAL) {
    return { ran: false, message: 'Already checked recently' };
  }
  
  lastCheckTime = now;
  
  // Check if it's past 10 AM IST
  if (!isPast10AMIST()) {
    return { ran: false, message: 'Not yet 10 AM IST' };
  }
  
  // Check if automation already ran today
  const { db } = await import('@/lib/db');
  const today = getTodayISTDate();
  
  const todayRun = await db.analysisRun.findFirst({
    where: {
      type: 'FULL',
      status: 'COMPLETED',
      startedAt: {
        gte: new Date(today + 'T00:00:00.000Z'),
      },
    },
  });
  
  if (todayRun) {
    return { ran: false, message: 'Automation already ran today' };
  }
  
  // Run automation
  console.log('[SCHEDULER] Running daily automation...');
  const result = await runDailyAutomation();
  
  return { 
    ran: true, 
    message: result.success ? 'Automation completed' : 'Automation failed',
  };
}

// Get IST time info
export function getISTTimeInfo(): { currentTime: string; isPast10AM: boolean; todayDate: string } {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const istTime = new Date(utcTime + istOffset);
  
  return {
    currentTime: istTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    isPast10AM: istTime.getHours() >= 10,
    todayDate: istTime.toISOString().split('T')[0],
  };
}
