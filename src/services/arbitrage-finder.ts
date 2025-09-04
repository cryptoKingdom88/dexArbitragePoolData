import { Database } from 'sqlite';
import { TokenInfo, PoolInfo, PoolEdge, ArbitragePath } from '../types';
import { ARBITRAGE_CONFIG } from '../config/constants';
import { BatchProcessor } from './batch-processor';

/**
 * Service for discovering arbitrage paths using DFS algorithm
 */
export class ArbitrageFinderService {
  private tokenCache = new Map<string, string>();
  private adjMap = new Map<string, PoolEdge[]>();
  private poolCache = new Map<string, PoolInfo>();
  private batchProcessor: BatchProcessor;
  private pathsFound = 0;

  constructor(private db: Database) {
    this.batchProcessor = new BatchProcessor(db);
  }

  /**
   * Main entry point for arbitrage path discovery
   */
  async findArbitragePaths(): Promise<number> {
    console.log('🔍 Starting arbitrage path discovery...');

    await this.loadDataFromDatabase();
    await this.buildAdjacencyMap();

    const wethToken = await this.findWethToken();
    await this.validateWethConnections(wethToken);

    console.log(`🚀 Starting WETH arbitrage path discovery...`);

    await this.batchProcessor.initialize();

    try {
      await this.dfs(
        wethToken.address,
        wethToken.address,
        new Set(),
        [wethToken.address],
        []
      );

      await this.batchProcessor.finalize();

      console.log(`✅ WETH arbitrage path discovery completed. Found ${this.pathsFound} total paths.`);
      return this.pathsFound;

    } catch (error) {
      await this.batchProcessor.cleanup();
      throw error;
    }
  }

  /**
   * Load required data from database
   */
  private async loadDataFromDatabase(): Promise<void> {
    const [pools, tokens] = await Promise.all([
      this.db.all<PoolInfo[]>('SELECT * FROM tbl_dex_pool'),
      this.db.all<TokenInfo[]>('SELECT address, symbol FROM tbl_dex_token')
    ]);

    console.log(`📊 Loaded ${pools.length} pools and ${tokens.length} tokens`);

    // Build token cache for O(1) symbol lookups
    tokens.forEach(token => {
      this.tokenCache.set(token.address, token.symbol);
    });

    // Build pool cache for efficient lookups
    pools.forEach(pool => {
      this.poolCache.set(pool.pool_address, pool);
    });

    console.log('✅ Data caches initialized');
  }

  /**
   * Build adjacency map for graph traversal
   */
  private async buildAdjacencyMap(): Promise<void> {
    const pools = Array.from(this.poolCache.values());

    for (const pool of pools) {
      // Initialize arrays if they don't exist
      if (!this.adjMap.has(pool.token0)) {
        this.adjMap.set(pool.token0, []);
      }
      if (!this.adjMap.has(pool.token1)) {
        this.adjMap.set(pool.token1, []);
      }

      // Add bidirectional edges
      this.adjMap.get(pool.token0)!.push({
        pool: pool.pool_address,
        toToken: pool.token1
      });
      this.adjMap.get(pool.token1)!.push({
        pool: pool.pool_address,
        toToken: pool.token0
      });
    }

    console.log('🔗 Adjacency map constructed');
  }

  /**
   * Find WETH token in database
   */
  private async findWethToken(): Promise<TokenInfo> {
    console.log(`🎯 Looking for WETH token at address: ${ARBITRAGE_CONFIG.WETH_ADDRESS}`);

    const tokens = await this.db.all<TokenInfo[]>('SELECT address, symbol FROM tbl_dex_token');

    let wethToken = tokens.find(token =>
      token.address.toLowerCase() === ARBITRAGE_CONFIG.WETH_ADDRESS
    );

    // Fallback: try to find by symbol
    if (!wethToken) {
      console.warn(`⚠️  WETH not found at expected address: ${ARBITRAGE_CONFIG.WETH_ADDRESS}`);
      console.log('🔍 Trying to find WETH by symbol...');

      wethToken = tokens.find(token =>
        token.symbol && token.symbol.toLowerCase() === 'weth'
      );

      if (wethToken) {
        console.log(`✅ Found WETH by symbol: ${wethToken.symbol} at ${wethToken.address}`);
      }
    }

    if (!wethToken) {
      throw new Error('WETH token not found in database - ensure WETH token data is loaded');
    }

    return wethToken;
  }

  /**
   * Validate WETH has pool connections
   */
  private async validateWethConnections(wethToken: TokenInfo): Promise<void> {
    const wethConnections = this.adjMap.get(wethToken.address);

    if (!wethConnections || wethConnections.length === 0) {
      throw new Error('WETH token has no liquidity pools - cannot find arbitrage paths');
    }

    console.log(`🎯 Found WETH token: ${wethToken.symbol} at ${wethToken.address}`);
    console.log(`🔗 WETH has ${wethConnections.length} pool connections`);
  }

  /**
   * Depth-First Search for arbitrage cycles
   */
  private async dfs(
    start: string,
    current: string,
    visitedPools: Set<string>,
    pathTokens: string[],
    pathPools: string[]
  ): Promise<void> {
    if (pathTokens.length > ARBITRAGE_CONFIG.MAX_DEPTH) return;

    const edges = this.adjMap.get(current);
    if (!edges) return;

    for (const { pool, toToken } of edges) {
      if (visitedPools.has(pool)) continue;

      const newVisitedPools = new Set(visitedPools);
      newVisitedPools.add(pool);

      const newPathTokens = [...pathTokens, toToken];
      const newPathPools = [...pathPools, pool];

      if (toToken === start && newPathTokens.length >= ARBITRAGE_CONFIG.MIN_DEPTH + 1) {
        // Found valid arbitrage cycle
        await this.processArbitragePath(newPathTokens, newPathPools);
      } else {
        await this.dfs(start, toToken, newVisitedPools, newPathTokens, newPathPools);
      }
    }
  }

  /**
   * Process discovered arbitrage path
   */
  private async processArbitragePath(pathTokens: string[], pathPools: string[]): Promise<void> {
    const length = pathTokens.length - 1;

    // Build swap path using cached symbols
    const symbols = pathTokens.map(addr => {
      const symbol = this.tokenCache.get(addr);
      if (!symbol) {
        console.warn(`⚠️  Symbol not found for token: ${addr}`);
        return addr;
      }
      return symbol;
    });

    const swapPath = symbols.join('-');

    const arbitragePath: ArbitragePath = {
      tokens: pathTokens,
      pools: pathPools,
      length,
      swapPath
    };

    await this.batchProcessor.addPath(arbitragePath, this.poolCache);
    this.pathsFound++;

    if (this.pathsFound % 1000 === 0) {
      console.log(`📈 Found ${this.pathsFound} WETH arbitrage paths so far...`);
    }
  }
}