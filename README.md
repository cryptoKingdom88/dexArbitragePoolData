# DEX Arbitrage Path Discovery

A high-performance TypeScript application for discovering arbitrage opportunities in decentralized exchange (DEX) pools, specifically optimized for WETH-based arbitrage paths.

## 🏗️ Architecture

This project follows enterprise-grade software architecture principles with clear separation of concerns:

```
src/
├── types/           # Type definitions and interfaces
├── config/          # Configuration constants
├── database/        # Database connection and schema management
├── services/        # Business logic services
├── controllers/     # Application controllers
├── utils/           # Utility functions
├── cli.ts          # Command-line interface
└── index.ts        # Main application entry point
```

## 🚀 Features

- **WETH-Optimized Discovery**: Finds arbitrage paths that start and end with WETH for flash loan compatibility
- **High-Performance DFS**: Optimized depth-first search algorithm with early validation
- **Batch Processing**: Efficient database operations with configurable batch sizes
- **Memory Management**: Smart caching and batch flushing to prevent memory overflow
- **Concurrent Safety**: Mutex patterns to prevent race conditions
- **Liquidity Management**: Smart contract integration for pool liquidity validation
- **Enterprise Architecture**: Clean separation of concerns following SOLID principles

## 📦 Installation

```bash
npm install
```

## ⚙️ Environment Setup

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Infura API key:
```bash
INFURA_API_KEY=your_infura_api_key_here
```

## 🔧 Usage

### Command Line Interface

The application provides a CLI for different operations:

```bash
# Load DEX pool data from JSON files
npm run load-data

# Find arbitrage paths (requires data to be loaded first)
npm run find-paths

# Run complete pipeline (load data + find paths)
npm run full-pipeline

# Clean pools with low liquidity only
npm run clean-liquidity

# Clean isolated pools only (tokens appearing in only one pool)
npm run clean-isolated

# Comprehensive cleanup (both isolated and low liquidity pools)
npm run clean-all

# Show help
npm run cli help
```

### Programmatic Usage

```typescript
import { ArbitrageController } from './controllers/arbitrage-controller';

const controller = new ArbitrageController();

// Load pool data
await controller.loadPoolData();

// Find arbitrage paths
const pathsFound = await controller.findArbitragePaths();

// Or run full pipeline
await controller.execute();
```

## ⚙️ Configuration

Configuration is centralized in `src/config/constants.ts`:

```typescript
// Batch processing settings
export const BATCH_CONFIG = {
  PATHS_BATCH_SIZE: 1000,      // Insert paths in batches
  STEPS_BATCH_SIZE: 5000,      // Insert steps in batches  
  FLUSH_INTERVAL_MS: 1000      // Periodic flush interval
};

// Arbitrage discovery settings
export const ARBITRAGE_CONFIG = {
  MAX_DEPTH: 3,                // Maximum path length
  MIN_DEPTH: 3,                // Minimum path length
  WETH_ADDRESS: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
};
```

## 🗄️ Database Schema

The application uses SQLite with the following tables:

- `tbl_dex_token`: Token information (address, symbol, name, decimal)
- `tbl_dex_pool`: Pool information (DEX type, pool address, token pairs)
- `tbl_dex_arbitrage_path`: Discovered arbitrage paths
- `tbl_dex_arbitrage_step`: Individual steps within each path

## 🔍 How It Works

1. **Data Loading**: Parses JSON files containing DEX pool data and loads into SQLite
2. **Graph Construction**: Builds an adjacency map of token connections through pools
3. **WETH Discovery**: Locates WETH token and validates it has pool connections
4. **Path Finding**: Uses DFS to find cycles starting and ending with WETH
5. **Liquidity Validation**: Checks pool liquidity using deployed smart contracts
6. **Batch Processing**: Efficiently stores discovered paths using batch operations

## 🧹 Liquidity Management

The application includes advanced liquidity management features:

- **Smart Contract Integration**: Uses deployed view contracts to check pool reserves
- **Batch Liquidity Checks**: Processes up to 800 pools per batch for efficiency
- **Multi-DEX Support**: Works with Uniswap V2 and SushiSwap V2 protocols (V3 excluded due to different architecture)
- **Low Liquidity Detection**: Identifies pools with token balances below threshold
- **Automated Cleanup**: Option to remove low liquidity pools from database

### Usage

```bash
# Clean low liquidity pools only
npm run clean-liquidity

# Clean isolated pools only (tokens appearing in only one pool)
npm run clean-isolated

# Comprehensive cleanup (both isolated and low liquidity pools)
npm run clean-all

# Check specific token usage across all DEX types
npm run check-token 0x269616d549d7e8eaa82dfb17028d0b212d11232a

# Debug arbitrage path discovery (test WETH repetition prevention)
npm run debug-arbitrage

# Or use CLI directly
npm run cli clean-liquidity   # Clean low liquidity pools only
npm run cli clean-isolated    # Clean isolated pools only
npm run cli clean-all         # Clean both types
npm run cli check-token <address>  # Check token usage

**⚠️ WARNING:** Pool deletion is now ENABLED. These commands will permanently remove pools from the database.
```

The system will:
1. Fetch Uniswap V2 and SushiSwap V2 pool addresses with token information from database
2. Check liquidity in batches of 500 pools using smart contracts
3. Consider token decimal when calculating actual token balances
4. Apply different thresholds based on token symbols:
   - BTC tokens: < 0.3 token units
   - ETH tokens: < 5 token units  
   - Other tokens: < 10,000 token units
5. Delete pools that don't meet minimum liquidity requirements
5. Log all low liquidity pools with both wei and decimal-adjusted balances
6. Optionally remove them from database

### Key Features:
- **V2 Protocol Focus**: Only processes Uniswap V2 and SushiSwap V2 pools (V3 excluded)
- **Decimal-Aware**: Properly handles different token decimal (e.g., USDC has 6 decimal, WETH has 18)
- **Smart Thresholds**: Different minimum balance thresholds for BTC/ETH vs other tokens
- **Smart Contract Integration**: Uses deployed view contracts for efficient batch queries
- **Isolated Pool Detection**: Removes pools with tokens that appear in only one pool (cannot participate in circular arbitrage)
- **WETH Repetition Prevention**: Ensures WETH only appears at start and end of arbitrage paths, preventing redundant cycles
- **Environment Configuration**: Secure API key management through environment variables
- **Comprehensive Logging**: Shows both raw wei values and human-readable token amounts

## 🎯 Key Optimizations

- **Entry-Point Validation**: WETH validation moved to entry point instead of DFS recursion
- **Token Caching**: O(1) symbol lookups using Map-based cache
- **Pool Caching**: Efficient pool data access during path generation
- **Batch Operations**: Reduces database I/O with configurable batch sizes
- **Memory Management**: Prevents overflow with smart batch flushing

## 🛠️ Development

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Run built application
npm start

# Lint code
npm run lint
```

## 📊 Performance

The application is optimized for high-performance arbitrage discovery:

- **Batch Processing**: Handles thousands of paths efficiently
- **Memory Efficient**: Smart caching prevents memory overflow
- **Database Optimized**: Indexed tables and prepared statements
- **Concurrent Safe**: Mutex patterns prevent race conditions

## 🏢 Enterprise Features

- **Singleton Database Connection**: Prevents connection leaks
- **Transaction Management**: Ensures data consistency
- **Error Handling**: Comprehensive error handling and rollback
- **Logging**: Detailed progress and performance logging
- **Type Safety**: Full TypeScript type coverage
- **Modular Design**: Easy to extend and maintain

## 📝 License

ISC