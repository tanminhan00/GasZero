import { createPublicClient, createWalletClient, custom, http, parseUnits, encodeFunctionData, type Hash } from 'viem';
import { sepolia, arbitrumSepolia } from 'viem/chains';
import { DEX_CONFIG, type NetworkType } from '@/config/chain.config';

// Import ABIs like relayer does
import ERC20_ABI from './abis/ERC20_abi.json';
import SWAP_ROUTER_ABI from './abis/swaprouter.json';

// SwapRouter02 address (same on all networks)
export const SWAP_ROUTER_ADDRESS = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';

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

// Check token approval
export async function checkTokenAllowance(
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
    chain: getChainForNetwork(network),
    transport: http(),
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// Execute direct swap (relayer-style but user-signed)
export async function executeDirectSwap(
  network: NetworkType,
  fromToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'],
  toToken: keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'],
  amount: string,
  userAddress: `0x${string}`,
  slippage: number = 0.5 // 0.5% default slippage
): Promise<Hash> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet detected');
  }

  const tokens = DEX_CONFIG[network].TOKENS;
  const fromTokenData = tokens[fromToken];
  const toTokenData = tokens[toToken];
  const amountIn = parseUnits(amount, fromTokenData.decimals);

  // Create wallet client (like relayer does)
  const walletClient = createWalletClient({
    account: userAddress,
    chain: getChainForNetwork(network),
    transport: custom((window as any).ethereum),
  });

  const publicClient = createPublicClient({
    chain: getChainForNetwork(network),
    transport: http(),
  });

  // Step 1: Approve router to spend tokens (like relayer does)
  console.log('📝 Approving router to spend tokens...');
  const approveHash = await walletClient.sendTransaction({
    to: fromTokenData.address as `0x${string}`,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [SWAP_ROUTER_ADDRESS, amountIn],
    }),
  });

  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log('✅ Approval confirmed!');

  // Step 2: Execute swap (like relayer does)
  console.log('🔄 Executing swap...');
  
  // Calculate minimum amount out with slippage
  const minAmountOut = (amountIn * BigInt(Math.floor(1000 - slippage * 10))) / 1000n;

  // Execute the swap using same pattern as relayer
  const swapHash = await walletClient.sendTransaction({
    to: SWAP_ROUTER_ADDRESS as `0x${string}`,
    data: encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: fromTokenData.address,
        tokenOut: toTokenData.address,
        fee: 3000, // 0.3% fee tier like relayer
        recipient: userAddress,
        amountIn,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0n
      }]
    }),
    value: fromToken === 'ETH' ? amountIn : 0n, // Include ETH value if swapping ETH
  });

  await publicClient.waitForTransactionReceipt({ hash: swapHash });
  console.log('✅ Swap completed successfully!');

  return swapHash;
}
