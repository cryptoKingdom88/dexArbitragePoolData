import { Database } from 'sqlite';

/**
 * Database schema manager - handles table creation and migrations
 */
export class DatabaseSchema {
  constructor(private db: Database) {}

  /**
   * Initialize all required tables
   */
  async initializeTables(): Promise<void> {
    await this.createPoolTable();
    await this.createTokenTable();
    await this.createArbitragePathTable();
    await this.createArbitrageStepTable();
  }

  private async createPoolTable(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tbl_dex_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dex_type TEXT NOT NULL,
        pool_address TEXT NOT NULL,
        fee_tier TEXT,
        token0 TEXT NOT NULL,
        token1 TEXT NOT NULL,
        UNIQUE(pool_address)
      );
    `);

    // Create indexes for better query performance
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pool_tokens ON tbl_dex_pool(token0, token1);
    `);
  }

  private async createTokenTable(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tbl_dex_token (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT UNIQUE NOT NULL,
        name TEXT,
        symbol TEXT,
        decimals TEXT
      );
    `);

    // Create index for address lookups
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_token_address ON tbl_dex_token(address);
    `);
  }

  private async createArbitragePathTable(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tbl_dex_arbitrage_path (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        length INTEGER NOT NULL,
        swap_path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  private async createArbitrageStepTable(): Promise<void> {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tbl_dex_arbitrage_step (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path_id INTEGER NOT NULL,
        step_index INTEGER NOT NULL,
        pool_address TEXT NOT NULL,
        from_token TEXT NOT NULL,
        to_token TEXT NOT NULL,
        is_forward BOOLEAN NOT NULL,
        FOREIGN KEY (path_id) REFERENCES tbl_dex_arbitrage_path(id)
      );
    `);

    // Create index for path lookups
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_step_path_id ON tbl_dex_arbitrage_step(path_id);
    `);
  }
}