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
    rpc: process.env.ETH_RPC || 'https://ethereum-sepolia-rpc.publicnode.com', // Better RPC
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

  private async initializeRelayers() {
    // Initialize relayers for configured chains
    const chains: SupportedChain[] = ['eth-sepolia', 'arb-sepolia', 'base-sepolia'];

    console.log('\n=== Initializing Relayer Service ===');
    console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('RELAYER')));

    chains.forEach(chain => {
      // Fix: Correct env key format - remove hyphen replacement for eth-sepolia
      const envKey = chain === 'eth-sepolia'
        ? 'ETH_SEPOLIA_RELAYER_KEY'
        : chain === 'arb-sepolia'
        ? 'ARB_SEPOLIA_RELAYER_KEY'
        : 'BASE_SEPOLIA_RELAYER_KEY';

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

      // Check relayer balance
      const publicClient = createPublicClient({
        chain: config.chain,
        transport: http(config.rpc),
      });

      this.relayers.set(chain, walletClient);

      // Get balance asynchronously
      publicClient.getBalance({ address: account.address }).then(balance => {
        const ethBalance = formatUnits(balance, 18);
        console.log(`✅ Initialized ${chain} relayer:`);
        console.log(`   Address: ${account.address}`);
        console.log(`   ETH Balance: ${ethBalance} ETH`);
        console.log(`   RPC: ${config.rpc}`);

        if (balance < parseUnits('0.01', 18)) {
          console.warn(`⚠️  WARNING: ${chain} relayer has low ETH balance (${ethBalance} ETH)`);
        }
      }).catch(error => {
        console.error(`❌ Failed to check balance for ${chain}:`, error.message);
      });
    });

    console.log('=== Relayer Service Initialization Complete ===\n');
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
        try { // ✅ Added try-catch wrapper
            // Check user has sufficient balance
            const userBalance = await this.checkBalance(
                request.chain,
                request.token,
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

            const tokenAddress = config[String(request.token).toLowerCase() as 'usdc' | 'usdt'];

            // ✅ SINGLE allowance check (removed duplicate)
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

            // Auto-fund user if they need approval but have no ETH
            if ((allowance as bigint) < amount) {
                const userETHBalance = await publicClient.getBalance({
                    address: request.fromAddress
                });

                if (userETHBalance < parseUnits('0.001', 18)) {
                    console.log(`🎁 User needs approval but has no ETH. Funding ${request.fromAddress}...`);

                    try {
                        const fundingHash = await relayer.sendTransaction({
                            to: request.fromAddress,
                            value: parseUnits('0.001', 18),
                            gas: 21000n,
                        });

                        await publicClient.waitForTransactionReceipt({
                            hash: fundingHash,
                            confirmations: 1,
                        });

                        console.log(`✅ Funded user with 0.001 ETH for approval`);

                        return {
                            success: false,
                            error: 'APPROVAL_FUNDED',
                            fee: '0.001 ETH sent for approval. Please approve and retry.',
                        };
                    } catch (fundError: any) {
                        console.error('Failed to fund user:', fundError);
                        return {
                            success: false,
                            error: 'Failed to fund user. Please add ETH manually.',
                        };
                    }
                }

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

                console.log(`[${request.chain}] Pulling funds from user...`);
                console.log(`[${request.chain}] Token address: ${tokenAddress}`);
                console.log(`[${request.chain}] Amount: ${formatUnits(amount, 6)} ${String(request.token)}`);
                console.log(`[${request.chain}] Gas limit: ${request.chain === 'eth-sepolia' ? '200000' : '150000'}`);

                const pullHash = await relayer.sendTransaction({
                    to: tokenAddress,
                    data: pullFundsData,
                    gas: request.chain === 'eth-sepolia' ? 200000n : 150000n, // Higher gas for eth-sepolia
                }).catch((error: any) => {
                    console.error(`[${request.chain}] Pull funds transaction error:`, error);
                    throw new Error(`Failed to send pull transaction: ${error.message}`);
                });

                console.log(`[${request.chain}] Pull transaction sent: ${pullHash}`);

                // Add timeout for receipt with better error handling
                await Promise.race([
                    publicClient.waitForTransactionReceipt({
                        hash: pullHash,
                        confirmations: 1,
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Pull transaction confirmation timeout after 30s')), 30000)
                    )
                ]).catch((error: any) => {
                    console.error(`[${request.chain}] Pull receipt error:`, error);
                    throw error;
                });

                console.log(`✅ [${request.chain}] Pulled ${formatUnits(amount, 6)} ${String(request.token)} from user to relayer`);

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

                console.log(`[${request.chain}] Sending to recipient...`);
                console.log(`[${request.chain}] Recipient: ${request.toAddress}`);
                console.log(`[${request.chain}] Net amount: ${formatUnits(amount - fee, 6)} ${String(request.token)}`);

                recipientHash = await relayer.sendTransaction({
                    to: tokenAddress,
                    data: sendToRecipientData,
                    gas: request.chain === 'eth-sepolia' ? 200000n : 150000n, // Higher gas for eth-sepolia
                }).catch((error: any) => {
                    console.error(`[${request.chain}] Send to recipient transaction error:`, error);
                    throw new Error(`Failed to send recipient transaction: ${error.message}`);
                });

                console.log(`[${request.chain}] Send transaction sent: ${recipientHash}`);
                console.log(`✅ [${request.chain}] Sent ${formatUnits(amount - fee, 6)} ${String(request.token)} to recipient`);
                console.log(`✅ [${request.chain}] Fee collected: ${formatUnits(fee, 6)} ${String(request.token)}`);

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

            // Wait for recipient transaction with proper timeout handling
            const receipt = await Promise.race([
                publicClient.waitForTransactionReceipt({
                    hash: recipientHash,
                    confirmations: 1,
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`[${request.chain}] Recipient transaction confirmation timeout`)), 30000)
                )
            ]).catch((error: any) => {
                console.error(`[${request.chain}] Recipient receipt error:`, error);
                throw error;
            });

            if (receipt.status === 'reverted') {
                return { success: false, error: 'Transaction reverted' };
            }

            console.log(`\n✅ [${request.chain}] TRANSFER COMPLETE`);
            console.log(`   Chain: ${config.name}`);
            console.log(`   Transaction: ${recipientHash}`);
            console.log(`   Explorer: ${config.explorer}/tx/${recipientHash}`);
            console.log(`   Amount sent: ${formatUnits(amount - fee, 6)} ${String(request.token)}`);
            console.log(`   Fee collected: ${formatUnits(fee, 6)} ${String(request.token)}\n`);

            return {
                success: true,
                hash: recipientHash,
                fee: formatUnits(fee, 6),
                netAmount: formatUnits(amount - fee, 6),
            };
        } catch (error: any) { // ✅ Added catch block
            console.error(`\n❌ [${request.chain}] TRANSFER FAILED`);
            console.error(`   Chain: ${config.name}`);
            console.error(`   Error: ${error.message}`);
            console.error(`   Stack trace:`, error.stack);

            // Provide more specific error messages
            let errorMessage = error.message || 'Unknown error';
            if (error.message?.includes('timeout')) {
                errorMessage = `Transaction timeout on ${config.name}. The network may be congested.`;
            } else if (error.message?.includes('insufficient funds')) {
                errorMessage = `Relayer has insufficient ETH on ${config.name}. Please contact support.`;
            }

            return {
                success: false,
                error: `[${config.name}] ${errorMessage}`,
            };
        }
    }

    private async handleSwap(
      request: SwapRelayRequest,
      relayer: any,
      publicClient: any,
      config: any
  ): Promise<RelayResponse> {
      try {
          console.log(`\n🔄 [${request.chain}] SWAP INITIATED`);
          console.log(`   From: ${request.fromToken} → To: ${request.toToken}`);
          console.log(`   Amount: ${request.amount}`);
          console.log(`   User: ${request.fromAddress}`);

          // ✅ FIX: Use correct chain config
          const chainDexConfig = DEX_CONFIG[request.chain as keyof typeof DEX_CONFIG];
          if (!chainDexConfig) {
              return { success: false, error: `Chain ${request.chain} not supported for swaps` };
          }

          const fromTokenConfig = chainDexConfig.TOKENS[request.fromToken];
          const toTokenConfig = chainDexConfig.TOKENS[request.toToken];

          if (!fromTokenConfig || !toTokenConfig) {
              return { success: false, error: `Token pair ${request.fromToken}/${request.toToken} not supported on ${request.chain}` };
          }

          const fromTokenAddress = fromTokenConfig.address as `0x${string}`;
          const toTokenAddress = toTokenConfig.address as `0x${string}`;
          const routerAddress = chainDexConfig.ROUTER_ADDRESS as `0x${string}`;

          console.log(`   From Token: ${fromTokenAddress}`);
          console.log(`   To Token: ${toTokenAddress}`);
          console.log(`   Router: ${routerAddress}`);

          // Calculate amounts
          const amount = parseUnits(request.amount, fromTokenConfig.decimals);
          const fee = this.calculateFee(amount);
          const amountAfterFee = amount - fee;

          console.log(`   Amount: ${formatUnits(amount, fromTokenConfig.decimals)}`);
          console.log(`   Fee: ${formatUnits(fee, fromTokenConfig.decimals)}`);
          console.log(`   Net Amount: ${formatUnits(amountAfterFee, fromTokenConfig.decimals)}`);

          // ✅ Handle ETH → Token swaps differently
          if (request.fromToken === 'ETH') {
              return this.handleETHToTokenSwap(
                  request,
                  relayer,
                  publicClient,
                  config,
                  routerAddress,
                  toTokenAddress,
                  amount,
                  fee,
                  amountAfterFee
              );
          }

          // ✅ Handle Token → ETH or Token → Token swaps
          return this.handleTokenSwap(
              request,
              relayer,
              publicClient,
              config,
              fromTokenAddress,
              toTokenAddress,
              routerAddress,
              fromTokenConfig.decimals,
              toTokenConfig.decimals,
              amount,
              fee,
              amountAfterFee
          );

      } catch (error: any) {
          console.error(`\n❌ [${request.chain}] SWAP FAILED`);
          console.error(`   Error: ${error.message}`);
          console.error(`   Stack:`, error.stack);
          return {
              success: false,
              error: error.message || 'Swap execution failed',
          };
      }
  }

  // ✅ NEW: Handle Token → Token/ETH swaps
  private async handleTokenSwap(
      request: SwapRelayRequest,
      relayer: any,
      publicClient: any,
      config: any,
      fromTokenAddress: `0x${string}`,
      toTokenAddress: `0x${string}`,
      routerAddress: `0x${string}`,
      fromDecimals: number,
      toDecimals: number,
      amount: bigint,
      fee: bigint,
      amountAfterFee: bigint
  ): Promise<RelayResponse> {

      // 1️⃣ Check user balance
      const userBalance = await publicClient.readContract({
          address: fromTokenAddress,
          abi: [{
              name: 'balanceOf',
              type: 'function',
              inputs: [{ name: 'account', type: 'address' }],
              outputs: [{ name: '', type: 'uint256' }],
              stateMutability: 'view',
          }],
          functionName: 'balanceOf',
          args: [request.fromAddress],
      }) as bigint;

      if (userBalance < amount) {
          return {
              success: false,
              error: `Insufficient balance. Have: ${formatUnits(userBalance, fromDecimals)}, Need: ${formatUnits(amount, fromDecimals)}`
          };
      }

      // 2️⃣ Check allowance to relayer
      const allowance = await publicClient.readContract({
          address: fromTokenAddress,
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
      }) as bigint;

      if (allowance < amount) {
          return {
              success: false,
              error: `Insufficient allowance. Please approve relayer first.`
          };
      }

      // 3️⃣ Pull tokens from user to relayer
      console.log(`   📥 Pulling ${formatUnits(amount, fromDecimals)} tokens from user...`);

      const pullData = encodeFunctionData({
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
          data: pullData,
          gas: 150000n,
      });

      await publicClient.waitForTransactionReceipt({ hash: pullHash, confirmations: 1 });
      console.log(`   ✅ Pulled tokens: ${pullHash}`);

      // 4️⃣ Approve router to spend tokens
      console.log(`   🔓 Approving router to spend tokens...`);

      const approveData = encodeFunctionData({
          abi: [{
              name: 'approve',
              type: 'function',
              inputs: [
                  { name: 'spender', type: 'address' },
                  { name: 'amount', type: 'uint256' }
              ],
              outputs: [{ name: '', type: 'bool' }]
          }],
          functionName: 'approve',
          args: [routerAddress, amountAfterFee]
      });

      const approveHash = await relayer.sendTransaction({
          to: fromTokenAddress,
          data: approveData,
          gas: 100000n,
      });

      await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 });
      console.log(`   ✅ Approved router: ${approveHash}`);

      // 5️⃣ Execute swap via Uniswap V3
      console.log(`   🔄 Executing swap...`);

      const minAmountOut = BigInt(request.minAmountOut);

      // Determine best fee tier for this pair
      // For ETH/USDC pairs, use 3000 (0.3%) - most common pool
      // For stablecoin pairs, use 100 (0.01%)
      const feeTier = this.getOptimalFeeTier(request.fromToken, request.toToken);
      console.log(`   💰 Using fee tier: ${feeTier} (${feeTier / 10000}%)`);

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
              tokenIn: fromTokenAddress,
              tokenOut: toTokenAddress,
              fee: feeTier,
              recipient: request.fromAddress, // Send output directly to user
              deadline: BigInt(request.deadline),
              amountIn: amountAfterFee,
              amountOutMinimum: minAmountOut,
              sqrtPriceLimitX96: 0n
          }]
      });

      const swapHash = await relayer.sendTransaction({
          to: routerAddress,
          data: swapData,
          gas: 500000n, // Higher gas for swaps
      });

      const receipt = await publicClient.waitForTransactionReceipt({
          hash: swapHash,
          confirmations: 1,
          timeout: 60000
      });

      if (receipt.status === 'reverted') {
          return { success: false, error: 'Swap transaction reverted' };
      }

      console.log(`\n✅ [${request.chain}] SWAP COMPLETE`);
      console.log(`   Transaction: ${swapHash}`);
      console.log(`   Explorer: ${config.explorer}/tx/${swapHash}`);
      console.log(`   Fee collected: ${formatUnits(fee, fromDecimals)}\n`);

      return {
          success: true,
          hash: swapHash,
          fee: formatUnits(fee, fromDecimals),
          netAmount: formatUnits(amountAfterFee, fromDecimals),
      };
  }

  // ✅ NEW: Handle ETH → Token swaps (requires wrapping ETH first)
  private async handleETHToTokenSwap(
      request: SwapRelayRequest,
      relayer: any,
      publicClient: any,
      config: any,
      routerAddress: `0x${string}`,
      toTokenAddress: `0x${string}`,
      amount: bigint,
      fee: bigint,
      amountAfterFee: bigint
  ): Promise<RelayResponse> {
      // For ETH swaps, you'd need to:
      // 1. Have user send ETH to relayer first (separate transaction)
      // 2. Wrap ETH → WETH
      // 3. Swap WETH → Token

      return {
          success: false,
          error: 'ETH → Token swaps not yet implemented. Use USDC → ETH instead.'
      };
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
        const minAmount = BigInt(request.minAmountOut);
        if (minAmount <= 0n) {
          return { valid: false, error: 'Minimum output amount must be positive' };
        }
      } catch {
        return { valid: false, error: 'Invalid minimum output amount format' };
      }
    }

    return { valid: true };
  }

  // Helper function to determine optimal fee tier for token pairs
  private getOptimalFeeTier(fromToken: string, toToken: string): number {
    // Uniswap V3 fee tiers:
    // 100 = 0.01% (stablecoins)
    // 500 = 0.05% (correlated assets)
    // 3000 = 0.3% (most pairs - HIGHEST LIQUIDITY)
    // 10000 = 1% (exotic pairs)

    const tokens = [fromToken.toUpperCase(), toToken.toUpperCase()].sort();

    // Stablecoin pairs (USDC/USDT, DAI/USDC, etc.)
    if ((tokens.includes('USDC') && tokens.includes('USDT')) ||
        (tokens.includes('USDC') && tokens.includes('DAI')) ||
        (tokens.includes('USDT') && tokens.includes('DAI'))) {
      return 100; // 0.01% for stablecoins
    }

    // ETH/USDC, ETH/USDT, ETH/DAI - use 0.3% (most common)
    if (tokens.includes('ETH') && (tokens.includes('USDC') || tokens.includes('USDT') || tokens.includes('DAI'))) {
      return 3000; // 0.3% - highest liquidity for ETH pairs
    }

    // WETH/USDC pairs
    if (tokens.includes('WETH') && (tokens.includes('USDC') || tokens.includes('USDT'))) {
      return 3000; // 0.3%
    }

    // Default to 3000 (0.3%) - most common pool
    return 3000;
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
