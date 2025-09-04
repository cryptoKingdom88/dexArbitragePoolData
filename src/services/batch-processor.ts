import { Database } from 'sqlite';
import { ArbitragePath, ArbitrageStep, PoolInfo } from '../types';
import { BATCH_CONFIG } from '../config/constants';

/**
 * Service for batch processing arbitrage paths and steps
 */
export class BatchProcessor {
  private pathBatch: ArbitragePath[] = [];
  private isFlushingBatch = false;
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(private db: Database) {}

  /**
   * Initialize batch processor with periodic flushing
   */
  async initialize(): Promise<void> {
    this.pathBatch = [];
    this.isFlushingBatch = false;

    // Setup periodic batch flushing
    this.flushInterval = setInterval(async () => {
      if (!this.isFlushingBatch && this.pathBatch.length > 0) {
        try {
          await this.flushBatches();
        } catch (error) {
          console.error('❌ Error in periodic flush:', error);
        }
      }
    }, BATCH_CONFIG.FLUSH_INTERVAL_MS);

    console.log('✅ Batch processor initialized');
  }

  /**
   * Add arbitrage path to batch
   */
  async addPath(path: ArbitragePath, poolCache: Map<string, PoolInfo>): Promise<void> {
    this.pathBatch.push(path);

    // Log first few paths for verification
    if (this.pathBatch.length <= 5) {
      console.log(`✅ WETH Arbitrage Path ${this.pathBatch.length}: ${path.swapPath}`);
    }

    // Check if batch needs flushing
    if (!this.isFlushingBatch && this.pathBatch.length >= BATCH_CONFIG.PATHS_BATCH_SIZE) {
      console.log(`💾 Batch full (${this.pathBatch.length} paths), processing...`);
      await this.flushBatches();
    }
  }

  /**
   * Finalize batch processing
   */
  async finalize(): Promise<void> {
    // Clear periodic flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush of remaining batches
    if (this.pathBatch.length > 0) {
      console.log(`🔄 Final batch flush (${this.pathBatch.length} remaining paths)...`);
      await this.flushBatches(true);
    }

    console.log('✅ Batch processor finalized');
  }

  /**
   * Cleanup batch processor (in case of errors)
   */
  async cleanup(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Flush batches to database
   */
  private async flushBatches(forceFlush = false): Promise<void> {
    // Prevent concurrent flush operations
    if (this.isFlushingBatch) {
      console.log('⏳ Batch flush already in progress, skipping...');
      return;
    }

    if (this.pathBatch.length === 0 && !forceFlush) return;

    // Acquire mutex
    this.isFlushingBatch = true;

    try {
      const batchStartTime = Date.now();
      const pathCount = this.pathBatch.length;

      if (pathCount === 0) {
        console.log('📭 No paths to flush');
        return;
      }

      console.log(`💾 Flushing ${pathCount} paths to database...`);

      await this.db.run('BEGIN TRANSACTION');

      const stepInserts: any[] = [];

      // Insert paths and collect steps
      for (const path of this.pathBatch) {
        const pathResult = await this.db.run(
          `INSERT INTO tbl_dex_arbitrage_path (length, swap_path) VALUES (?, ?)`,
          [path.length, path.swapPath]
        );

        const realPathId = pathResult.lastID;

        // Generate steps for this path
        const steps = this.generateStepsForPath(path, realPathId);
        stepInserts.push(...steps);
      }

      // Insert all steps in batch
      if (stepInserts.length > 0) {
        await this.insertStepsBatch(stepInserts);
      }

      await this.db.run('COMMIT');

      const batchEndTime = Date.now();
      console.log(`✅ Batch flush completed: ${pathCount} paths, ${stepInserts.length} steps in ${batchEndTime - batchStartTime}ms`);

      // Clear batch
      this.pathBatch.length = 0;

    } catch (error) {
      await this.db.run('ROLLBACK');
      console.error(`❌ Error during batch flush:`, error);
      throw error;
    } finally {
      // Always release mutex
      this.isFlushingBatch = false;
    }
  }

  /**
   * Generate steps for a given arbitrage path
   */
  private generateStepsForPath(path: ArbitragePath, pathId: number): any[] {
    const steps: any[] = [];
    const length = path.tokens.length - 1;

    for (let i = 0; i < length; i++) {
      const fromToken = path.tokens[i];
      const toToken = path.tokens[i + 1];
      const poolAddress = path.pools[i];

      // Determine swap direction (simplified - could be enhanced)
      const isForward = true; // This could be determined by token ordering in pool

      steps.push([
        pathId,
        i,
        poolAddress,
        fromToken,
        toToken,
        isForward ? 1 : 0
      ]);
    }

    return steps;
  }

  /**
   * Insert steps in batch using prepared statement
   */
  private async insertStepsBatch(stepInserts: any[]): Promise<void> {
    const stepStmt = await this.db.prepare(`
      INSERT INTO tbl_dex_arbitrage_step
      (path_id, step_index, pool_address, from_token, to_token, is_forward)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const stepParams of stepInserts) {
      await stepStmt.run(stepParams);
    }

    await stepStmt.finalize();
  }
}