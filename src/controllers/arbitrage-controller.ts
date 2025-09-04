import { DatabaseConnection } from '../database/connection';
import { DatabaseSchema } from '../database/schema';
import { DataLoaderService } from '../services/data-loader';
import { ArbitrageFinderService } from '../services/arbitrage-finder';

/**
 * Main controller orchestrating the arbitrage discovery process
 */
export class ArbitrageController {
  private dbConnection: DatabaseConnection;

  constructor() {
    this.dbConnection = DatabaseConnection.getInstance();
  }

  /**
   * Execute the complete arbitrage discovery pipeline
   */
  async execute(): Promise<void> {
    console.log('🚀 Starting Arbitrage Discovery Pipeline...');
    
    const startTime = Date.now();

    try {
      // 1. Initialize database
      const db = await this.dbConnection.connect();
      const schema = new DatabaseSchema(db);
      await schema.initializeTables();
      console.log('✅ Database initialized');

      // 2. Load pool data (commented out for now - uncomment when needed)
      // const dataLoader = new DataLoaderService(db);
      // await dataLoader.loadAllPoolData();
      // console.log('✅ Pool data loaded');

      // 3. Find arbitrage paths
      const arbitrageFinder = new ArbitrageFinderService(db);
      const pathsFound = await arbitrageFinder.findArbitragePaths();

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      console.log(`✅ Arbitrage discovery completed successfully!`);
      console.log(`📊 Results: ${pathsFound} paths found in ${duration}s`);

    } catch (error) {
      console.error('❌ Error in arbitrage discovery pipeline:', error);
      throw error;
    } finally {
      await this.dbConnection.close();
    }
  }

  /**
   * Load pool data only (separate operation)
   */
  async loadPoolData(): Promise<void> {
    console.log('📂 Loading pool data...');

    try {
      const db = await this.dbConnection.connect();
      const schema = new DatabaseSchema(db);
      await schema.initializeTables();

      const dataLoader = new DataLoaderService(db);
      await dataLoader.loadAllPoolData();

      console.log('✅ Pool data loading completed');
    } catch (error) {
      console.error('❌ Error loading pool data:', error);
      throw error;
    } finally {
      await this.dbConnection.close();
    }
  }

  /**
   * Find arbitrage paths only (assumes data is already loaded)
   */
  async findArbitragePaths(): Promise<number> {
    console.log('🔍 Finding arbitrage paths...');

    try {
      const db = await this.dbConnection.connect();
      
      const arbitrageFinder = new ArbitrageFinderService(db);
      const pathsFound = await arbitrageFinder.findArbitragePaths();

      console.log(`✅ Arbitrage path discovery completed: ${pathsFound} paths found`);
      return pathsFound;
    } catch (error) {
      console.error('❌ Error finding arbitrage paths:', error);
      throw error;
    } finally {
      await this.dbConnection.close();
    }
  }
}