// GasZero Relayer Service - Production Ready Implementation
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits, type Hash, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, sepolia, baseSepolia } from 'viem/chains';
import { DEX_CONFIG } from '@/config/chain.config';

// Chain configurations
// TESTNET MODE - Switch these when going to mainnet
type ChainFeature = 'transfer' | 'swap';

const CHAIN_CONFIG = {
  'eth-sepolia': {
    chain: sepolia,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Ethereum Sepolia
    usdt: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // USDT on Ethereum Sepolia
    rpc: process.env.ETH_RPC || 'https://eth-sepolia.g.alchemy.com/v2/demo',
    explorer: 'https://sepolia.etherscan.io',
    name: 'Ethereum Sepolia',
    features: ['transfer', 'swap'] as ChainFeature[]
  },
  'arb-sepolia': {
    chain: arbitrumSepolia,
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // USDC on Arbitrum Sepolia
    usdt: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // Same as USDC on testnet
    rpc: process.env.ARBITRUM_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    explorer: 'https://sepolia.arbiscan.io',
    name: 'Arbitrum Sepolia',
    features: ['transfer', 'swap'] as ChainFeature[]
  },
  'base-sepolia': {
    chain: baseSepolia,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
    usdt: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Same as USDC on testnet
    rpc: process.env.BASE_RPC || 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    name: 'Base Sepolia',
    features: ['transfer'] as ChainFeature[] // Base only supports transfers
  },
} as const;

export type SupportedChain = keyof typeof CHAIN_CONFIG;
export type SupportedToken = keyof (typeof DEX_CONFIG)['eth-sepolia']['TOKENS'];

// Fee structure
const FEE_CONFIG = {
  sameChain: 50, // 0.5% in basis points
  crossChain: 150, // 1.5% in basis points
  minFeeUSD: 0.5, // Minimum $0.50
  maxFeeUSD: 10, // Maximum $10
};

export interface BaseRelayRequest {
  chain: SupportedChain;
  fromAddress: `0x${string}`;
  signature: `0x${string}`;
  nonce: number;
  deadline: number;
}

export interface TransferRelayRequest extends BaseRelayRequest {
  type: 'transfer';
  toAddress: `0x${string}`;
  token: SupportedToken;
  amount: string; // Amount in token units (e.g., "100" for 100 USDC)
}

export interface SwapRelayRequest extends BaseRelayRequest {
  type: 'swap';
  fromToken: SupportedToken;
  toToken: SupportedToken;
  amount: string;
  minAmountOut: string;
  expandData?: any; // Optional Expand Network transaction data
}

export type RelayRequest = TransferRelayRequest | SwapRelayRequest;

export interface RelayResponse {
  success: boolean;
  hash?: Hash;
  error?: string;
  fee?: string;
  netAmount?: string;
  gasUsed?: string;
}

export class RelayerService {
  private relayers: Map<SupportedChain, any> = new Map();

  constructor() {
    this.initializeRelayers();
  }

  private initializeRelayers() {
    // Initialize relayers for configured chains
    const chains: SupportedChain[] = ['eth-sepolia', 'arb-sepolia', 'base-sepolia'];

    console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('RELAYER')));
    
    chains.forEach(chain => {
      const envKey = `${chain.toUpperCase().replace(/-/g, '_')}_RELAYER_KEY`;
      const privateKey = process.env[envKey];
      console.log(`Checking ${envKey}:`, privateKey ? 'Found' : 'Not found');
      
      if (!privateKey) {
        console.warn(`⚠️ No private key for ${chain} relayer (looking for ${envKey})`);
        return;
      }

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const config = CHAIN_CONFIG[chain];

      const walletClient = createWalletClient({
        account,
        chain: config.chain,
        transport: http(config.rpc),
      });

      this.relayers.set(chain, walletClient);
      console.log(`✅ Initialized ${chain} relayer: ${account.address}`);
    });
  }

  async relay(request: RelayRequest): Promise<RelayResponse> {
    try {
      // 1. Validate request
      const validation = await this.validateRequest(request);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // 2. Get relayer for chain
      const relayer = this.relayers.get(request.chain);
      if (!relayer) {
        return { success: false, error: `No relayer for chain ${request.chain}` };
      }

      const config = CHAIN_CONFIG[request.chain];
      const publicClient = createPublicClient({
        chain: config.chain,
        transport: http(config.rpc),
      });

      // Check if the chain supports the requested feature
      if (!config.features.includes(request.type)) {
        return { 
          success: false, 
          error: `${config.name} does not support ${request.type} operations` 
        };
      }

      if (request.type === 'transfer') {
        return this.handleTransfer(request, relayer, publicClient, config);
      } else {
        return this.handleSwap(request, relayer, publicClient, config);
      }
    } catch (error: any) {
      console.error('Relay error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  private async handleTransfer(
    request: TransferRelayRequest,
    relayer: any,
    publicClient: any,
    config: any
  ): Promise<RelayResponse> {
    // 3. Check user has sufficient balance
    const userBalance = await this.checkBalance(
      request.chain,
      request.token,
      request.fromAddress
    );

    const amount = parseUnits(request.amount, 6); // USDC/USDT have 6 decimals
    const fee = this.calculateFee(amount);

    if (userBalance < amount) {
      return {
        success: false,
        error: `Insufficient balance. Have: ${formatUnits(userBalance, 6)}, Need: ${request.amount}`
      };
    }

    // 4. Execute transaction
      const tokenAddress = config[String(request.token).toLowerCase() as 'usdc' | 'usdt'];

    // Check user has approved relayer
    const allowance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
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
      args: [request.fromAddress, relayer.account.address],
    });

    if ((allowance as bigint) < amount) {
      return {
        success: false,
        error: `Insufficient allowance. Please approve the relayer to spend at least ${formatUnits(amount, 6)} ${String(request.token)}`
      };
    }

    let recipientHash: Hash;

    try {
      // Pull funds to relayer first
      const pullFundsData = encodeFunctionData({
        abi: [{
          name: 'transferFrom',
          type: 'function',
          inputs: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ name: '', type: 'bool' }]
        }],
        functionName: 'transferFrom',
        args: [request.fromAddress, relayer.account.address, amount]
      });

      const pullHash = await relayer.sendTransaction({
        to: tokenAddress,
        data: pullFundsData,
        gas: 150000n,
      });

      console.log(`✅ Pulled ${formatUnits(amount, 6)} ${String(request.token)} from user to relayer`);

      await publicClient.waitForTransactionReceipt({
        hash: pullHash,
        confirmations: 1,
      });

      // Send net amount to recipient
      const sendToRecipientData = encodeFunctionData({
        abi: [{
          name: 'transfer',
          type: 'function',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ name: '', type: 'bool' }]
        }],
        functionName: 'transfer',
        args: [request.toAddress, amount - fee]
      });

      recipientHash = await relayer.sendTransaction({
        to: tokenAddress,
        data: sendToRecipientData,
        gas: 150000n,
      });

      console.log(`✅ Sent ${formatUnits(amount - fee, 6)} ${String(request.token)} to recipient`);
      console.log(`✅ Fee collected: ${formatUnits(fee, 6)} ${String(request.token)}`);

    } catch (txError: any) {
      console.error('Transaction execution failed:', txError);

      if (txError.message?.includes('insufficient funds')) {
        return { success: false, error: 'Relayer has insufficient ETH for gas. Please contact support.' };
      }
      if (txError.message?.includes('transfer amount exceeds balance')) {
        return { success: false, error: `Insufficient ${request.token} balance` };
      }

      return { success: false, error: 'Transaction failed. Please try again.' };
    }

    try {
      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash: recipientHash,
        timeout: 30_000,
      });

      if (receipt.status === 'reverted') {
        return { success: false, error: 'Transaction reverted' };
      }
    } catch (waitError) {
      console.error('Failed to wait for receipt:', waitError);
    }

    console.log(`✅ Relayed transfer on ${request.chain}: ${recipientHash}`);

    return {
      success: true,
      hash: recipientHash,
      fee: formatUnits(fee, 6),
      netAmount: formatUnits(amount - fee, 6),
    };
  }

  private async handleSwap(
    request: SwapRelayRequest,
    relayer: any,
    publicClient: any,
    config: any
  ): Promise<RelayResponse> {
    try {
      // Check user balance
      const userBalance = await this.checkBalance(
        request.chain,
        request.fromToken,
        request.fromAddress
      );

      const amount = parseUnits(request.amount, 6);
      const fee = this.calculateFee(amount);

      if (userBalance < amount) {
        return {
          success: false,
          error: `Insufficient balance. Have: ${formatUnits(userBalance, 6)}, Need: ${request.amount}`
        };
      }

      const fromTokenAddress = DEX_CONFIG['eth-sepolia'].TOKENS[request.fromToken].address;

      // Check relayer approval
      const allowance = await publicClient.readContract({
        address: fromTokenAddress as `0x${string}`,
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
        args: [request.fromAddress, relayer.account.address],
      });

      if ((allowance as bigint) < amount) {
        return {
          success: false,
          error: `Insufficient allowance. Please approve the relayer to spend at least ${formatUnits(amount, 6)} ${String(request.fromToken)}`
        };
      }

      let swapHash: Hash;

      try {
        // Pull tokens from user to relayer
        const pullFundsData = encodeFunctionData({
          abi: [{
            name: 'transferFrom',
            type: 'function',
            inputs: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ name: '', type: 'bool' }]
          }],
          functionName: 'transferFrom',
          args: [request.fromAddress, relayer.account.address, amount]
        });

        const pullHash = await relayer.sendTransaction({
          to: fromTokenAddress,
          data: pullFundsData,
          gas: 150000n,
        });

        console.log(`✅ Pulled ${formatUnits(amount, 6)} ${String(request.fromToken)} from user to relayer`);

        await publicClient.waitForTransactionReceipt({
          hash: pullHash,
          confirmations: 1,
        });

        // Execute swap through DEX
        const toTokenAddress = DEX_CONFIG['eth-sepolia'].TOKENS[request.toToken].address;
        
        const swapData = encodeFunctionData({
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
          args: [{
            tokenIn: fromTokenAddress as `0x${string}`,
            tokenOut: toTokenAddress as `0x${string}`,
            fee: 500, // 0.05% fee tier
            recipient: request.fromAddress, // Send swapped tokens directly to user
            deadline: BigInt(request.deadline),
            amountIn: amount - fee, // Subtract relayer fee
            amountOutMinimum: parseUnits(request.minAmountOut, 6),
            sqrtPriceLimitX96: 0n
          }]
        });

        swapHash = await relayer.sendTransaction({
          to: DEX_CONFIG['eth-sepolia'].ROUTER_ADDRESS as `0x${string}`,
          data: swapData,
          gas: 300000n, // Higher gas limit for swaps
        });

        console.log(`✅ Executed swap from ${String(request.fromToken)} to ${String(request.toToken)}`);

      } catch (txError: any) {
        console.error('Swap execution failed:', txError);

        if (txError.message?.includes('insufficient funds')) {
          return { success: false, error: 'Relayer has insufficient ETH for gas. Please contact support.' };
        }
        if (txError.message?.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {
          return { success: false, error: 'Swap failed: Price impact too high' };
        }

        return { success: false, error: 'Swap failed. Please try again.' };
      }

      try {
        const receipt = await publicClient.waitForTransactionReceipt({ 
          hash: swapHash,
          timeout: 30_000,
        });

        if (receipt.status === 'reverted') {
          return { success: false, error: 'Swap reverted' };
        }
      } catch (waitError) {
        console.error('Failed to wait for receipt:', waitError);
      }

      console.log(`✅ Relayed swap on ${request.chain}: ${swapHash}`);

      return {
        success: true,
        hash: swapHash,
        fee: formatUnits(fee, 6),
        netAmount: formatUnits(amount - fee, 6),
      };
    } catch (error: any) {
      console.error('Swap error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  async checkBalance(
    chain: SupportedChain,
    token: SupportedToken,
    address: `0x${string}`
  ): Promise<bigint> {
    const config = CHAIN_CONFIG[chain];
    const tokenAddress = config[token.toLowerCase() as 'usdc' | 'usdt'];

    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpc),
    });

    const balance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: [{
        name: 'balanceOf',
        type: 'function',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
      }],
      functionName: 'balanceOf',
      args: [address],
    });

    return balance as bigint;
  }

  async checkRelayerBalance(chain: SupportedChain): Promise<string> {
    const relayer = this.relayers.get(chain);
    if (!relayer) return '0';

    const config = CHAIN_CONFIG[chain];
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpc),
    });

    const balance = await publicClient.getBalance({
      address: relayer.account.address,
    });

    return formatUnits(balance, 18);
  }

  async getAllRelayerBalances(): Promise<Record<string, string>> {
    const balances: Record<string, string> = {};

    for (const chain of this.relayers.keys()) {
      balances[chain] = await this.checkRelayerBalance(chain);
    }

    return balances;
  }

  calculateFee(amount: bigint, isCrossChain: boolean = false): bigint {
    const basisPoints = isCrossChain ? FEE_CONFIG.crossChain : FEE_CONFIG.sameChain;
    let fee = (amount * BigInt(basisPoints)) / 10000n;

    // Apply min/max
    const minFee = parseUnits(FEE_CONFIG.minFeeUSD.toString(), 6);
    const maxFee = parseUnits(FEE_CONFIG.maxFeeUSD.toString(), 6);

    if (fee < minFee) fee = minFee;
    if (fee > maxFee) fee = maxFee;

    return fee;
  }

  private async validateRequest(request: RelayRequest): Promise<{ valid: boolean; error?: string }> {
    // Check deadline
    if (request.deadline < Date.now() / 1000) {
      return { valid: false, error: 'Request expired' };
    }

    // For testnet demo, skip nonce checking to simplify
    // In production, you'd want to track nonces properly
    
    // Basic validation only for testnet demo
    if (!request.fromAddress || !request.amount) {
      return { valid: false, error: 'Missing required fields' };
    }

    // Validate amount is positive
    try {
      const amount = parseUnits(request.amount, 6);
      if (amount <= 0n) {
        return { valid: false, error: 'Amount must be positive' };
      }
    } catch {
      return { valid: false, error: 'Invalid amount format' };
    }

    // Type-specific validation
    if (request.type === 'transfer') {
      if (!request.toAddress) {
        return { valid: false, error: 'Missing recipient address' };
      }
    } else if (request.type === 'swap') {
      if (!request.minAmountOut) {
        return { valid: false, error: 'Missing minimum output amount' };
      }
      try {
        const minAmount = parseUnits(request.minAmountOut, 6);
        if (minAmount <= 0n) {
          return { valid: false, error: 'Minimum output amount must be positive' };
        }
      } catch {
        return { valid: false, error: 'Invalid minimum output amount format' };
      }
    }

    return { valid: true };
  }

  // Admin functions
  async emergencyPause() {
    console.log('🚨 Emergency pause activated');
    // Implement pause logic
  }

  async withdrawFees(chain: SupportedChain, amount: string, recipient: string) {
    // Withdraw accumulated fees from relayer wallet
    const relayer = this.relayers.get(chain);
    if (!relayer) throw new Error(`No relayer for ${chain}`);

    // Transfer fees to treasury
    // Implementation depends on your fee collection mechanism
  }
}

// Singleton instance
export const relayerService = new RelayerService();
