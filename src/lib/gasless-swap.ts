import { createWalletClient, custom, encodeFunctionData, parseUnits, type Hash } from 'viem';
import { DEX_CONFIG } from '@/config/chain.config';
import { sepolia } from 'viem/chains';
import { signIntent } from './gasless-v2';

export type SwapIntent = {
  fromToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'];
  toToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'];
  amount: string;
  minAmountOut: string;
  deadline: number;
  userAddress: `0x${string}`;
  timestamp: number;
};

// Calculate minimum amount out with slippage
export function calculateMinAmountOut(amount: string, slippage: number = 0.5): string {
  const parsedAmount = parseFloat(amount);
  const minAmount = parsedAmount * (1 - slippage / 100);
  return minAmount.toString();
}

// Encode swap data for the DEX router
export function encodeSwapData(intent: SwapIntent): `0x${string}` {
  const fromToken = DEX_CONFIG['eth-sepolia'].TOKENS[intent.fromToken];
  const toToken = DEX_CONFIG['eth-sepolia'].TOKENS[intent.toToken];
  
  const exactInputSingleParams = {
    tokenIn: fromToken.address,
    tokenOut: toToken.address,
    fee: DEX_CONFIG['eth-sepolia'].POOL_FEES.MEDIUM, // Default to medium fee tier
    recipient: intent.userAddress,
    deadline: BigInt(intent.deadline),
    amountIn: parseUnits(intent.amount, fromToken.decimals),
    amountOutMinimum: parseUnits(intent.minAmountOut, toToken.decimals),
    sqrtPriceLimitX96: 0n // No price limit
  };

  return encodeFunctionData({
    abi: [{
      inputs: [{
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' }
        ],
        name: 'params',
        type: 'tuple'
      }],
      name: 'exactInputSingle',
      outputs: [{ name: 'amountOut', type: 'uint256' }],
      stateMutability: 'payable',
      type: 'function'
    }],
    functionName: 'exactInputSingle',
    args: [exactInputSingleParams]
  });
}

// Execute gasless swap
export async function executeGaslessSwap(
  intent: SwapIntent
): Promise<Hash> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
  }

  // Create wallet client for signing only (no gas needed!)
  const walletClient = createWalletClient({
    account: intent.userAddress,
    chain: sepolia,
    transport: custom((window as any).ethereum),
  });

  // Create intent message
  const message = JSON.stringify({
    type: 'swap',
    ...intent,
  });

  // Sign the intent (no gas!)
  const signature = await signIntent(message, walletClient);

  // Send to relayer backend
  const response = await fetch('/api/swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent,
      signature,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Relayer failed to execute swap');
  }

  const result = await response.json();
  return result.hash as Hash;
}

// Get quote for swap
export async function getSwapQuote(
  fromToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'],
  toToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'],
  amount: string
): Promise<{
  estimatedOutput: string;
  fee: string;
  priceImpact: string;
}> {
  // In a real implementation, this would call the DEX's quoter contract
  // For now, return mock values
  return {
    estimatedOutput: '0',
    fee: '0',
    priceImpact: '0'
  };
}
