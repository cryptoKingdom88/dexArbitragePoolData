// Core domain types
export interface Token {
  id: string;
  name: string;
  symbol: string;
  decimals: string;
  totalLiquidity: string;
}

export interface Pair {
  id: string; // pool address
  feeTier?: string;
  token0: Token;
  token1: Token;
  volumeUSD: string;
}

export interface DexFile {
  data: {
    pairs?: Pair[];
    pools?: Pair[];
  };
}

// Database entity types
export interface TokenInfo {
  address: string;
  symbol: string;
}

export interface PoolInfo {
  id: number;
  dex_type: string;
  pool_address: string;
  token0: string;
  token1: string;
  fee_tier?: string;
}

// Graph types for arbitrage discovery
export interface PoolEdge {
  pool: string;
  toToken: string;
}

export interface ArbitragePath {
  tokens: string[];
  pools: string[];
  length: number;
  swapPath: string;
}

export interface ArbitrageStep {
  pathId: number;
  stepIndex: number;
  poolAddress: string;
  fromToken: string;
  toToken: string;
  isForward: boolean;
}

// Configuration types
export interface BatchConfig {
  readonly PATHS_BATCH_SIZE: number;
  readonly STEPS_BATCH_SIZE: number;
  readonly FLUSH_INTERVAL_MS: number;
}

export interface ArbitrageConfig {
  readonly MAX_DEPTH: number;
  readonly MIN_DEPTH: number;
  readonly WETH_ADDRESS: string;
}