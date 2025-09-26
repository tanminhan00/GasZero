import { EXPAND_CONFIG } from '@/config/expand.config';
import { DEX_CONFIG } from '@/config/chain.config';
import { type Hash, parseUnits, formatUnits } from 'viem';

export type ExpandSwapQuote = {
  estimatedOutput: string;
  fee: string;
  priceImpact: string;
  gasEstimate: string;
};

export type ExpandSwapParams = {
  fromToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'];
  toToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'];
  amount: string;
  userAddress: `0x${string}`;
  slippage?: number;
};

export class ExpandService {
  private static async fetchWithAuth(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${EXPAND_CONFIG.API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        'X-API-KEY': EXPAND_CONFIG.API_KEY,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }

  static async getSwapQuote(params: ExpandSwapParams): Promise<ExpandSwapQuote> {
    const { fromToken, toToken, amount, userAddress } = params;

    const fromTokenConfig = DEX_CONFIG['eth-sepolia'].TOKENS[fromToken];
    const toTokenConfig = DEX_CONFIG['eth-sepolia'].TOKENS[toToken];

    // Get quote from Expand API
    const quoteResponse = await this.fetchWithAuth('/v1/dex/quote', {
      method: 'POST',
      body: JSON.stringify({
        dexId: EXPAND_CONFIG.DEX_ID,
        chainId: EXPAND_CONFIG.SUPPORTED_CHAINS['eth-sepolia'].chainId,
        amountIn: parseUnits(amount, fromTokenConfig.decimals).toString(),
        path: [fromTokenConfig.address, toTokenConfig.address],
        from: userAddress,
        gasPriority: EXPAND_CONFIG.GAS_PRIORITY,
      }),
    });

    return {
      estimatedOutput: formatUnits(quoteResponse.amountOut, toTokenConfig.decimals),
      fee: quoteResponse.fee || '0',
      priceImpact: quoteResponse.priceImpact || '0',
      gasEstimate: quoteResponse.gasEstimate || '0',
    };
  }

  static async executeSwap(params: ExpandSwapParams): Promise<Hash> {
    const { fromToken, toToken, amount, userAddress, slippage = 0.5 } = params;

    const fromTokenConfig = DEX_CONFIG['eth-sepolia'].TOKENS[fromToken];
    const toTokenConfig = DEX_CONFIG['eth-sepolia'].TOKENS[toToken];
    const amountIn = parseUnits(amount, fromTokenConfig.decimals);

    // Get swap transaction from Expand API
    const swapResponse = await this.fetchWithAuth('/v1/dex/swap', {
      method: 'POST',
      body: JSON.stringify({
        dexId: EXPAND_CONFIG.DEX_ID,
        chainId: EXPAND_CONFIG.SUPPORTED_CHAINS['eth-sepolia'].chainId,
        amountIn: amountIn.toString(),
        amountOutMin: '0', // We'll handle slippage in the smart contract
        path: [fromTokenConfig.address, toTokenConfig.address],
        to: userAddress,
        from: userAddress,
        gas: '300000', // Higher gas limit for swaps
        gasPriority: EXPAND_CONFIG.GAS_PRIORITY,
      }),
    });

    // Execute the transaction through our relayer
    const response = await fetch('/api/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: {
          type: 'swap',
          fromToken,
          toToken,
          amount,
          minAmountOut: swapResponse.amountOutMin,
          userAddress,
          timestamp: Date.now(),
        },
        expandData: swapResponse.data, // Pass Expand's transaction data
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to execute swap');
    }

    const result = await response.json();
    return result.hash as Hash;
  }
}
