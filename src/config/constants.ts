import { config } from 'dotenv';
import { BatchConfig, ArbitrageConfig } from '../types';

// Load environment variables
config();

// Batch processing configuration
export const BATCH_CONFIG: BatchConfig = {
  PATHS_BATCH_SIZE: 1000,      // Insert paths in batches of 1000
  STEPS_BATCH_SIZE: 5000,      // Insert steps in batches of 5000
  FLUSH_INTERVAL_MS: 1000      // Flush every 1 second
} as const;

// Arbitrage discovery configuration
export const ARBITRAGE_CONFIG: ArbitrageConfig = {
  MAX_DEPTH: 4,
  MIN_DEPTH: 4,
  WETH_ADDRESS: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2".toLowerCase()
} as const;

// Data source configuration
export const DATA_CONFIG = {
  JSON_FOLDER: "/Volumes/Resource/Project/Git/arbitrageCheck/00_PreData/DexPoolData",
  DATABASE_PATH: "dex_pools.db"
} as const;

// Environment variables
export const INFURA_API_KEY = process.env.INFURA_API_KEY || '';

if (!INFURA_API_KEY) {
  throw new Error('INFURA_API_KEY is required in environment variables');
}

export const UNISWAP_VIEW_ABI = [
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "_pair",
        "type": "address[]"
      }
    ],
    "name": "viewPair",
    "outputs": [
      {
        "internalType": "uint112[]",
        "name": "",
        "type": "uint112[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];
