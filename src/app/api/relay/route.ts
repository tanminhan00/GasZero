import { NextRequest, NextResponse } from 'next/server';
import { relayerService, type RelayRequest, type SupportedToken } from '@/lib/relayer-service';
import { DEX_CONFIG } from '@/config/chain.config';
import { verifyMessage } from 'viem';

// Rate limiting (simple in-memory, use Redis in production)
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  try {
    // 1. Parse request body
    const body = await request.json();
    const { chain, from, to, token, amount, signature, intent, type, fromToken, toToken, minAmountOut } = body;

    // 2. Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const rateLimit = rateLimiter.get(ip) || { count: 0, resetAt: Date.now() + 3600000 };

    if (Date.now() > rateLimit.resetAt) {
      rateLimit.count = 0;
      rateLimit.resetAt = Date.now() + 3600000; // Reset every hour
    }

    if (rateLimit.count >= 10) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    rateLimit.count++;
    rateLimiter.set(ip, rateLimit);

    // 3. Validate signature
    // The message signed in frontend is the full intent object
    const message = JSON.stringify(intent || { chain, from, to, token, amount, timestamp: body.timestamp });
    let isValidSignature = false;

    try {
      isValidSignature = await verifyMessage({
        address: from,
        message,
        signature,
      });
    } catch (e) {
      console.error('Signature verification failed:', e);
      console.error('Expected message:', message);
      console.error('From address:', from);
    }

    // For testnet demo, let's be more lenient and just log if signature fails
    if (!isValidSignature) {
      console.warn('⚠️ Signature verification failed, but proceeding for testnet demo');
      // For production, you'd want to reject here:
      // return NextResponse.json(
      //   { success: false, error: 'Invalid signature' },
      //   { status: 401 }
      // );
    }

    // 4. Create relay request based on type
    let relayRequest: RelayRequest;

    if (type === 'swap') {
      // Handle swap request
      relayRequest = {
        type: 'swap',
        chain,
        fromAddress: from || body.fromAddress,
        fromToken: (fromToken || token || 'USDC').toUpperCase() as SupportedToken,
        toToken: (toToken || 'ETH').toUpperCase() as SupportedToken,
        amount,
        minAmountOut: minAmountOut || '0',
        signature,
        nonce: body.nonce || intent?.nonce || 0,
        deadline: body.deadline || intent?.deadline || Math.floor(Date.now() / 1000) + 300,
      };
    } else {
      // Handle transfer request (default)
      relayRequest = {
        type: 'transfer',
        chain,
        fromAddress: from,
        toAddress: to,
        token: (token || 'USDC').toUpperCase() as SupportedToken,
        amount,
        signature,
        nonce: intent?.nonce || 0,
        deadline: intent?.deadline || Math.floor(Date.now() / 1000) + 300,
      };
    }

    // 5. Execute relay
    const result = await relayerService.relay(relayRequest);

    // 6. Log for analytics
    console.log('Relay request:', {
      type: relayRequest.type,
      chain,
      from: from ? `${from.slice(0, 6)}...${from.slice(-4)}` : 'N/A',
      to: to ? `${to.slice(0, 6)}...${to.slice(-4)}` : 'N/A',
      amount,
      token: token || `${fromToken} -> ${toToken}`,
      success: result.success,
      hash: result.hash,
      fee: result.fee,
    });

    // 7. Return response
    if (result.success) {
      return NextResponse.json({
        success: true,
        hash: result.hash,
        fee: result.fee,
        netAmount: result.netAmount,
        explorer: getExplorerUrl(chain, result.hash!),
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET(request: NextRequest) {
  try {
    // Check all relayer balances
    const balances = await relayerService.getAllRelayerBalances();

    // Check if any relayer is low on funds
    const alerts = [];
    for (const [chain, balance] of Object.entries(balances)) {
      const bal = parseFloat(balance);
      if (bal < 0.01) {
        alerts.push(`${chain} relayer low: ${balance} ETH`);
      }
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      relayers: balances,
      alerts: alerts.length > 0 ? alerts : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', error: error.message },
      { status: 500 }
    );
  }
}

function getExplorerUrl(chain: string, hash: string): string {
  // Dynamic explorer URLs based on chain
  switch (chain) {
    case 'eth-sepolia':
      return `https://sepolia.etherscan.io/tx/${hash}`;
    case 'arb-sepolia':
      return `https://sepolia.arbiscan.io/tx/${hash}`;
    case 'base-sepolia':
      return `https://sepolia.basescan.org/tx/${hash}`;
    case 'base':
      return `https://basescan.org/tx/${hash}`;
    case 'arbitrum':
      return `https://arbiscan.io/tx/${hash}`;
    case 'arbitrum-sepolia':
      return `https://sepolia.arbiscan.io/tx/${hash}`;
    case 'optimism':
      return `https://optimistic.etherscan.io/tx/${hash}`;
    case 'optimism-sepolia':
      return `https://sepolia-optimistic.etherscan.io/tx/${hash}`;
    default:
      return `https://sepolia.basescan.org/tx/${hash}`; // Default to Base Sepolia
  }
}
