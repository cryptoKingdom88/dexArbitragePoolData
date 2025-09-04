import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

interface Token {
  id: string;
  name: string;
  symbol: string;
  decimals: string;
  totalLiquidity: string;
}

interface Pair {
  id: string; // pool address
  feeTier?: string;
  token0: Token;
  token1: Token;
  volumeUSD: string;
}

interface DexFile {
  data: {
    pairs?: Pair[];
    pools?: Pair[];
  };
}

// === Enhanced types for better type safety ===
interface TokenInfo {
  address: string;
  symbol: string;
}

interface PoolEdge {
  pool: string;
  toToken: string;
}

interface ArbitragePath {
  tokens: string[];
  pools: string[];
  length: number;
  swapPath: string;
}

interface ArbitrageStep {
  pathId: number;
  stepIndex: number;
  poolAddress: string;
  fromToken: string;
  toToken: string;
  isForward: boolean;
}

const JSON_FOLDER = "/Volumes/Resource/Project/Git/arbitrageCheck/00_PreData/DexPoolData";

// Extract dex type from filename (e.g., "uniswapV3-10.json" → "uniswapV3")
function getDexTypeFromFile(fileName: string): string {
  return fileName.split("-")[0];
}

// === Batch processing configuration ===
const BATCH_CONFIG = {
  PATHS_BATCH_SIZE: 1000,      // Insert paths in batches of 1000 (back to stable size)
  STEPS_BATCH_SIZE: 5000,      // Insert steps in batches of 5000
  FLUSH_INTERVAL_MS: 1000      // Flush every 1 second
} as const;

// === Constants ===
// WETH (Wrapped Ether) contract address on Ethereum mainnet  
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2".toLowerCase(); // Correct WETH address

// === Utility to determine swap direction ===
function isForwardSwap(from: string, pool: Pair): boolean {
  return from === pool.token0.id;
}

// === Build arbitrage paths (cycles of length 3~5) ===
// This is a naive depth-first search to find all cycles starting from each token
async function findArbitragePaths(db: any) {
  console.log("🔍 Starting arbitrage path discovery...");

  try {
    // Fetch all pools and their tokens in a single batch
    const [pools, tokens] = await Promise.all([
      db.all("SELECT * FROM tbl_dex_pool"),
      db.all("SELECT address, symbol FROM tbl_dex_token") // Only fetch required fields
    ]);

    console.log(`📊 Loaded ${pools.length} pools and ${tokens.length} tokens`);

    // Create efficient token cache map for O(1) symbol lookups
    const tokenCache = new Map<string, string>();
    tokens.forEach((token: TokenInfo) => {
      tokenCache.set(token.address, token.symbol);
    });

    console.log("✅ Token cache initialized");

    // Build adjacency map: token -> list of connected pools
    const adjMap = new Map<string, PoolEdge[]>();

    for (const pool of pools) {
      // Initialize arrays if they don't exist
      if (!adjMap.has(pool.token0)) adjMap.set(pool.token0, []);
      if (!adjMap.has(pool.token1)) adjMap.set(pool.token1, []);

      // Add bidirectional edges
      adjMap.get(pool.token0)!.push({ pool: pool.pool_address, toToken: pool.token1 });
      adjMap.get(pool.token1)!.push({ pool: pool.pool_address, toToken: pool.token0 });
    }

    console.log("🔗 Adjacency map constructed");

    const maxDepth = 3;
    const minDepth = 3;
    let pathsFound = 0;

    // === Batch processing buffers ===
    const pathBatch: ArbitragePath[] = [];
    const stepBatch: ArbitrageStep[] = [];

    // === Mutex for preventing concurrent batch flushes ===
    let isFlushingBatch = false;

    // Recursive DFS function to find cycles - optimized for WETH-only paths
    async function dfs(start: string, current: string, visitedPools: Set<string>, pathTokens: string[], pathPools: string[]): Promise<void> {
      if (pathTokens.length > maxDepth) return;

      const edges = adjMap.get(current);
      if (!edges) return; // No connections from this token

      for (const { pool, toToken } of edges) {
        if (visitedPools.has(pool)) continue; // Avoid using same pool twice in path

        const newVisitedPools = new Set(visitedPools);
        newVisitedPools.add(pool);

        const newPathTokens = [...pathTokens, toToken];
        const newPathPools = [...pathPools, pool];

        if (toToken === start && newPathTokens.length >= minDepth + 1) {
          // Found a valid arbitrage cycle - no need to check WETH here since we only start with WETH
          addPathToBatch(newPathTokens, newPathPools);
          pathsFound++;

          if (pathsFound % 1000 === 0) {
            console.log(`📈 Found ${pathsFound} WETH arbitrage paths so far... (Batch: ${pathBatch.length} paths pending)`);
          }

          // Simple synchronous batch processing - wait when batch is full
          if (!isFlushingBatch && pathBatch.length >= BATCH_CONFIG.PATHS_BATCH_SIZE) {
            console.log(`💾 Batch full (${pathBatch.length} paths), processing...`);
            await checkAndFlushBatches();
          }
        } else {
          await dfs(start, toToken, newVisitedPools, newPathTokens, newPathPools);
        }
      }
    }

    // Cache pool data for efficient lookups during path insertion
    const poolCache = new Map<string, any>();
    pools.forEach((pool: any) => {
      poolCache.set(pool.pool_address, pool);
    });

    // === Batch processing functions ===

    // Add WETH arbitrage path to batch buffer - no validation needed since we only call from WETH paths
    function addPathToBatch(pathTokens: string[], pathPools: string[]) {
      const length = pathTokens.length - 1; // number of steps

      // Use cached token symbols instead of DB queries for each token
      const symbols = pathTokens.map((addr: string) => {
        const symbol = tokenCache.get(addr);
        if (!symbol) {
          console.warn(`⚠️  Symbol not found for token: ${addr}`);
          return addr; // fallback to address
        }
        return symbol;
      });

      const swapPath = symbols.join("-");

      // Add path to batch
      pathBatch.push({
        tokens: pathTokens,
        pools: pathPools,
        length,
        swapPath
      });

      // Log first few paths for verification
      if (pathBatch.length <= 5) {
        console.log(`✅ WETH Arbitrage Path ${pathBatch.length}: ${swapPath}`);
      }
    }

    // Flush batches to database with proper ID mapping
    async function flushBatches(forceFlush = false) {
      // Prevent concurrent flush operations
      if (isFlushingBatch) {
        console.log("⏳ Batch flush already in progress, skipping...");
        return;
      }

      // Check if there's anything to flush
      if (pathBatch.length === 0 && !forceFlush) return;

      // Acquire mutex
      isFlushingBatch = true;

      try {
        const batchStartTime = Date.now();
        const pathCount = pathBatch.length;

        if (pathCount === 0) {
          console.log("📭 No paths to flush");
          return;
        }

        console.log(`💾 Flushing ${pathCount} paths to database...`);

        // Begin transaction for better performance
        await db.run("BEGIN TRANSACTION");

        // Insert paths one by one to get real IDs and generate corresponding steps
        const stepInserts: any[] = [];

        for (let pathIndex = 0; pathIndex < pathBatch.length; pathIndex++) {
          const path = pathBatch[pathIndex];

          // Insert path and get the real DB-generated ID
          const pathResult = await db.run(
            `INSERT INTO tbl_dex_arbitrage_path (length, swap_path) VALUES (?, ?)`,
            [path.length, path.swapPath]
          );

          const realPathId = pathResult.lastID;

          // Generate steps for this path using the real path ID
          const length = path.tokens.length - 1;
          for (let i = 0; i < length; i++) {
            const fromToken = path.tokens[i];
            const toToken = path.tokens[i + 1];
            const poolAddress = path.pools[i];

            // Use cached pool data instead of DB query
            const pool = poolCache.get(poolAddress);
            if (!pool) {
              console.warn(`⚠️  Pool not found in cache: ${poolAddress}`);
              continue;
            }

            const forward = isForwardSwap(fromToken, pool);
            stepInserts.push([
              realPathId,
              i,
              poolAddress,
              fromToken,
              toToken,
              forward ? 1 : 0
            ]);
          }
        }

        // Insert all steps in batch
        if (stepInserts.length > 0) {
          const stepStmt = await db.prepare(`
            INSERT INTO tbl_dex_arbitrage_step
            (path_id, step_index, pool_address, from_token, to_token, is_forward)
            VALUES (?, ?, ?, ?, ?, ?)
          `);

          for (const stepParams of stepInserts) {
            await stepStmt.run(stepParams);
          }
          await stepStmt.finalize();
        }

        // Commit transaction
        await db.run("COMMIT");

        const batchEndTime = Date.now();
        console.log(`✅ Batch flush completed: ${pathCount} paths, ${stepInserts.length} steps in ${batchEndTime - batchStartTime}ms`);

        // Clear batches
        pathBatch.length = 0;
        stepBatch.length = 0; // Clear step batch too (though it should be empty now)

      } catch (error) {
        await db.run("ROLLBACK");
        console.error(`❌ Error during batch flush:`, error);
        throw error;
      } finally {
        // Always release mutex
        isFlushingBatch = false;
      }
    }

    // Check if batches need flushing based on size (non-blocking)
    async function checkAndFlushBatches() {
      // Only flush if not already flushing and batch size threshold is reached
      if (!isFlushingBatch && pathBatch.length >= BATCH_CONFIG.PATHS_BATCH_SIZE) {
        await flushBatches();
      }
    }

    // === Setup periodic batch flushing with mutex protection ===
    const flushInterval = setInterval(async () => {
      // Only flush if not already flushing and there are paths to flush
      if (!isFlushingBatch && pathBatch.length > 0) {
        try {
          await flushBatches();
        } catch (error) {
          console.error("❌ Error in periodic flush:", error);
        }
      }
    }, BATCH_CONFIG.FLUSH_INTERVAL_MS);

    // Debug: Show all tokens that might be WETH
    console.log("🔍 Searching for WETH token...");
    console.log(`Target WETH address: ${WETH_ADDRESS}`);

    // Find WETH token in the database - optimized lookup
    console.log(`🎯 Looking for WETH token at address: ${WETH_ADDRESS}`);

    let wethToken = tokens.find((token: TokenInfo) => token.address.toLowerCase() === WETH_ADDRESS);

    // If not found with exact address, try to find by symbol as fallback
    if (!wethToken) {
      console.warn(`⚠️  WETH not found at expected address: ${WETH_ADDRESS}`);
      console.log("🔍 Trying to find WETH by symbol...");

      wethToken = tokens.find((token: TokenInfo) =>
        token.symbol && token.symbol.toLowerCase() === 'weth'
      );

      if (wethToken) {
        console.log(`✅ Found WETH by symbol: ${wethToken.symbol} at ${wethToken.address}`);
      } else {
        // Debug: Show ETH-related tokens for troubleshooting
        const ethTokens = tokens.filter((token: TokenInfo) =>
          token.symbol && token.symbol.toLowerCase().includes('eth')
        ).slice(0, 5);
        console.log("🔍 ETH-related tokens found:", ethTokens.map((t: TokenInfo) => ({
          address: t.address,
          symbol: t.symbol
        })));
      }
    }

    if (!wethToken) {
      console.error(`❌ WETH token not found in database`);
      console.log("📊 Total tokens in database:", tokens.length);
      throw new Error("WETH token not found in database - ensure WETH token data is loaded");
    }

    // Validate WETH token has connections before starting DFS
    const wethConnections = adjMap.get(wethToken.address);
    if (!wethConnections || wethConnections.length === 0) {
      console.error(`❌ WETH token has no pool connections: ${wethToken.address}`);
      throw new Error("WETH token has no liquidity pools - cannot find arbitrage paths");
    }

    console.log(`🎯 Found WETH token: ${wethToken.symbol} at ${wethToken.address}`);
    console.log(`🔗 WETH has ${wethConnections.length} pool connections`);
    console.log(`🚀 Starting arbitrage path discovery from WETH token only...`);

    try {
      // Only search for arbitrage paths starting and ending with WETH
      // WETH validation is done here at entry point - much more efficient than checking in DFS recursion
      console.log(`🔄 Processing WETH arbitrage paths...`);
      console.log(`📊 Current batch sizes - Paths: ${pathBatch.length}, Steps: ${stepBatch.length}`);

      await dfs(wethToken.address, wethToken.address, new Set(), [wethToken.address], []);

      // Final batch check after WETH processing
      if (!isFlushingBatch && pathBatch.length >= BATCH_CONFIG.PATHS_BATCH_SIZE) {
        console.log(`� FWETH processing completed, processing batch (${pathBatch.length} paths)...`);
        await checkAndFlushBatches();
      }

      // Clear the periodic flush interval
      clearInterval(flushInterval);

      // Final flush of remaining batches
      if (pathBatch.length > 0) {
        console.log(`🔄 Final batch flush (${pathBatch.length} remaining paths)...`);
        await flushBatches(true);
      }

      console.log(`✅ WETH arbitrage path discovery completed. Found ${pathsFound} total WETH→...→WETH paths.`);

    } catch (error) {
      clearInterval(flushInterval);
      throw error;
    }

  } catch (error) {
    console.error("❌ Error during arbitrage path discovery:", error);
    throw error;
  }
}

async function main() {
  // Open SQLite database (created in project root if not exists)
  const db = await open({
    filename: "dex_pools.db",
    driver: sqlite3.Database
  });

  // Create tables if they do not exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tbl_dex_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dex_type TEXT,
      pool_address TEXT,
      token0 TEXT,
      token1 TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tbl_dex_token (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT UNIQUE,
      name TEXT,
      symbol TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tbl_dex_arbitrage_path (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      length INTEGER,
      swap_path TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tbl_dex_arbitrage_step (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path_id INTEGER,
      step_index INTEGER,
      pool_address TEXT,
      from_token TEXT,
      to_token TEXT,
      is_forward BOOLEAN
    );
  `);

  // Read all JSON files from the specified folder
  const files = fs.readdirSync(JSON_FOLDER).filter(f => f.endsWith(".json"));

  for (const file of files) {
    const dexType = getDexTypeFromFile(file);
    const raw = fs.readFileSync(path.join(JSON_FOLDER, file), "utf-8");
    const json: DexFile = JSON.parse(raw);
    console.log("file : ", file)

    const pairs = dexType === "uniswapV3" ? json.data.pools : json.data.pairs;
    if (pairs === undefined) return;

    for (const pair of pairs) {
      // Insert token0 and token1 (ignore duplicates)
      const feeTier = dexType !== "uniswapV3" ? 3000 : pair.feeTier;
      await db.run(
        `INSERT OR IGNORE INTO tbl_dex_token (address, name, symbol, decimal) VALUES (?, ?, ?, ?)`,
        [pair.token0.id, pair.token0.name, pair.token0.symbol, pair.token0.decimals]
      );

      await db.run(
        `INSERT OR IGNORE INTO tbl_dex_token (address, name, symbol, decimal) VALUES (?, ?, ?, ?)`,
        [pair.token1.id, pair.token1.name, pair.token1.symbol, pair.token1.decimals]
      );

      // Insert pool information
      await db.run(
        `INSERT INTO tbl_dex_pool (dex_type, pool_address, fee_tier, token0, token1) VALUES (?, ?, ?, ?, ?)`,
        [dexType, pair.id, feeTier, pair.token0.id, pair.token1.id]
      );
    }
  }

  console.log("✅ Pools and tokens inserted. Now calculating arbitrage paths...");

  const startTime = Date.now();
  await findArbitragePaths(db);
  const endTime = Date.now();

  console.log(`✅ Arbitrage paths calculated and inserted into DB in ${(endTime - startTime) / 1000}s`);

  await db.close();
  console.log("🔒 Database connection closed.");
}

main().catch(err => {
  console.error("❌ Error:", err);
});
