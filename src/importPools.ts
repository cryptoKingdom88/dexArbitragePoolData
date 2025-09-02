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
  feeTier ?: string;
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

// === Constant for JSON folder path ===
// Example: "./jsondata"
const JSON_FOLDER = "/Volumes/Resource/Project/Git/arbitrageCheck/00_PreData/DexPoolData";

// Extract dex type from filename (e.g., "uniswapV3-10.json" → "uniswapV3")
function getDexTypeFromFile(fileName: string): string {
  return fileName.split("-")[0];
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
      token1 TEXT,
      token2 TEXT
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
        `INSERT INTO tbl_dex_pool (dex_type, pool_address, fee_tier, token1, token2) VALUES (?, ?, ?, ?, ?)`,
        [dexType, pair.id, feeTier, pair.token0.id, pair.token1.id]
      );
    }
  }

  console.log(`✅ Data inserted successfully from folder: ${JSON_FOLDER}`);
}

main().catch(err => {
  console.error("❌ Error:", err);
});
