import fs from 'fs';
import path from 'path';
import { Database } from 'sqlite';
import { DexFile, Pair } from '../types';
import { DATA_CONFIG } from '../config/constants';

/**
 * Service for loading DEX pool data from JSON files into database
 */
export class DataLoaderService {
  constructor(private db: Database) {}

  /**
   * Load all DEX pool data from JSON files
   */
  async loadAllPoolData(): Promise<void> {
    console.log('📂 Loading DEX pool data from JSON files...');

    const files = fs.readdirSync(DATA_CONFIG.JSON_FOLDER)
      .filter(f => f.endsWith('.json'));

    console.log(`📊 Found ${files.length} JSON files to process`);

    for (const file of files) {
      await this.loadPoolDataFromFile(file);
    }

    console.log('✅ All pool data loaded successfully');
  }

  /**
   * Load pool data from a single JSON file
   */
  private async loadPoolDataFromFile(fileName: string): Promise<void> {
    const dexType = this.extractDexTypeFromFile(fileName);
    const filePath = path.join(DATA_CONFIG.JSON_FOLDER, fileName);
    
    console.log(`📄 Processing file: ${fileName} (${dexType})`);

    const raw = fs.readFileSync(filePath, 'utf-8');
    const json: DexFile = JSON.parse(raw);

    const pairs = dexType === 'uniswapV3' ? json.data.pools : json.data.pairs;
    if (!pairs) {
      console.warn(`⚠️  No pairs/pools found in ${fileName}`);
      return;
    }

    await this.insertPairsData(pairs, dexType);
    console.log(`✅ Processed ${pairs.length} pairs from ${fileName}`);
  }

  /**
   * Insert pairs data into database
   */
  private async insertPairsData(pairs: Pair[], dexType: string): Promise<void> {
    // Begin transaction for better performance
    await this.db.run('BEGIN TRANSACTION');

    try {
      for (const pair of pairs) {
        await this.insertTokens(pair);
        await this.insertPool(pair, dexType);
      }

      await this.db.run('COMMIT');
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Insert token data (ignore duplicates)
   */
  private async insertTokens(pair: Pair): Promise<void> {
    // Insert token0
    await this.db.run(
      `INSERT OR IGNORE INTO tbl_dex_token (address, name, symbol, decimal) VALUES (?, ?, ?, ?)`,
      [pair.token0.id, pair.token0.name, pair.token0.symbol, pair.token0.decimals]
    );

    // Insert token1
    await this.db.run(
      `INSERT OR IGNORE INTO tbl_dex_token (address, name, symbol, decimal) VALUES (?, ?, ?, ?)`,
      [pair.token1.id, pair.token1.name, pair.token1.symbol, pair.token1.decimals]
    );
  }

  /**
   * Insert pool data
   */
  private async insertPool(pair: Pair, dexType: string): Promise<void> {
    const feeTier = dexType !== 'uniswapV3' ? '3000' : pair.feeTier;
    
    await this.db.run(
      `INSERT OR IGNORE INTO tbl_dex_pool (dex_type, pool_address, fee_tier, token0, token1) VALUES (?, ?, ?, ?, ?)`,
      [dexType, pair.id, feeTier, pair.token0.id, pair.token1.id]
    );
  }

  /**
   * Extract DEX type from filename (e.g., "uniswapV3-10.json" → "uniswapV3")
   */
  private extractDexTypeFromFile(fileName: string): string {
    return fileName.split('-')[0];
  }
}