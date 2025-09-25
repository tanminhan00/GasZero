import { baseSepolia } from 'viem/chains';

export const CHAIN = baseSepolia;

// Base Sepolia USDC (official testnet USDC)
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Entry point for Account Abstraction
export const ENTRYPOINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

export const BUNDLER_URL = process.env.NEXT_PUBLIC_BUNDLER_URL || '';
export const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || '';

// WalletConnect Project ID (optional - only for WalletConnect wallets)
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

// Validate required environment variables
if (!BUNDLER_URL && typeof window !== 'undefined') {
  console.warn('Missing NEXT_PUBLIC_BUNDLER_URL environment variable. Get your API key from https://dashboard.pimlico.io/');
}
