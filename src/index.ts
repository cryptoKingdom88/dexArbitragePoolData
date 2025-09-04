import { ArbitrageController } from './controllers/arbitrage-controller';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
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
}

// Execute main function
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});