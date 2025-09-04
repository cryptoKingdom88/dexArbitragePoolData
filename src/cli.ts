#!/usr/bin/env node

import { ArbitrageController } from './controllers/arbitrage-controller';

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

  private showHelp(): void {
    console.log(`
🔍 Arbitrage Discovery CLI

Usage: npm run cli <command>

Commands:
  load-data      Load DEX pool data from JSON files into database
  find-paths     Find arbitrage paths (requires data to be loaded first)
  full-pipeline  Run complete pipeline (load data + find paths)
  help           Show this help message

Examples:
  npm run cli load-data      # Load pool data
  npm run cli find-paths     # Find arbitrage paths
  npm run cli full-pipeline # Run everything
    `);
  }
}

// Run CLI
const cli = new CLI();
cli.run().catch(error => {
  console.error('❌ CLI error:', error);
  process.exit(1);
});