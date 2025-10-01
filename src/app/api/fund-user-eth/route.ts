import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http, parseEther, formatEther, formatGwei, parseGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, sepolia, arbitrumSepolia } from 'viem/chains';

// Track funded users to prevent abuse
const fundedUsers = new Map<string, { lastFunded: number, count: number }>();

export async function POST(request: NextRequest) {
  console.log('[FUNDING API] ==========================================');
  console.log('[FUNDING API] Request received at:', new Date().toISOString());

  let body;
  try {
    body = await request.json();
  } catch (parseError) {
    console.error('[FUNDING API] Failed to parse request body:', parseError);
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { userAddress, reason, chain = 'base-sepolia' } = body;

  console.log('[FUNDING API] Parsed request:', { userAddress, reason, chain });

  try {
    // Validate inputs
    if (!userAddress) {
      console.error('[FUNDING API] Missing user address');
      return NextResponse.json(
        { success: false, error: 'User address is required' },
        { status: 400 }
      );
    }

    // Enhanced rate limiting
    const userHistory = fundedUsers.get(userAddress) || { lastFunded: 0, count: 0 };
    const timeSinceLastFunding = Date.now() - userHistory.lastFunded;

    // Stricter limits based on funding count
    let waitTime = 3600000; // 1 hour default
    if (userHistory.count >= 3) {
      waitTime = 86400000; // 24 hours after 3 fundings
    } else if (userHistory.count >= 2) {
      waitTime = 7200000; // 2 hours after 2 fundings
    }

    if (timeSinceLastFunding < waitTime) {
      const remainingMinutes = Math.ceil((waitTime - timeSinceLastFunding) / 60000);
      console.log(`[FUNDING API] User ${userAddress} rate limited. Count: ${userHistory.count}, Wait: ${remainingMinutes} minutes`);
      return NextResponse.json(
        {
          success: false,
          error: `Rate limited. Please wait ${remainingMinutes} minutes before requesting funding again.`,
          remainingMinutes
        },
        { status: 429 }
      );
    }

    // Verify reason
    if (reason !== 'approval_needed') {
      return NextResponse.json(
        { success: false, error: 'Invalid funding reason' },
        { status: 400 }
      );
    }

    // Select chain config with better RPC endpoints
    const chainConfigs = {
      'base-sepolia': {
        chain: baseSepolia,
        rpc: 'https://sepolia.base.org',
        key: process.env.BASE_RELAYER_KEY || process.env.BASE_SEPOLIA_RELAYER_KEY,
      },
      'eth-sepolia': {
        chain: sepolia,
        // Use a reliable public RPC
        rpc: process.env.ETH_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
        key: process.env.ETH_SEPOLIA_RELAYER_KEY,
      },
      'arb-sepolia': {
        chain: arbitrumSepolia,
        rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
        key: process.env.ARB_SEPOLIA_RELAYER_KEY,
      },
    };

    const chainConfig = chainConfigs[chain] || chainConfigs['base-sepolia'];

    if (!chainConfig) {
      console.error(`[FUNDING API] Invalid chain: ${chain}`);
      return NextResponse.json(
        { success: false, error: `Invalid chain: ${chain}` },
        { status: 400 }
      );
    }

    console.log(`[FUNDING API] Using chain config:`, {
      chain: chain,
      rpc: chainConfig.rpc,
      hasKey: !!chainConfig.key
    });

    // Initialize relayer
    const privateKey = chainConfig.key;
    if (!privateKey) {
      console.error(`[FUNDING API] Missing relayer key for ${chain}`);
      console.error(`[FUNDING API] Looking for env var:`,
        chain === 'eth-sepolia' ? 'ETH_SEPOLIA_RELAYER_KEY' :
        chain === 'arb-sepolia' ? 'ARB_SEPOLIA_RELAYER_KEY' :
        'BASE_SEPOLIA_RELAYER_KEY or BASE_RELAYER_KEY'
      );
      return NextResponse.json(
        {
          success: false,
          error: `Relayer not configured for ${chain}. Please check your .env.local file.`,
        },
        { status: 500 }
      );
    }

    console.log(`[FUNDING API] Creating wallet client for chain ${chain}`);

    let account;
    try {
      account = privateKeyToAccount(privateKey as `0x${string}`);
    } catch (keyError) {
      console.error(`[FUNDING API] Invalid private key format:`, keyError);
      return NextResponse.json(
        { success: false, error: 'Invalid relayer configuration' },
        { status: 500 }
      );
    }

    const walletClient = createWalletClient({
      account,
      chain: chainConfig.chain,
      transport: http(chainConfig.rpc, {
        timeout: 10000, // 10 second timeout
      }),
    });

    const publicClient = createPublicClient({
      chain: chainConfig.chain,
      transport: http(chainConfig.rpc, {
        timeout: 10000, // 10 second timeout
      }),
    });

    // Check relayer balance with timeout
    console.log(`[FUNDING API] Checking relayer balance...`);
    let relayerBalance;
    try {
      const balancePromise = publicClient.getBalance({
        address: account.address
      });

      // Add timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout checking balance')), 5000)
      );

      relayerBalance = await Promise.race([balancePromise, timeoutPromise]);
    } catch (balanceError) {
      console.error(`[FUNDING API] Failed to check relayer balance:`, balanceError);
      return NextResponse.json({
        success: false,
        error: 'Failed to connect to blockchain. Please try again.',
      }, { status: 503 });
    }

    console.log(`[FUNDING API] Relayer address: ${account.address}`);
    console.log(`[FUNDING API] Relayer balance: ${formatEther(relayerBalance)} ETH on ${chain}`);

    if (relayerBalance < parseEther('0.001')) {
      console.error('Relayer has insufficient ETH to fund users');
      return NextResponse.json({
        success: false,
        error: 'Relayer needs funding. Please add ETH to: ' + account.address,
        relayerAddress: account.address,
        relayerBalance: formatEther(relayerBalance)
      }, { status: 503 });
    }

    // Get current gas price with timeout
    console.log(`[FUNDING API] Getting gas price...`);
    let gasPrice;
    try {
      const gasPricePromise = publicClient.getGasPrice();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout getting gas price')), 5000)
      );

      gasPrice = await Promise.race([gasPricePromise, timeoutPromise]);
    } catch (gasError) {
      console.error(`[FUNDING API] Failed to get gas price:`, gasError);
      // Use a default gas price if we can't fetch it
      gasPrice = parseGwei('10'); // Default 10 gwei
      console.log(`[FUNDING API] Using default gas price: 10 gwei`);
    }

    // Calculate "fast" gas price (1.5x normal for faster inclusion)
    const fastGasPrice = (gasPrice * 150n) / 100n; // 1.5x for fast

    // Estimate gas for approval transaction
    // Different chains have different gas usage patterns
    let approvalGasLimit: bigint;
    if (chain === 'eth-sepolia') {
      approvalGasLimit = 70000n; // ETH mainnet/sepolia typically uses more gas
    } else if (chain === 'arb-sepolia') {
      approvalGasLimit = 100000n; // Arbitrum can be higher for some operations
    } else {
      approvalGasLimit = 80000n; // Base default
    }

    // Calculate required ETH with fast gas price
    const requiredETH = fastGasPrice * approvalGasLimit;

    // Add 30% buffer for gas price fluctuations (increased from 20%)
    const bufferMultiplier = 130n; // 130%
    const fundingAmount = (requiredETH * bufferMultiplier) / 100n;

    // Set minimum and maximum funding limits
    const minFunding = parseEther('0.0002'); // Increased minimum to 0.0002 ETH
    const maxFunding = parseEther('0.01');   // Increased maximum to 0.01 ETH

    // Apply limits
    const finalFundingAmount = fundingAmount < minFunding
      ? minFunding
      : fundingAmount > maxFunding
        ? maxFunding
        : fundingAmount;

    // Check user's current ETH balance with timeout
    console.log(`[FUNDING API] Checking user balance...`);
    let currentBalance;
    try {
      const balancePromise = publicClient.getBalance({
        address: userAddress as `0x${string}`
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout checking user balance')), 5000)
      );

      currentBalance = await Promise.race([balancePromise, timeoutPromise]);
    } catch (userBalanceError) {
      console.error(`[FUNDING API] Failed to check user balance:`, userBalanceError);
      // Assume user has no balance if we can't check
      currentBalance = 0n;
      console.log(`[FUNDING API] Assuming user has 0 balance`);
    }

    // Check if user already has enough ETH
    if (currentBalance >= finalFundingAmount) {
      console.log(`[FUNDING] User already has sufficient ETH: ${formatEther(currentBalance)} ETH`);
      return NextResponse.json({
        success: true,
        message: 'User already has sufficient ETH',
        balance: formatEther(currentBalance),
        required: formatEther(finalFundingAmount),
      });
    }

    // Calculate how much to fund (only the difference)
    // But ensure we always send at least the minimum to cover fast gas
    const difference = finalFundingAmount - currentBalance;
    const fundingNeeded = difference > minFunding ? difference : minFunding;

    console.log(`[FUNDING API] Calculation details:`);
    console.log(`[FUNDING API] - Chain: ${chain}`);
    console.log(`[FUNDING API] - Normal gas price: ${formatGwei(gasPrice)} gwei`);
    console.log(`[FUNDING API] - Fast gas price: ${formatGwei(fastGasPrice)} gwei (1.5x)`);
    console.log(`[FUNDING API] - Gas limit: ${approvalGasLimit} units`);
    console.log(`[FUNDING API] - Required (with buffer): ${formatEther(finalFundingAmount)} ETH`);
    console.log(`[FUNDING API] - User has: ${formatEther(currentBalance)} ETH`);
    console.log(`[FUNDING API] - Will fund: ${formatEther(fundingNeeded)} ETH`);

    console.log(`[FUNDING API] 💰 Initiating funding to ${userAddress} on ${chain}`);

    const hash = await walletClient.sendTransaction({
      to: userAddress as `0x${string}`,
      value: fundingNeeded,
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });

    // Track funding with enhanced info
    const currentHistory = fundedUsers.get(userAddress) || { lastFunded: 0, count: 0 };
    fundedUsers.set(userAddress, {
      lastFunded: Date.now(),
      count: currentHistory.count + 1
    });

    // Clean up old entries (older than 24 hours)
    const dayAgo = Date.now() - 86400000;
    for (const [addr, history] of fundedUsers.entries()) {
      if (history.lastFunded < dayAgo) {
        fundedUsers.delete(addr);
      }
    }

    console.log(`[FUNDING API] ✅ SUCCESS! Funded ${userAddress} on ${chain}`);
    console.log(`[FUNDING API] Transaction hash: ${hash}`);
    console.log(`[FUNDING API] Amount sent: ${formatEther(fundingNeeded)} ETH`);
    console.log(`[FUNDING API] User funding count: ${(fundedUsers.get(userAddress)?.count || 0)}`);

    return NextResponse.json({
      success: true,
      hash,
      amount: formatEther(fundingNeeded),
      gasPrice: formatGwei(fastGasPrice) + ' gwei (fast)',
      message: 'User funded with ETH for approval. True gasless experience!',
      chain,
      details: {
        fundingAmount: formatEther(fundingNeeded),
        gasPrice: formatGwei(fastGasPrice) + ' gwei (fast)',
        normalGasPrice: formatGwei(gasPrice) + ' gwei',
        estimatedGas: approvalGasLimit.toString(),
        currentBalance: formatEther(currentBalance),
        finalBalance: formatEther(currentBalance + fundingNeeded),
      }
    });

  } catch (error: any) {
    console.error('[FUNDING API] Error details:', {
      error: error.message,
      stack: error.stack,
      cause: error.cause,
    });

    // Return more specific error messages
    let errorMessage = 'Failed to fund user';

    if (error.message?.includes('insufficient funds')) {
      errorMessage = 'Relayer has insufficient ETH. Please fund the relayer wallet.';
    } else if (error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Cannot connect to blockchain. Please check network configuration.';
    } else if (error.message) {
      errorMessage = `Funding failed: ${error.message}`;
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: error.message
      },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  console.log('[FUNDING API] Health check requested');

  // Check which relayer keys are configured
  const configured = {
    'eth-sepolia': !!process.env.ETH_SEPOLIA_RELAYER_KEY,
    'arb-sepolia': !!process.env.ARB_SEPOLIA_RELAYER_KEY,
    'base-sepolia': !!(process.env.BASE_SEPOLIA_RELAYER_KEY || process.env.BASE_RELAYER_KEY),
  };

  return NextResponse.json({
    status: 'ok',
    message: 'ETH funding service ready',
    fundedCount: fundedUsers.size,
    configuredChains: configured,
    timestamp: new Date().toISOString(),
  });
}
