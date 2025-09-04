import { Pair } from '../types';

/**
 * Utility functions for swap operations
 */
export class SwapUtils {
  /**
   * Determine if swap is in forward direction (token0 -> token1)
   */
  static isForwardSwap(fromToken: string, pool: Pair): boolean {
    return fromToken === pool.token0.id;
  }

  /**
   * Get the other token in a pair
   */
  static getOtherToken(token: string, pool: Pair): string {
    return token === pool.token0.id ? pool.token1.id : pool.token0.id;
  }

  /**
   * Validate if two tokens can form a valid swap pair
   */
  static canSwap(token0: string, token1: string, pool: Pair): boolean {
    return (
      (token0 === pool.token0.id && token1 === pool.token1.id) ||
      (token0 === pool.token1.id && token1 === pool.token0.id)
    );
  }
}