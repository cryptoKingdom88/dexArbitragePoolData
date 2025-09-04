#!/usr/bin/env node

import { DatabaseConnection } from './database/connection';
import { LiquidityCleaner } from './services/liquidity-cleaner';

/**
 * Test script for isolated pools functionality
 */
async function testIsolatedPools() {
  try {
    console.log('🧪 Testing isolated pools functionality...\n');

    // Connect to database
    const dbConnection = DatabaseConnection.getInstance();
    const db = await dbConnection.connect();

    // Create cleaner with debug mode enabled
    const cleaner = new LiquidityCleaner(db, true);

    // Test specific token usage (the one you mentioned)
    const testTokenAddress = '0x269616d549d7e8eaa82dfb17028d0b212d11232a';
    console.log('=== Testing Specific Token Usage ===');
    await cleaner.checkTokenUsage(testTokenAddress);

    // Test isolated pools detection
    console.log('\n=== Testing Isolated Pools Detection ===');
    await cleaner.cleanIsolatedPools();

    console.log('\n✅ Isolated pools test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test
testIsolatedPools();