import { BatchConfig, ArbitrageConfig } from '../types';

// Batch processing configuration
export const BATCH_CONFIG: BatchConfig = {
  PATHS_BATCH_SIZE: 1000,      // Insert paths in batches of 1000
  STEPS_BATCH_SIZE: 5000,      // Insert steps in batches of 5000
  FLUSH_INTERVAL_MS: 1000      // Flush every 1 second
} as const;

// Arbitrage discovery configuration
export const ARBITRAGE_CONFIG: ArbitrageConfig = {
  MAX_DEPTH: 3,
  MIN_DEPTH: 3,
  WETH_ADDRESS: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2".toLowerCase()
} as const;

// Data source configuration
export const DATA_CONFIG = {
  JSON_FOLDER: "/Volumes/Resource/Project/Git/arbitrageCheck/00_PreData/DexPoolData",
  DATABASE_PATH: "dex_pools.db"
} as const;