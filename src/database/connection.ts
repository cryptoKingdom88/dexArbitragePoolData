import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { DATA_CONFIG } from '../config/constants';

/**
 * Database connection manager
 */
export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: Database | null = null;

  private constructor() {}

  /**
   * Singleton pattern for database connection
   */
  static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  /**
   * Open database connection
   */
  async connect(): Promise<Database> {
    if (this.db) {
      return this.db;
    }

    this.db = await open({
      filename: DATA_CONFIG.DATABASE_PATH,
      driver: sqlite3.Database
    });

    console.log(`🔗 Database connected: ${DATA_CONFIG.DATABASE_PATH}`);
    return this.db;
  }

  /**
   * Get current database connection
   */
  getConnection(): Database {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log('🔒 Database connection closed.');
    }
  }
}