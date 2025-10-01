// Expand Network Configuration for Testnets Only
export const EXPAND_CONFIG = {
  API_KEY: process.env.EXPAND_API_KEY || '',
  API_URL: 'https://api.expand.network',
  DEX_ID: '1301', // Default to Uniswap V3 on Ethereum Sepolia
  GAS_PRIORITY: 'medium' as const,
  SUPPORTED_CHAINS: {
    'eth-sepolia': {
      name: 'Ethereum Sepolia',
      chainId: '11155111',
      symbol: 'TETHSPL',
      rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo',
      dexId: '1301', // Uniswap V3
      availableDexes: {
        UNISWAP_V3: '1301',
        UNISWAP_V2: '1001',
        SUSHISWAP_V2: '1101',
        BALANCER_V2: '1402'
      },
      isDefault: true
    },
    'arb-sepolia': {
      name: 'Arbitrum Sepolia',
      chainId: '421614',
      symbol: 'TASPL',
      rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
      dexId: '3001', // Camelot V3
      availableDexes: {
        CAMELOT_V3: '3001'
      },
      isDefault: false
    }
  }
};

// Validate required environment variables
if (!EXPAND_CONFIG.API_KEY && typeof window !== 'undefined') {
  console.warn('Missing EXPAND_API_KEY environment variable');
}

// Export Testnet DEX IDs for reference
export const TESTNET_DEX_IDS = {
  // Ethereum Sepolia DEXes
  UNISWAP_V3_SEPOLIA: '1301',
  UNISWAP_V2_SEPOLIA: '1001',
  SUSHISWAP_V2_SEPOLIA: '1101',
  BALANCER_V2_SEPOLIA: '1402',
  // Arbitrum Sepolia DEXes
  CAMELOT_V3_ARB: '3001'
} as const;

// Export Chain Types
export type TestnetChainType = keyof typeof EXPAND_CONFIG.SUPPORTED_CHAINS;