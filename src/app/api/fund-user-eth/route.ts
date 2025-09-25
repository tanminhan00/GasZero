import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// Track funded users to prevent abuse
const fundedUsers = new Map<string, number>();

export async function POST(request: NextRequest) {
  try {
    const { userAddress, reason } = await request.json();

    // Rate limiting - one funding per user per hour
    const lastFunded = fundedUsers.get(userAddress) || 0;
    if (Date.now() - lastFunded < 3600000) {
      return NextResponse.json(
        { error: 'Already funded recently' },
        { status: 429 }
      );
    }

    // Verify reason
    if (reason !== 'approval_needed') {
      return NextResponse.json(
        { error: 'Invalid funding reason' },
        { status: 400 }
      );
    }

    // Initialize relayer
    const privateKey = process.env.BASE_RELAYER_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { error: 'Relayer not configured' },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(process.env.BASE_RPC || 'https://sepolia.base.org'),
    });

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.BASE_RPC || 'https://sepolia.base.org'),
    });

    // Check user's current ETH balance
    const currentBalance = await publicClient.getBalance({
      address: userAddress as `0x${string}`
    });

    if (currentBalance >= parseEther('0.001')) {
      return NextResponse.json({
        success: true,
        message: 'User already has sufficient ETH',
        balance: formatEther(currentBalance),
      });
    }

    // Fund user with minimal ETH for approval
    const fundingAmount = parseEther('0.001'); // ~$0.002 worth

    console.log(`💰 Funding ${userAddress} with 0.001 ETH for approval gas`);

    const hash = await walletClient.sendTransaction({
      to: userAddress as `0x${string}`,
      value: fundingAmount,
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });

    // Track funding
    fundedUsers.set(userAddress, Date.now());

    console.log(`✅ Funded user ${userAddress} with ETH. Tx: ${hash}`);

    return NextResponse.json({
      success: true,
      hash,
      amount: '0.001',
      message: 'User funded with ETH for approval. True gasless experience!',
    });

  } catch (error: any) {
    console.error('Funding error:', error);
    return NextResponse.json(
      { error: 'Failed to fund user' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'ETH funding service ready',
    fundedCount: fundedUsers.size,
  });
}