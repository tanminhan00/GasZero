// Cross-Chain Gas Station Architecture
// This extends your current implementation to support multi-chain

import { createPublicClient, createWalletClient, http, type Hash } from 'viem';
import { arbitrum, polygon, optimism, base } from 'viem/chains';

// Supported chains configuration
export const CHAIN_CONFIG = {
  arbitrum: {
    chain: arbitrum,
    usdc: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    relayer: process.env.NEXT_PUBLIC_ARB_RELAYER || '',
    rpc: process.env.NEXT_PUBLIC_ARB_RPC || 'https://arb1.arbitrum.io/rpc'
  },
  polygon: {
    chain: polygon,
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    relayer: process.env.NEXT_PUBLIC_POLY_RELAYER || '',
    rpc: process.env.NEXT_PUBLIC_POLY_RPC || 'https://polygon-rpc.com'
  },
  optimism: {
    chain: optimism,
    usdc: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    relayer: process.env.NEXT_PUBLIC_OP_RELAYER || '',
    rpc: process.env.NEXT_PUBLIC_OP_RPC || 'https://mainnet.optimism.io'
  },
  base: {
    chain: base,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    relayer: process.env.NEXT_PUBLIC_BASE_RELAYER || '',
    rpc: process.env.NEXT_PUBLIC_BASE_RPC || 'https://mainnet.base.org'
  }
} as const;

export type SupportedChain = keyof typeof CHAIN_CONFIG;

// Intent structure for cross-chain operations
export interface CrossChainIntent {
  fromChain: SupportedChain;
  toChain: SupportedChain;
  fromToken: string; // USDC, USDT, etc
  toToken: string;
  amount: bigint;
  recipient: `0x${string}`;
  maxFeeUSDC: bigint; // Maximum fee user willing to pay
  deadline: number;
}

// Gas Station Service
export class GasStation {
  private relayers: Map<SupportedChain, RelayerService> = new Map();

  constructor() {
    // Initialize relayers for each chain
    Object.entries(CHAIN_CONFIG).forEach(([chain, config]) => {
      this.relayers.set(
        chain as SupportedChain,
        new RelayerService(chain as SupportedChain, config)
      );
    });
  }

  // Execute gasless transaction on any chain
  async executeGasless(
    intent: CrossChainIntent,
    userSignature: `0x${string}`
  ): Promise<Hash> {
    // Validate user has balance on source chain
    const sourceBalance = await this.checkBalance(
      intent.fromChain,
      intent.fromToken,
      userSignature
    );

    if (sourceBalance < intent.amount) {
      throw new Error(`Insufficient ${intent.fromToken} on ${intent.fromChain}`);
    }

    // Calculate fees
    const fee = this.calculateFee(intent);
    if (fee > intent.maxFeeUSDC) {
      throw new Error(`Fee ${fee} exceeds max ${intent.maxFeeUSDC}`);
    }

    // Route the transaction
    if (intent.fromChain === intent.toChain) {
      // Same chain transfer - simple case
      return this.executeSameChain(intent, userSignature);
    } else {
      // Cross-chain - use bridge
      return this.executeCrossChain(intent, userSignature);
    }
  }

  private async executeSameChain(
    intent: CrossChainIntent,
    signature: `0x${string}`
  ): Promise<Hash> {
    const relayer = this.relayers.get(intent.fromChain);
    if (!relayer) throw new Error('Chain not supported');

    // Relayer executes on behalf of user
    return relayer.execute({
      from: signature,
      to: intent.recipient,
      token: intent.fromToken,
      amount: intent.amount,
      fee: this.calculateFee(intent)
    });
  }

  private async executeCrossChain(
    intent: CrossChainIntent,
    signature: `0x${string}`
  ): Promise<Hash> {
    // Use LayerZero or Axelar for cross-chain
    // This is where you integrate bridge protocols

    // For MVP: Use existing bridges APIs
    const bridgeQuote = await this.getBridgeQuote(intent);

    // Execute via relayer on source chain
    const sourceRelayer = this.relayers.get(intent.fromChain);
    if (!sourceRelayer) throw new Error('Source chain not supported');

    return sourceRelayer.executeBridge({
      bridgeContract: bridgeQuote.contract,
      bridgeData: bridgeQuote.data,
      userSignature: signature
    });
  }

  private calculateFee(intent: CrossChainIntent): bigint {
    const baseFee = 1_000_000n; // 1 USDC base fee
    const bridgeFee = intent.fromChain !== intent.toChain ? 2_000_000n : 0n;
    const percentageFee = (intent.amount * 50n) / 10_000n; // 0.5%

    return baseFee + bridgeFee + percentageFee;
  }

  private async checkBalance(
    chain: SupportedChain,
    token: string,
    user: `0x${string}`
  ): Promise<bigint> {
    // Check user's balance on specified chain
    const config = CHAIN_CONFIG[chain];
    const client = createPublicClient({
      chain: config.chain,
      transport: http(config.rpc)
    });

    // For MVP, assume USDC
    const balance = await client.readContract({
      address: config.usdc as `0x${string}`,
      abi: [{
        name: 'balanceOf',
        type: 'function',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
      }],
      functionName: 'balanceOf',
      args: [user]
    });

    return balance as bigint;
  }

  private async getBridgeQuote(intent: CrossChainIntent) {
    // Integration with bridge aggregators
    // Options: LI.FI, Socket, or direct bridges

    // For MVP: Use LI.FI API
    const quote = await fetch('https://li.quest/v1/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromChain: intent.fromChain,
        toChain: intent.toChain,
        fromToken: CHAIN_CONFIG[intent.fromChain].usdc,
        toToken: CHAIN_CONFIG[intent.toChain].usdc,
        fromAmount: intent.amount.toString(),
        toAddress: intent.recipient
      })
    }).then(r => r.json());

    return {
      contract: quote.transactionRequest.to,
      data: quote.transactionRequest.data,
      estimatedGas: quote.estimate.gasCosts
    };
  }
}

// Relayer service for each chain
class RelayerService {
  constructor(
    private chain: SupportedChain,
    private config: typeof CHAIN_CONFIG[SupportedChain]
  ) {}

  async execute(params: any): Promise<Hash> {
    // Your backend relayer executes transaction
    // User pays fee in USDC

    const response = await fetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: this.chain,
        ...params
      })
    }).then(r => r.json());

    return response.txHash;
  }

  async executeBridge(params: any): Promise<Hash> {
    // Execute bridge transaction via relayer
    const response = await fetch('/api/relay-bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: this.chain,
        ...params
      })
    }).then(r => r.json());

    return response.txHash;
  }
}

// Frontend usage example
export async function sendCrossChain(
  from: SupportedChain,
  to: SupportedChain,
  amount: string,
  recipient: string
) {
  const gasStation = new GasStation();

  const intent: CrossChainIntent = {
    fromChain: from,
    toChain: to,
    fromToken: 'USDC',
    toToken: 'USDC',
    amount: BigInt(amount),
    recipient: recipient as `0x${string}`,
    maxFeeUSDC: 5_000_000n, // Max 5 USDC fee
    deadline: Math.floor(Date.now() / 1000) + 3600
  };

  // User just signs - no gas needed!
  const signature = await signIntent(intent);

  // Execute via gas station
  const txHash = await gasStation.executeGasless(intent, signature);

  return txHash;
}
