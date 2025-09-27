import { createWalletClient, custom, encodeFunctionData, parseUnits, type Hash, createPublicClient, http } from 'viem';
import { DEX_CONFIG, type NetworkType } from '@/config/chain.config';
import { sepolia, arbitrumSepolia } from 'viem/chains';
import { signIntent } from './gasless-v2';

export type SwapIntent = {
  network: NetworkType;
  fromToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'];
  toToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'];
  amount: string;
  minAmountOut: string;
  deadline: number;
  userAddress: `0x${string}`;
  timestamp: number;
};

// SwapRouter02 contract address
export const SWAP_ROUTER_ADDRESS = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';

// Calculate minimum amount out with slippage
export function calculateMinAmountOut(amount: string, slippage: number = 0.5): string {
  const parsedAmount = parseFloat(amount);
  const minAmount = parsedAmount * (1 - slippage / 100);
  return minAmount.toString();
}

// Get chain for network
function getChainForNetwork(network: NetworkType) {
  switch (network) {
    case 'eth-sepolia':
      return sepolia;
    case 'arb-sepolia':
      return arbitrumSepolia;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}

// Check if approval is needed
export async function checkApproval(
  userAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  amount: bigint,
  network: NetworkType
): Promise<boolean> {
  const publicClient = createPublicClient({
    chain: getChainForNetwork(network),
    transport: http(),
  });

  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: [{
      name: 'allowance',
      type: 'function',
      inputs: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' }
      ],
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
    }],
    functionName: 'allowance',
    args: [userAddress, SWAP_ROUTER_ADDRESS],
  });

  return (allowance as bigint) >= amount;
}

// Approve token spending
export async function approveToken(
  userAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  amount: bigint,
  network: NetworkType
): Promise<Hash> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet detected');
  }

  const walletClient = createWalletClient({
    account: userAddress,
    chain: getChainForNetwork(network),
    transport: custom((window as any).ethereum),
  });

  const approveData = encodeFunctionData({
    abi: [{
      name: 'approve',
      type: 'function',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ type: 'bool' }]
    }],
    functionName: 'approve',
    args: [SWAP_ROUTER_ADDRESS, amount * 2n], // Approve double the amount to avoid future approvals
  });

  const hash = await walletClient.sendTransaction({
    to: tokenAddress,
    data: approveData,
  });

  // Wait for confirmation
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// Encode swap data for the DEX router
export function encodeSwapData(intent: SwapIntent): `0x${string}` {
  const fromToken = DEX_CONFIG[intent.network].TOKENS[intent.fromToken];
  const toToken = DEX_CONFIG[intent.network].TOKENS[intent.toToken];
  
  const exactInputSingleParams = {
    tokenIn: fromToken.address,
    tokenOut: toToken.address,
    fee: DEX_CONFIG[intent.network].POOL_FEES.MEDIUM, // Default to medium fee tier
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

  // Check and handle approval first
  const fromToken = DEX_CONFIG[intent.network].TOKENS[intent.fromToken];
  const amountIn = parseUnits(intent.amount, fromToken.decimals);
  
  const hasApproval = await checkApproval(
    intent.userAddress,
    fromToken.address as `0x${string}`,
    amountIn,
    intent.network
  );

  if (!hasApproval) {
    await approveToken(
      intent.userAddress,
      fromToken.address as `0x${string}`,
      amountIn,
      intent.network
    );
  }

  // Create wallet client for signing only (no gas needed!)
  const walletClient = createWalletClient({
    account: intent.userAddress,
    chain: getChainForNetwork(intent.network),
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