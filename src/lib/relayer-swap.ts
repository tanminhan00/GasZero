import { createPublicClient, createWalletClient, http, type Hash, parseUnits, encodeFunctionData, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { DEX_CONFIG } from '@/config/chain.config';

// Contract addresses
const QUOTER_CONTRACT_ADDRESS = '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3';
const SWAP_ROUTER_ADDRESS = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
const POOL_FACTORY_ADDRESS = '0x0227628f3F023bb0B980b67D528571c95c6DaC1c';

// ABIs
import QUOTER_ABI from './abis/quoter.json';

import POOL_FACTORY_ABI from './abis/factory.json';
import POOL_ABI from './abis/pool.json';
import ERC20_ABI from './abis/ERC20_abi.json';
import WETH_ABI from './abis/weth.json';
import SWAP_ROUTER_ABI from './abis/swaprouter.json';

// RPC URL from environment variable
const RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
if (!RPC_URL) {
  throw new Error('Missing NEXT_PUBLIC_SEPOLIA_RPC_URL environment variable');
}

// Create clients
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

// Helper to get pool info
async function getPoolInfo(tokenIn: string, tokenOut: string, fee: number) {
  console.log(`🔍 Looking up pool: ${tokenIn} -> ${tokenOut} (fee: ${fee})`);
  
  const poolAddress = await publicClient.readContract({
    address: POOL_FACTORY_ADDRESS as `0x${string}`,
    abi: POOL_FACTORY_ABI,
    functionName: 'getPool',
    args: [tokenIn, tokenOut, fee],
  }) as `0x${string}`;

  if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('Pool not found');
  }

  console.log(`🏊 Pool found: ${poolAddress}`);

  const [token0, token1, poolFee] = await Promise.all([
    publicClient.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'token0',
    }),
    publicClient.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'token1',
    }),
    publicClient.readContract({
      address: poolAddress,
      abi: POOL_ABI,
      functionName: 'fee',
    }),
  ]);

  console.log(`📊 Pool details: token0=${token0}, token1=${token1}, fee=${poolFee}`);
  return { poolAddress, token0, token1, fee: poolFee };
}

// Quote the swap
async function getQuote(
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: bigint,
  recipient: string
) {
  console.log(`📈 Getting quote for ${formatUnits(amountIn, 6)} USDC -> ETH`);
  
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

  const params = {
    tokenIn,
    tokenOut,
    amountIn,
    fee,
    sqrtPriceLimitX96: 0n
  };

  const [amountOut] = await publicClient.readContract({
    address: QUOTER_CONTRACT_ADDRESS as `0x${string}`,
    abi: QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [params],
  }) as [bigint, bigint, number, bigint];

  console.log(`💱 Quote result: ${formatUnits(amountOut, 18)} ETH`);
  return amountOut;
}

// Execute the relayer swap
export async function executeRelayerSwap(
  userAddress: `0x${string}`,
  usdcAmount: string,
  relayerPrivateKey: string,
  feePercentage: number = 0.5 // 0.5% fee by default
): Promise<{ hash: Hash; ethAmount: string }> {
  console.log('🚀 Starting relayer swap process...');
  console.log(`👤 User: ${userAddress}`);
  console.log(`💰 Amount: ${usdcAmount} USDC`);
  console.log(`💸 Fee: ${feePercentage}%`);

  // Create wallet account from private key
  const relayerAccount = privateKeyToAccount(relayerPrivateKey as `0x${string}`);
  console.log(`🔑 Relayer address: ${relayerAccount.address}`);

  // Create wallet client for the relayer
  const relayerClient = createWalletClient({
    account: relayerAccount,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  const relayerAddress = relayerAccount.address;
  
  // Parse USDC amount
  const amountIn = parseUnits(usdcAmount, 6); // USDC has 6 decimals
  console.log(`📊 Parsed amount: ${formatUnits(amountIn, 6)} USDC`);
  
  // Get pool info
  console.log('🔍 Fetching pool information...');
  const { fee } = await getPoolInfo(
    DEX_CONFIG['eth-sepolia'].TOKENS.USDC.address,
    DEX_CONFIG['eth-sepolia'].TOKENS.ETH.address,
    3000 // 0.3% fee tier
  );
  console.log(`🏊 Pool fee: ${fee} (${Number(fee) / 10000}%)`);

  // Get quote
  console.log('📈 Getting swap quote...');
  const ethAmountOut = await getQuote(
    DEX_CONFIG['eth-sepolia'].TOKENS.USDC.address,
    DEX_CONFIG['eth-sepolia'].TOKENS.ETH.address,
    fee as number,
    amountIn,
    relayerAddress
  );
  console.log(`💱 Expected ETH output: ${formatUnits(ethAmountOut, 18)} ETH`);

  // Calculate fee amount (in ETH)
  const feeAmount = (ethAmountOut * BigInt(Math.floor(feePercentage * 100))) / 10000n;
  const userAmount = ethAmountOut - feeAmount;
  console.log(`💸 Relayer fee: ${formatUnits(feeAmount, 18)} ETH`);
  console.log(`🎯 User will receive: ${formatUnits(userAmount, 18)} ETH`);

  // Step 1: Receive USDC from user
  console.log('📥 Step 1: Pulling USDC from user to relayer...');
  const receiveHash = await relayerClient.sendTransaction({
    account: relayerAccount,
    to: DEX_CONFIG['eth-sepolia'].TOKENS.USDC.address as `0x${string}`,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transferFrom',
      args: [userAddress, relayerAddress, amountIn],
    }),
  });
  console.log(`📝 TransferFrom tx: ${receiveHash}`);

  console.log('⏳ Waiting for transferFrom confirmation...');
  await publicClient.waitForTransactionReceipt({ hash: receiveHash });
  console.log('✅ USDC successfully pulled from user!');

  // Step 2: Approve USDC spending
  console.log('📝 Step 2: Approving USDC spending...');
  const approveHash = await relayerClient.sendTransaction({
    account: relayerAccount,
    to: DEX_CONFIG['eth-sepolia'].TOKENS.USDC.address as `0x${string}`,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [SWAP_ROUTER_ADDRESS, amountIn],
    }),
  });
  console.log(`📝 Approve tx: ${approveHash}`);

  console.log('⏳ Waiting for approval confirmation...');
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log('✅ USDC approval confirmed!');

  // Execute swap

  // Approve SwapRouter to spend relayer's USDC
  const routerApproveHash = await relayerClient.sendTransaction({
    account: relayerAccount,
    to: DEX_CONFIG['eth-sepolia'].TOKENS.USDC.address as `0x${string}`,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [SWAP_ROUTER_ADDRESS, amountIn],
    }),
  });

  await publicClient.waitForTransactionReceipt({ hash: routerApproveHash });

  // Execute the swap
  const swapHash = await relayerClient.sendTransaction({
    account: relayerAccount,
    to: SWAP_ROUTER_ADDRESS as `0x${string}`,
    data: encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: DEX_CONFIG['eth-sepolia'].TOKENS.USDC.address,
        tokenOut: DEX_CONFIG['eth-sepolia'].TOKENS.ETH.address,
        fee: 3000, // 0.3%
        recipient: relayerAddress,
        amountIn,
        amountOutMinimum: ethAmountOut * 95n / 100n, // 5% slippage
        sqrtPriceLimitX96: 0n
      }]
    }),
    value: 0n
  });
  console.log(`📝 Swap tx: ${swapHash}`);

  console.log('⏳ Waiting for swap confirmation...');
  await publicClient.waitForTransactionReceipt({ hash: swapHash });
  console.log('✅ Swap completed successfully!');

  // Step 4: Send ETH to user (minus fee)
  console.log('📤 Step 4: Sending ETH to user...');
  const sendHash = await relayerClient.sendTransaction({
    account: relayerAccount,
    to: userAddress,
    value: userAmount,
  });
  console.log(`📝 Send ETH tx: ${sendHash}`);

  console.log('⏳ Waiting for final transfer confirmation...');
  await publicClient.waitForTransactionReceipt({ hash: sendHash });
  console.log('✅ ETH successfully sent to user!');
  console.log(`🎉 Relayer swap completed! User received: ${formatUnits(userAmount, 18)} ETH`);

  return {
    hash: sendHash,
    ethAmount: formatUnits(userAmount, 18),
  };
}
