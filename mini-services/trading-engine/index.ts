#!/usr/bin/env bun

/**
 * Trading Engine - Bun Entry Point
 * Starts the Python FastAPI server as a child process
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const PORT = 3030;
const cwd = import.meta.dir;

console.log(`🚀 Starting Trading Engine on port ${PORT}...`);

// Build environment variables - start fresh to avoid parent env overrides
const env: Record<string, string> = {};

// Copy all process.env first
Object.assign(env, process.env);

// Load .env file and OVERRIDE parent environment variables
const envPath = resolve(cwd, '.env');
if (existsSync(envPath)) {
  console.log('📄 Loading .env file...');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        // Always override from .env file (important for DATABASE_URL)
        env[key.trim()] = value;
        console.log(`   ${key.trim()} = ${value.substring(0, 30)}${value.length > 30 ? '...' : ''}`);
      }
    }
  });
}

// Log DATABASE_URL (hide password)
const dbUrl = env.DATABASE_URL || '';
if (dbUrl.includes('supabase')) {
  console.log('📊 Database: Supabase PostgreSQL');
} else if (dbUrl.startsWith('sqlite')) {
  console.log('📊 Database: SQLite');
} else if (dbUrl.startsWith('postgresql')) {
  console.log('📊 Database: PostgreSQL');
} else {
  console.log('📊 Database: SQLite (default)');
  env.DATABASE_URL = 'sqlite:///./trading.db';
}

// Set port
env.PORT = PORT.toString();

console.log('');
console.log('🎯 Starting Python server...');

// Start the Python server
const pythonProcess = spawn('python', ['main.py'], {
  cwd,
  stdio: 'inherit',
  env
});

pythonProcess.on('error', (error) => {
  console.error('Failed to start Trading Engine:', error);
  process.exit(1);
});

pythonProcess.on('exit', (code) => {
  console.log(`Trading Engine exited with code ${code}`);
  process.exit(code || 0);
});

// Handle shutdown signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  pythonProcess.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  pythonProcess.kill('SIGINT');
});
