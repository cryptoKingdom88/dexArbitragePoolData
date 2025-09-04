import { ArbitrageController } from './controllers/arbitrage-controller';
import { LiquidityCleaner } from './services/liquidity-cleaner';
import { DatabaseConnection } from './database/connection';

/**
 * Test checkPoolsLiquidity function
 */
async function testCheckPoolsLiquidity(): Promise<void> {
  console.log('🧪 Testing checkPoolsLiquidity function...\n');
  
  try {
    // Connect to database
    const dbConnection = DatabaseConnection.getInstance();
    const db = await dbConnection.connect();
    
    // Create liquidity cleaner with debug mode
    const cleaner = new LiquidityCleaner(db, true);
    
    // Get first 5 V2/SushiSwap V2 pool addresses for testing
    const pools = await cleaner.getAllPoolsWithTokens();
    const testPoolAddresses = pools.slice(0, 5).map(p => p.poolAddress);
    
    console.log('Pool types being tested:');
    pools.slice(0, 5).forEach((pool, i) => {
      console.log(`${i + 1}. ${pool.dexType}: ${pool.poolAddress}`);
    });
    
    console.log('Test pool addresses:');
    testPoolAddresses.forEach((addr, i) => {
      console.log(`${i + 1}. ${addr}`);
    });
    console.log('');
    
    // Test the simple checkPoolsLiquidity function
    const liquidityInfos = await cleaner.checkPoolsLiquidity(testPoolAddresses);
    
    console.log('\n📊 Results:');
    liquidityInfos.forEach((info, i) => {
      console.log(`${i + 1}. Pool: ${info.poolAddress}`);
      console.log(`   Token0 Balance: ${info.token0Balance.toString()}`);
      console.log(`   Token1 Balance: ${info.token1Balance.toString()}\n`);
    });
    
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  // Temporary test for checkPoolsLiquidity function
  await testCheckPoolsLiquidity();
  
  // Original arbitrage controller code (commented out for testing)
  /*
  const controller = new ArbitrageController();

  try {
    // For initial setup: load pool data first (uncomment when needed)
    // await controller.loadPoolData();

    // Find arbitrage paths (assumes data is already loaded)
    await controller.findArbitragePaths();

  } catch (error) {
    console.error('❌ Application error:', error);
    process.exit(1);
  }
  */
}

// Execute main function
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});