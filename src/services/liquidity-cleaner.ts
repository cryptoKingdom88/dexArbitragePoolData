import { ethers } from 'ethers';
import { Database } from 'sqlite';
import { INFURA_API_KEY, UNISWAP_VIEW_ABI } from '../config/constants';

export interface PoolLiquidityInfo {
  poolAddress: string;
  token0Balance: bigint;
  token1Balance: bigint;
}

export interface PoolWithTokenInfo {
  poolAddress: string;
  dexType: string;
  token0: string;
  token1: string;
  token0Balance: bigint;
  token1Balance: bigint;
  token0Decimal: number;
  token1Decimal: number;
  token0Symbol?: string;
  token1Symbol?: string;
}

export interface TokenInfo {
  address: string;
  decimal: number;
  symbol?: string;
}

export class LiquidityCleaner {
  private provider: ethers.JsonRpcProvider;
  private viewContract: ethers.Contract;
  private readonly BATCH_SIZE = 500;
  private readonly MIN_BALANCE_THRESHOLD_BTC = 0.3; // For BTC tokens
  private readonly MIN_BALANCE_THRESHOLD_ETH = 5; // For ETH tokens
  private readonly MIN_BALANCE_THRESHOLD_OTHER = 10000; // For other tokens
  private tokenCache: Map<string, TokenInfo> = new Map();
  private debugMode: boolean = false;

  constructor(private db: Database, debugMode: boolean = false) {
    this.debugMode = debugMode;
    this.provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${INFURA_API_KEY}`);
    // Smart contract address - should be updated with actual deployed address
    this.viewContract = new ethers.Contract(
      "0x416355755f32b2710ce38725ed0fa102ce7d07e6",
      UNISWAP_VIEW_ABI,
      this.provider
    );
  }

  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Debug log - only prints if debug mode is enabled
   */
  private debugLog(message: string, ...args: any[]): void {
    if (this.debugMode) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Get V2 and SushiSwap V2 pool addresses and token information from database
   */
  async getAllPoolsWithTokens(): Promise<Array<{ poolAddress: string, dexType: string, token0: string, token1: string }>> {
    const result = await this.db.all(`
      SELECT pool_address, dex_type, token0, token1 FROM tbl_dex_pool 
      WHERE dex_type IN ('uniswapV2', 'sushiswapV2')
    `);
    return result.map(row => ({
      poolAddress: row.pool_address,
      dexType: row.dex_type,
      token0: row.token0,
      token1: row.token1
    }));
  }

  /**
   * Get token information (decimal and symbol) from database or cache
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    if (this.tokenCache.has(tokenAddress)) {
      return this.tokenCache.get(tokenAddress)!;
    }

    try {
      const result = await this.db.get(`
        SELECT decimal, symbol FROM tbl_dex_token WHERE address = ?
      `, [tokenAddress]);

      const tokenInfo: TokenInfo = {
        address: tokenAddress,
        decimal: result?.decimal ? parseInt(result.decimal.toString()) : 18, // Default to 18 if not found
        symbol: result?.symbol ? result.symbol.toString() : 'UNKNOWN'
      };

      this.tokenCache.set(tokenAddress, tokenInfo);
      this.debugLog(`Token info for ${tokenAddress}: decimal=${tokenInfo.decimal}, symbol=${tokenInfo.symbol}`);
      return tokenInfo;

    } catch (error) {
      console.error(`❌ Error getting token info for address: ${tokenAddress}`, error);

      // Return default values on error
      const defaultTokenInfo: TokenInfo = {
        address: tokenAddress,
        decimal: 18,
        symbol: 'UNKNOWN'
      };

      this.tokenCache.set(tokenAddress, defaultTokenInfo);
      return defaultTokenInfo;
    }
  }

  /**
   * Get token decimal from database or cache (backward compatibility)
   */
  async getTokenDecimals(tokenAddress: string): Promise<number> {
    const tokenInfo = await this.getTokenInfo(tokenAddress);
    return tokenInfo.decimal;
  }

  /**
   * Check pools liquidity in batches - simple version that only returns pool address and balances
   */
  async checkPoolsLiquidity(poolAddresses: string[]): Promise<PoolLiquidityInfo[]> {
    this.debugLog(`Starting checkPoolsLiquidity with ${poolAddresses.length} pools`);
    const liquidityInfos: PoolLiquidityInfo[] = [];

    for (let i = 0; i < poolAddresses.length; i += this.BATCH_SIZE) {
      const batch = poolAddresses.slice(i, i + this.BATCH_SIZE);
      const batchNumber = Math.floor(i / this.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(poolAddresses.length / this.BATCH_SIZE);

      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} pools)`);
      // console.log(`Batch ${batchNumber} pool addresses:`, batch);

      try {
        // console.log(`Calling viewPair with ${batch.length} addresses`);

        const reservesArray = await this.viewContract.viewPair(batch);

        for (let j = 0; j < batch.length; j++) {
          const poolAddress = batch[j];
          const token0Balance = BigInt(reservesArray[j * 2].toString());
          const token1Balance = BigInt(reservesArray[j * 2 + 1].toString());

          // this.debugLog(`Pool ${j + 1}/${batch.length}: ${poolAddress}`);
          // this.debugLog(`  Raw balances: token0=${token0Balance.toString()}, token1=${token1Balance.toString()}`);

          liquidityInfos.push({
            poolAddress,
            token0Balance,
            token1Balance
          });
        }
      } catch (error) {
        console.error(`Error fetching reserves for batch ${batchNumber}:`, error);
        this.debugLog(`Batch ${batchNumber} failed, skipping to next batch`);
        // Skip failed batch and continue
        continue;
      }
    }

    this.debugLog(`checkPoolsLiquidity completed. Processed ${liquidityInfos.length} pools successfully`);
    return liquidityInfos;
  }

  /**
   * Convert balance from wei to token units considering decimal
   */
  private balanceToTokenUnits(balance: bigint, decimal: number): number {
    return Number(balance) / Math.pow(10, decimal);
  }

  /**
   * Enrich pool liquidity info with token information and decimal
   */
  async enrichPoolsWithTokenInfo(liquidityInfos: PoolLiquidityInfo[]): Promise<PoolWithTokenInfo[]> {
    const enrichedPools: PoolWithTokenInfo[] = [];

    for (const info of liquidityInfos) {
      try {
        // Get pool token information from database
        const poolData = await this.db.get(`
          SELECT dex_type, token0, token1 FROM tbl_dex_pool WHERE pool_address = ?
        `, [info.poolAddress]);

        if (poolData) {
          this.debugLog(`Processing pool: ${info.poolAddress}, token0: ${poolData.token0}, token1: ${poolData.token1}`);

          const token0Info = await this.getTokenInfo(poolData.token0);
          const token1Info = await this.getTokenInfo(poolData.token1);

          enrichedPools.push({
            poolAddress: info.poolAddress,
            dexType: poolData.dex_type,
            token0: poolData.token0,
            token1: poolData.token1,
            token0Balance: info.token0Balance,
            token1Balance: info.token1Balance,
            token0Decimal: token0Info.decimal,
            token1Decimal: token1Info.decimal,
            token0Symbol: token0Info.symbol,
            token1Symbol: token1Info.symbol
          });
        } else {
          console.warn(`⚠️  Pool data not found for address: ${info.poolAddress}`);
        }
      } catch (error) {
        console.error(`❌ Error enriching pool ${info.poolAddress}:`, error);
        // Continue with next pool instead of failing completely
        continue;
      }
    }

    return enrichedPools;
  }

  /**
   * Check if token symbol contains BTC
   */
  private isBtcToken(symbol?: string): boolean {
    if (!symbol) return false;
    const upperSymbol = symbol.toUpperCase();
    return upperSymbol.includes('BTC');
  }

  /**
   * Check if token symbol contains ETH
   */
  private isEthToken(symbol?: string): boolean {
    if (!symbol) return false;
    const upperSymbol = symbol.toUpperCase();
    return upperSymbol.includes('ETH');
  }

  /**
   * Get minimum balance threshold based on token symbols
   */
  private getMinBalanceThreshold(token0Symbol?: string, token1Symbol?: string): number {
    // Check for BTC tokens first (lowest threshold)
    if (this.isBtcToken(token0Symbol) || this.isBtcToken(token1Symbol)) {
      return this.MIN_BALANCE_THRESHOLD_BTC;
    }
    // Check for ETH tokens (medium threshold)
    if (this.isEthToken(token0Symbol) || this.isEthToken(token1Symbol)) {
      return this.MIN_BALANCE_THRESHOLD_ETH;
    }
    // Default for other tokens (highest threshold)
    return this.MIN_BALANCE_THRESHOLD_OTHER;
  }

  /**
   * Find pools with low liquidity considering token decimal and symbols
   */
  findLowLiquidityPools(poolsWithTokenInfo: PoolWithTokenInfo[]): PoolWithTokenInfo[] {
    return poolsWithTokenInfo.filter(info => {
      const token0Units = this.balanceToTokenUnits(info.token0Balance, info.token0Decimal);
      const token1Units = this.balanceToTokenUnits(info.token1Balance, info.token1Decimal);

      const threshold = this.getMinBalanceThreshold(info.token0Symbol, info.token1Symbol);

      return token0Units < threshold || token1Units < threshold;
    });
  }

  /**
   * Log low liquidity pools with decimal-adjusted balances
   */
  logLowLiquidityPools(lowLiquidityPools: PoolWithTokenInfo[]): void {
    console.log(`\n=== Low Liquidity Pools (${lowLiquidityPools.length} pools) ===`);
    lowLiquidityPools.forEach(pool => {
      const token0Units = this.balanceToTokenUnits(pool.token0Balance, pool.token0Decimal);
      const token1Units = this.balanceToTokenUnits(pool.token1Balance, pool.token1Decimal);
      const threshold = this.getMinBalanceThreshold(pool.token0Symbol, pool.token1Symbol);

      console.log(`Pool Address: ${pool.poolAddress} (${pool.dexType})`);
      console.log(`  Token0: ${pool.token0Symbol} Balance: ${token0Units.toFixed(6)} (${pool.token0Balance.toString()} wei)`);
      console.log(`  Token1: ${pool.token1Symbol} Balance: ${token1Units.toFixed(6)} (${pool.token1Balance.toString()} wei)`);
      const tokenType = this.isBtcToken(pool.token0Symbol) || this.isBtcToken(pool.token1Symbol) ? 'BTC' :
        this.isEthToken(pool.token0Symbol) || this.isEthToken(pool.token1Symbol) ? 'ETH' : 'Other';
      console.log(`  Threshold used: ${threshold} (${tokenType})\n`);
    });
  }

  /**
   * Find isolated pools - pools where tokens appear in only one pool across ALL DEX types
   * These pools cannot participate in circular arbitrage
   */
  async findIsolatedPools(): Promise<string[]> {
    this.debugLog('Starting isolated pools analysis...');

    // Get token usage count across ALL DEX types (not just V2)
    const tokenUsageQuery = `
      SELECT token_address, COUNT(*) as pool_count
      FROM (
        SELECT token0 as token_address FROM tbl_dex_pool
        UNION ALL
        SELECT token1 as token_address FROM tbl_dex_pool
      ) token_usage
      GROUP BY token_address
    `;

    const tokenUsage = await this.db.all(tokenUsageQuery);

    // Debug: Show token usage distribution
    if (this.debugMode) {
      console.log('\n=== Token Usage Distribution ===');
      const usageStats = tokenUsage.reduce((acc, row) => {
        const count = row.pool_count;
        acc[count] = (acc[count] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      Object.entries(usageStats).forEach(([poolCount, tokenCount]) => {
        console.log(`Tokens appearing in ${poolCount} pool(s): ${tokenCount} tokens`);
      });
    }

    const singleUseTokens = new Set(
      tokenUsage
        .filter(row => row.pool_count === 1)
        .map(row => row.token_address)
    );

    this.debugLog(`Found ${singleUseTokens.size} tokens that appear in only one pool across all DEX types`);

    if (singleUseTokens.size === 0) {
      return [];
    }

    // Find V2/SushiSwap V2 pools that contain any single-use token
    // We only target V2 pools for removal since that's what we're cleaning
    const isolatedPoolsQuery = `
      SELECT pool_address, token0, token1, dex_type
      FROM tbl_dex_pool 
      WHERE dex_type IN ('uniswapV2', 'sushiswapV2')
      AND (token0 IN (${Array.from(singleUseTokens).map(() => '?').join(',')}) 
           OR token1 IN (${Array.from(singleUseTokens).map(() => '?').join(',')}))
    `;

    const queryParams = [...Array.from(singleUseTokens), ...Array.from(singleUseTokens)];
    const isolatedPools = await this.db.all(isolatedPoolsQuery, queryParams);

    this.debugLog(`Found ${isolatedPools.length} V2/SushiSwap V2 pools containing tokens that appear in only one pool globally`);

    return isolatedPools.map(pool => pool.pool_address);
  }

  /**
   * Check how many pools a specific token appears in across all DEX types
   */
  async checkTokenUsage(tokenAddress: string): Promise<void> {
    const usageQuery = `
      SELECT dex_type, pool_address, 
             CASE WHEN token0 = ? THEN 'token0' ELSE 'token1' END as position
      FROM tbl_dex_pool 
      WHERE token0 = ? OR token1 = ?
      ORDER BY dex_type, pool_address
    `;

    const usage = await this.db.all(usageQuery, [tokenAddress, tokenAddress, tokenAddress]);

    console.log(`\n=== Token Usage Analysis for ${tokenAddress} ===`);
    console.log(`Total pools: ${usage.length}`);

    const dexCounts = usage.reduce((acc, row) => {
      acc[row.dex_type] = (acc[row.dex_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('Distribution by DEX type:');
    Object.entries(dexCounts).forEach(([dexType, count]) => {
      console.log(`  ${dexType}: ${count} pools`);
    });

    if (this.debugMode) {
      console.log('\nDetailed usage:');
      usage.forEach(row => {
        console.log(`  ${row.dex_type}: ${row.pool_address} (${row.position})`);
      });
    }
  }

  /**
   * Log isolated pools with token information
   */
  async logIsolatedPools(isolatedPoolAddresses: string[]): Promise<void> {
    if (isolatedPoolAddresses.length === 0) {
      console.log('\n=== No Isolated Pools Found ===');
      return;
    }

    console.log(`\n=== Isolated Pools (${isolatedPoolAddresses.length} pools) ===`);
    console.log('These V2/SushiSwap V2 pools contain tokens that appear in only one pool globally:\n');

    for (const poolAddress of isolatedPoolAddresses) {
      const poolData = await this.db.get(`
        SELECT dex_type, token0, token1 FROM tbl_dex_pool WHERE pool_address = ?
      `, [poolAddress]);

      if (poolData) {
        const token0Info = await this.getTokenInfo(poolData.token0);
        const token1Info = await this.getTokenInfo(poolData.token1);

        console.log(`Pool Address: ${poolAddress} (${poolData.dex_type})`);
        console.log(`  Token0: ${token0Info.symbol} (${poolData.token0})`);
        console.log(`  Token1: ${token1Info.symbol} (${poolData.token1})`);

        // Show usage count for each token if in debug mode
        if (this.debugMode) {
          await this.checkTokenUsage(poolData.token0);
          await this.checkTokenUsage(poolData.token1);
        }
        console.log();
      }
    }
  }

  /**
   * Delete isolated pools from database
   */
  async deleteIsolatedPools(poolAddresses: string[]): Promise<number> {
    if (poolAddresses.length === 0) {
      console.log('No isolated pools to delete.');
      return 0;
    }

    const placeholders = poolAddresses.map(() => '?').join(',');
    const result = await this.db.run(`
      DELETE FROM tbl_dex_pool 
      WHERE pool_address IN (${placeholders})
    `, poolAddresses);

    console.log(`Deleted ${result.changes} isolated pools.`);
    return result.changes || 0;
  }

  /**
   * Delete low liquidity pools from database
   */
  async deleteLowLiquidityPools(poolAddresses: string[]): Promise<number> {
    if (poolAddresses.length === 0) {
      console.log('No low liquidity pools to delete.');
      return 0;
    }

    const placeholders = poolAddresses.map(() => '?').join(',');
    const result = await this.db.run(`
      DELETE FROM tbl_dex_pool 
      WHERE pool_address IN (${placeholders})
    `, poolAddresses);

    console.log(`Deleted ${result.changes} low liquidity pools.`);
    return result.changes || 0;
  }

  /**
   * Clean isolated pools - remove pools that cannot participate in circular arbitrage
   */
  async cleanIsolatedPools(): Promise<void> {
    try {
      console.log('🏝️ Starting isolated pools cleanup...');

      // 1. Find isolated pools
      const isolatedPoolAddresses = await this.findIsolatedPools();

      // 2. Log isolated pools
      await this.logIsolatedPools(isolatedPoolAddresses);

      // 3. Delete isolated pools
      const deletedCount = await this.deleteIsolatedPools(isolatedPoolAddresses);

      console.log(`📊 Found ${isolatedPoolAddresses.length} isolated pools that cannot participate in circular arbitrage.`);
      console.log(`�️F Deleted ${deletedCount} isolated pools from database.`);
      console.log('✅ Isolated pools cleanup completed.');
    } catch (error) {
      console.error('❌ Error during isolated pools cleanup:', error);
      throw error;
    }
  }

  /**
   * Execute comprehensive pool cleanup (isolated pools + low liquidity pools)
   */
  async cleanAllPools(): Promise<void> {
    try {
      console.log('🔍 Starting comprehensive pool cleanup...');
      console.log('This will clean both isolated pools and low liquidity pools.\n');

      let totalDeletedPools = 0;

      // 1. Clean isolated pools first (they can't participate in arbitrage anyway)
      console.log('='.repeat(60));
      console.log('STEP 1: ISOLATED POOLS CLEANUP');
      console.log('='.repeat(60));
      const isolatedPoolAddresses = await this.findIsolatedPools();
      await this.logIsolatedPools(isolatedPoolAddresses);
      const deletedIsolatedCount = await this.deleteIsolatedPools(isolatedPoolAddresses);
      totalDeletedPools += deletedIsolatedCount;

      console.log('\n' + '='.repeat(60));
      console.log('STEP 2: LOW LIQUIDITY POOLS CLEANUP');
      console.log('='.repeat(60));
      // 2. Clean low liquidity pools (after isolated pools are removed)
      await this.cleanLowLiquidityPools();

      console.log('\n' + '='.repeat(60));
      console.log('✅ Comprehensive pool cleanup completed.');
      console.log(`🗑️ Total pools removed: ${totalDeletedPools} isolated pools + low liquidity pools`);
      console.log('Database has been cleaned of ineffective pools for arbitrage.');
      console.log('='.repeat(60));
    } catch (error) {
      console.error('❌ Error during comprehensive pool cleanup:', error);
      throw error;
    }
  }

  /**
   * Execute the complete low liquidity pool cleanup process
   */
  async cleanLowLiquidityPools(): Promise<void> {
    try {
      console.log('💧 Starting low liquidity pool cleanup...');

      // 1. Get V2 and SushiSwap V2 pool addresses only
      const pools = await this.getAllPoolsWithTokens();
      const poolAddresses = pools.map(p => p.poolAddress);
      console.log(`📊 Found ${pools.length} V2/SushiSwap V2 pools to check for liquidity.`);

      const dexTypeCounts = pools.reduce((acc, pool) => {
        acc[pool.dexType] = (acc[pool.dexType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('📈 DEX type distribution:', dexTypeCounts);

      // 2. Check liquidity (simple version - only balances)
      console.log('🔍 Checking pool liquidity via smart contracts...');
      const liquidityInfos = await this.checkPoolsLiquidity(poolAddresses);

      // 3. Enrich with token information and decimal
      console.log('🔗 Enriching pools with token information...');
      const poolsWithTokenInfo = await this.enrichPoolsWithTokenInfo(liquidityInfos);

      // 4. Find low liquidity pools
      const lowLiquidityPools = this.findLowLiquidityPools(poolsWithTokenInfo);

      // 5. Log results
      this.logLowLiquidityPools(lowLiquidityPools);

      // 6. Delete low liquidity pools
      const deletedCount = await this.deleteLowLiquidityPools(
        lowLiquidityPools.map(pool => pool.poolAddress)
      );

      console.log(`📊 Found ${lowLiquidityPools.length} low liquidity pools.`);
      console.log(`�️ Denleted ${deletedCount} low liquidity pools from database.`);
      console.log('✅ Low liquidity pool cleanup completed.');
    } catch (error) {
      console.error('❌ Error during liquidity cleanup:', error);
      throw error;
    }
  }
}