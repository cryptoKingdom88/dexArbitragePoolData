#!/usr/bin/env node

import { ArbitrageController } from './controllers/arbitrage-controller';
import { LiquidityCleaner } from './services/liquidity-cleaner';
import { DatabaseConnection } from './database/connection';

/**
 * Command Line Interface for arbitrage operations
 */
class CLI {
  private controller: ArbitrageController;

  constructor() {
    this.controller = new ArbitrageController();
  }

  async run(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'load-data':
        await this.loadData();
        break;
      case 'find-paths':
        await this.findPaths();
        break;
      case 'full-pipeline':
        await this.runFullPipeline();
        break;
      case 'clean-liquidity':
        await this.cleanLiquidity();
        break;
      case 'clean-isolated':
        await this.cleanIsolated();
        break;
      case 'clean-all':
        await this.cleanAll();
        break;
      case 'check-token':
        await this.checkToken(args[1]);
        break;
      case 'help':
      case '--help':
      case '-h':
        this.showHelp();
        break;
      default:
        console.log('❌ Unknown command. Use --help for available commands.');
        process.exit(1);
    }
  }

  private async loadData(): Promise<void> {
    console.log('🚀 Loading pool data from JSON files...');
    await this.controller.loadPoolData();
  }

  private async findPaths(): Promise<void> {
    console.log('🚀 Finding arbitrage paths...');
    const pathsFound = await this.controller.findArbitragePaths();
    console.log(`✅ Operation completed. Found ${pathsFound} arbitrage paths.`);
  }

  private async runFullPipeline(): Promise<void> {
    console.log('🚀 Running full arbitrage discovery pipeline...');
    await this.controller.execute();
  }

  private async cleanLiquidity(): Promise<void> {
    console.log('🧹 Cleaning low liquidity pools...');
    console.log('⚠️  WARNING: This will permanently delete pools from the database!');
    const dbConnection = DatabaseConnection.getInstance();
    const db = await dbConnection.connect();
    const cleaner = new LiquidityCleaner(db);
    await cleaner.cleanLowLiquidityPools();
  }

  private async cleanIsolated(): Promise<void> {
    console.log('🏝️ Cleaning isolated pools (tokens that appear in only one pool)...');
    console.log('⚠️  WARNING: This will permanently delete pools from the database!');
    const dbConnection = DatabaseConnection.getInstance();
    const db = await dbConnection.connect();
    const cleaner = new LiquidityCleaner(db);
    await cleaner.cleanIsolatedPools();
  }

  private async cleanAll(): Promise<void> {
    console.log('🧹 Comprehensive pool cleanup (isolated + low liquidity)...');
    console.log('⚠️  WARNING: This will permanently delete pools from the database!');
    const dbConnection = DatabaseConnection.getInstance();
    const db = await dbConnection.connect();
    const cleaner = new LiquidityCleaner(db);
    await cleaner.cleanAllPools();
  }

  private async checkToken(tokenAddress?: string): Promise<void> {
    if (!tokenAddress) {
      console.log('❌ Please provide a token address.');
      console.log('Usage: npm run cli check-token <token_address>');
      return;
    }

    console.log(`🔍 Checking token usage for: ${tokenAddress}`);
    const dbConnection = DatabaseConnection.getInstance();
    const db = await dbConnection.connect();
    const cleaner = new LiquidityCleaner(db, true);
    await cleaner.checkTokenUsage(tokenAddress);
  }

  private showHelp(): void {
    console.log(`
🔍 Arbitrage Discovery CLI

Usage: npm run cli <command>

Commands:
  load-data       Load DEX pool data from JSON files into database
  find-paths      Find arbitrage paths (requires data to be loaded first)
  full-pipeline   Run complete pipeline (load data + find paths)
  clean-liquidity Clean pools with low liquidity (BTC<0.3, ETH<5, Others<10000)
  clean-isolated  Clean isolated pools (tokens appearing in only one pool)
  clean-all       Comprehensive cleanup (isolated + low liquidity pools)
  check-token     Check how many pools a specific token appears in
  help            Show this help message

Examples:
  npm run cli load-data        # Load pool data
  npm run cli find-paths       # Find arbitrage paths
  npm run cli full-pipeline   # Run everything
  npm run cli clean-liquidity  # Clean low liquidity pools only
  npm run cli clean-isolated   # Clean isolated pools only
  npm run cli clean-all        # Clean both isolated and low liquidity pools
  npm run cli check-token 0x269616d549d7e8eaa82dfb17028d0b212d11232a  # Check specific token usage

⚠️  WARNING: Pool deletion is now ENABLED. These commands will permanently remove pools from the database.
    `);
  }
}

// Run CLI
const cli = new CLI();
cli.run().catch(error => {
  console.error('❌ CLI error:', error);
  process.exit(1);
});