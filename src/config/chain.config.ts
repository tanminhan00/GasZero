import { arbitrumSepolia, baseSepolia, sepolia } from 'viem/chains';

export type NetworkType = 'eth-sepolia' | 'arb-sepolia' | 'base-sepolia';

export const NETWORKS = {
  'eth-sepolia': {
    name: 'Ethereum Sepolia',
    chain: sepolia,
    chainId: 11155111,
    // Ethereum Sepolia Uniswap V3 Router
    routerAddress: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    // Ethereum Sepolia Explorer
    explorer: 'https://sepolia.etherscan.io'
  },
  'arb-sepolia': {
    name: 'Arbitrum Sepolia',
    chain: arbitrumSepolia,
    chainId: 421614,
    // Arbitrum Sepolia Uniswap V3 Router
    routerAddress: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    // Arbitrum Sepolia Explorer
    explorer: 'https://sepolia.arbiscan.io'
  },
  'base-sepolia': {
    name: 'Base Sepolia',
    chain: baseSepolia,
    chainId: 84532,
    // Base Sepolia Uniswap V3 Router
    routerAddress: '0x4648a43B2C14Da09FdF82B161150d3F634f40491',
    // Base Sepolia Explorer
    explorer: 'https://sepolia.basescan.org'
  }
} as const;

// Entry point for Account Abstraction (same on all networks)
export const ENTRYPOINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

// Common pool fees (in basis points)
export const POOL_FEES = {
  LOW: 100,    // 0.01%
  MEDIUM: 500, // 0.05%
  HIGH: 3000   // 0.3%
} as const;

// Token interface
export interface Token {
  address: string;
  decimals: number;
  symbol: string;
  icon: string;
}

// Available tokens per network
export const DEX_CONFIG = {
  'eth-sepolia': {
    ROUTER_ADDRESS: NETWORKS['eth-sepolia'].routerAddress,
    QUOTER_ADDRESS: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3', // Quoter V2
    TOKENS: {
      ETH: {
        address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',  // Sepolia WETH
        decimals: 18,
        symbol: 'ETH',
        icon: '⚡'
      },
      USDC: {
        address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',  // Sepolia USDC
        decimals: 6,
        symbol: 'USDC',
        icon: '💰'
      }
    },
    POOLS: {
      'USDC-ETH': {
        address: '0xC31a3878E3B0739866F8fC52b97Ae9611aBe427c', // 0.3% fee tier pool with liquidity
        fee: 3000,
        token0: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC
        token1: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH
      }
    },
    POOL_FEES
  },
  'arb-sepolia': {
    ROUTER_ADDRESS: NETWORKS['arb-sepolia'].routerAddress,
    QUOTER_ADDRESS: '0xC195976fEF0985886E37036E2DF62bF371E12Df0', // Quoter V2 on Arbitrum Sepolia
    TOKENS: {
      ETH: {
        address: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',  // Arbitrum Sepolia WETH
        decimals: 18,
        symbol: 'ETH',
        icon: '⚡'
      },
      USDC: {
        address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',  // Arbitrum Sepolia USDC (correct address)
        decimals: 6,
        symbol: 'USDC',
        icon: '💰'
      }
    },
    POOLS: {
      'USDC-ETH': {
        address: '0xTODO', // Add pool address if you have one with liquidity
        fee: 3000,
        token0: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // USDC
        token1: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', // WETH
      }
    },
    POOL_FEES
  },
  'base-sepolia': {
    ROUTER_ADDRESS: NETWORKS['base-sepolia'].routerAddress,
    TOKENS: {
      ETH: {
        address: '0x4200000000000000000000000000000000000006', // WETH on Base
        decimals: 18,
        symbol: 'ETH',
        icon: '⚡'
      },
      USDC: {
        address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
        decimals: 6,
        symbol: 'USDC',
        icon: '💰'
      }
    },
    POOL_FEES
  }
} as const;

// Environment variables
export const BUNDLER_URL = process.env.NEXT_PUBLIC_BUNDLER_URL || '';
export const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || '';
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

// Validate required environment variables
if (!BUNDLER_URL && typeof window !== 'undefined') {
  console.warn('Missing NEXT_PUBLIC_BUNDLER_URL environment variable. Get your API key from https://dashboard.pimlico.io/');
}
