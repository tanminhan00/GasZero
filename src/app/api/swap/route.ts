import { NextRequest } from 'next/server';
import { relayerService } from '@/lib/relayer-service';
import { verifySignature } from '@/lib/gasless-v2';
import { type SwapIntent } from '@/lib/gasless-swap';
import { EXPAND_CONFIG } from '@/config/expand.config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { intent, signature, expandData } = body;

    // Verify signature
    const isValid = await verifySignature(
      JSON.stringify(intent),
      signature,
      intent.userAddress
    );

    if (!isValid) {
      return Response.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Execute swap using Expand's transaction data
    const result = await relayerService.relay({
      type: 'swap',
      chain: 'eth-sepolia',
      fromAddress: intent.userAddress,
      fromToken: intent.fromToken,
      toToken: intent.toToken,
      amount: intent.amount,
      minAmountOut: intent.minAmountOut,
      signature,
      nonce: Math.floor(Math.random() * 1000000), // For testnet demo
      deadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      expandData, // Pass through Expand's transaction data
    });

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Return success response with transaction details
    return Response.json({
      success: true,
      hash: result.hash,
      fee: result.fee,
      netAmount: result.netAmount,
      explorer: `${EXPAND_CONFIG.SUPPORTED_CHAINS['eth-sepolia'].rpcUrl}/tx/${result.hash}`,
    });

  } catch (error: any) {
    console.error('Swap API error:', error);
    return Response.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
