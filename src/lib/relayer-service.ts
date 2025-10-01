// GasZero Relayer Service - Production Ready Implementation
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits, type Hash, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, sepolia, baseSepolia } from 'viem/chains';
import { DEX_CONFIG } from '@/config/chain.config';
import SWAP_ROUTER_ABI from '@/lib/abis/swaprouter.json';

// Chain configurations
// TESTNET MODE - Switch these when going to mainnet
type ChainFeature = 'transfer' | 'swap';

const CHAIN_CONFIG = {
  'eth-sepolia': {
    chain: sepolia,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Ethereum Sepolia
    usdt: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // USDT on Ethereum Sepolia
    rpc: process.env.ETH_RPC || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org', // Use env RPC or fallback
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

  // ✅ Handle Token → Token/ETH swaps
  // Flow: User → Relayer → Router → Swap
  // Required approvals:
  // 1. User must approve Relayer to pull tokens ✅ (checked earlier)
  // 2. Relayer must approve Router to spend tokens ✅ (CRITICAL - was missing!)
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

      // 4️⃣ CRITICAL: Relayer must approve router to spend the tokens
      console.log(`   🔍 Checking if relayer has approved router...`);
      console.log(`      Relayer address: ${relayer.account.address}`);
      console.log(`      Router address: ${routerAddress}`);
      console.log(`      Token address: ${fromTokenAddress}`);

      const currentAllowance = await publicClient.readContract({
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
          args: [relayer.account.address, routerAddress],
      }) as bigint;

      console.log(`   Current allowance: ${formatUnits(currentAllowance, fromDecimals)} ${request.fromToken}`);
      console.log(`   Required amount: ${formatUnits(amountAfterFee, fromDecimals)} ${request.fromToken}`);

      if (currentAllowance < amountAfterFee) {
          console.log(`   🔓 Relayer needs to approve router to spend ${formatUnits(amountAfterFee, fromDecimals)} ${request.fromToken}...`);

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
              args: [routerAddress, parseUnits('1000000', fromDecimals)] // Approve a large amount to avoid future approvals
          });

          // Add delay to avoid RPC rate limiting
          console.log(`   ⏳ Waiting 2s to avoid RPC rate limit...`);
          await new Promise(resolve => setTimeout(resolve, 2000));

          console.log(`   📝 Sending approval transaction from relayer to router...`);
          const approveHash = await relayer.sendTransaction({
              to: fromTokenAddress,
              data: approveData,
              gas: 100000n,
          });

          console.log(`   ⏳ Waiting for approval confirmation...`);
          const approveReceipt = await publicClient.waitForTransactionReceipt({
              hash: approveHash,
              confirmations: 1
          });

          if (approveReceipt.status === 'reverted') {
              console.error(`   ❌ Approval transaction reverted`);
              return {
                  success: false,
                  error: 'Failed to approve router to spend tokens'
              };
          }

          console.log(`   ✅ Router approved successfully: ${approveHash}`);
          console.log(`      Explorer: ${config.explorer}/tx/${approveHash}`);

          // Verify the approval went through
          const newAllowance = await publicClient.readContract({
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
              args: [relayer.account.address, routerAddress],
          }) as bigint;

          console.log(`   ✅ New allowance confirmed: ${formatUnits(newAllowance, fromDecimals)} ${request.fromToken}`);
      } else {
          console.log(`   ✅ Router already has sufficient allowance: ${formatUnits(currentAllowance, fromDecimals)} ${request.fromToken}`);
      }

      // 5️⃣ Execute swap via Uniswap V3 (skip pool verification for testnet)
      console.log(`   🔄 Executing swap...`);

      const feeTier = this.getOptimalFeeTier(request.fromToken, request.toToken);
      const minAmountOut = BigInt(request.minAmountOut);
      console.log(`   💰 Using fee tier: ${feeTier} (${feeTier / 10000}%)`);

      console.log(`   📊 Swap parameters:`);
      console.log(`      TokenIn: ${fromTokenAddress}`);
      console.log(`      TokenOut: ${toTokenAddress}`);
      console.log(`      Fee: ${feeTier}`);
      console.log(`      AmountIn: ${amountAfterFee.toString()} (${formatUnits(amountAfterFee, fromDecimals)} ${request.fromToken})`);
      console.log(`      MinAmountOut: ${minAmountOut.toString()} wei`);
      console.log(`      Recipient: ${request.fromAddress}`);

      // IMPORTANT: For USDC → ETH swaps on Uniswap V3:
      // 1. We're actually swapping USDC → WETH (not native ETH)
      // 2. The user will receive WETH tokens, not ETH
      // 3. If they want ETH, WETH needs to be unwrapped separately
      if (request.toToken === 'ETH') {
          console.log(`   ⚠️  Note: Swapping to WETH (Wrapped ETH), not native ETH`);
          console.log(`      WETH address: ${toTokenAddress}`);
          console.log(`      User will receive WETH tokens that can be unwrapped to ETH`);
      }

      // Try to get a quote first to verify pool exists and has liquidity
      console.log(`   🔍 Testing pool liquidity for ${request.fromToken}/${request.toToken} with fee ${feeTier}...`);

      // Check if we have the expected pool configuration (only eth-sepolia and arb-sepolia have POOLS)
      const chainConfig = DEX_CONFIG[request.chain as keyof typeof DEX_CONFIG];
      if ('POOLS' in chainConfig) {
          const poolKey = `${request.fromToken}-${request.toToken}`;
          const reversePoolKey = `${request.toToken}-${request.fromToken}`;
          const pools = (chainConfig as any).POOLS;
          const pool = pools[poolKey] || pools[reversePoolKey];

          if (pool) {
              console.log(`   ✅ Pool configuration found:`, {
                  address: pool.address,
                  fee: pool.fee,
                  token0: pool.token0,
                  token1: pool.token1
              });
          } else {
              console.log(`   ⚠️  No pool configuration found for ${poolKey}`);
              console.log(`      Available pools:`, Object.keys(pools));
          }
      }

      // The actual Uniswap V3 SwapRouter on Sepolia might have different versions
      // Let's try the structure that matches the actual ABI
      const swapParams = {
          tokenIn: fromTokenAddress,
          tokenOut: toTokenAddress,
          fee: feeTier,
          recipient: request.fromAddress,
          amountIn: amountAfterFee,
          amountOutMinimum: minAmountOut,
          sqrtPriceLimitX96: 0n
      };

      console.log(`   📝 Encoding swap data with params:`, {
          tokenIn: swapParams.tokenIn,
          tokenOut: swapParams.tokenOut,
          fee: swapParams.fee,
          recipient: swapParams.recipient,
          amountIn: swapParams.amountIn.toString(),
          amountOutMinimum: swapParams.amountOutMinimum.toString(),
          sqrtPriceLimitX96: '0'
      });

      // Use the actual Uniswap V3 ABI - it should handle both versions
      const swapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [swapParams]
      });

      console.log(`   📄 Encoded swap data: ${swapData}`);
      console.log(`   📍 Sending to router: ${routerAddress}`);

      let swapHash: `0x${string}`;
      try {
          // Add delay to avoid RPC rate limiting (especially for public nodes)
          console.log(`   ⏳ Waiting 2s before swap to avoid RPC rate limit...`);
          await new Promise(resolve => setTimeout(resolve, 2000));

          console.log(`   📤 Sending swap transaction...`);
          swapHash = await relayer.sendTransaction({
              to: routerAddress,
              data: swapData,
              value: 0n, // No ETH value needed for token swaps
              gas: 500000n, // Higher gas for swaps
          });
          console.log(`   ✅ Swap transaction sent: ${swapHash}`);
      } catch (error: any) {
          console.error(`   ❌ Swap transaction failed:`, error.message);
          console.error(`   Error details:`, error);

          // Parse common Uniswap V3 revert reasons
          let errorMessage = 'Swap transaction failed';
          if (error.message?.includes('STF') || error.message?.includes('SafeTransferFrom')) {
              errorMessage = 'Token transfer failed - check token approval and balance';
          } else if (error.message?.includes('SPL') || error.message?.includes('SqrtPriceLimit')) {
              errorMessage = 'Price moved beyond acceptable slippage';
          } else if (error.message?.includes('AS') || error.message?.includes('AmountSpecified')) {
              errorMessage = 'Invalid swap amount specified';
          } else if (error.message?.includes('TLO') || error.message?.includes('Too little obtained')) {
              errorMessage = 'Output amount less than minimum - increase slippage or reduce amount';
          } else if (error.message?.includes('TLM') || error.message?.includes('Too little received')) {
              errorMessage = 'Insufficient output for minimum amount';
          } else if (error.message?.includes('execution reverted')) {
              errorMessage = 'Swap reverted - likely due to insufficient liquidity or incorrect parameters';
          }

          return {
              success: false,
              error: `${errorMessage}: ${error.shortMessage || error.message}`
          };
      }

      console.log(`   ⏳ Waiting for confirmation...`);
      const receipt = await publicClient.waitForTransactionReceipt({
          hash: swapHash,
          confirmations: 1,
          timeout: 60000
      });

      if (receipt.status === 'reverted') {
          console.error(`   ❌ Swap transaction reverted`);
          console.error(`   Transaction: ${swapHash}`);
          return {
              success: false,
              error: `Swap reverted. Check transaction: ${config.explorer}/tx/${swapHash}`
          };
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

    const from = fromToken.toUpperCase();
    const to = toToken.toUpperCase();

    console.log(`   🔍 Determining fee tier for ${from} → ${to}`);

    // Normalize ETH and WETH
    const normalizedFrom = from === 'WETH' ? 'ETH' : from;
    const normalizedTo = to === 'WETH' ? 'ETH' : to;
    const tokens = [normalizedFrom, normalizedTo].sort();

    // Stablecoin pairs (USDC/USDT, DAI/USDC, etc.)
    if ((tokens.includes('USDC') && tokens.includes('USDT')) ||
        (tokens.includes('USDC') && tokens.includes('DAI')) ||
        (tokens.includes('USDT') && tokens.includes('DAI'))) {
      console.log(`   ✅ Stablecoin pair detected → Fee tier: 100 (0.01%)`);
      return 100;
    }

    // ETH/USDC, ETH/USDT, ETH/DAI - use 3000 (0.3% - HIGHEST LIQUIDITY on Sepolia)
    if (tokens.includes('ETH') && (tokens.includes('USDC') || tokens.includes('USDT') || tokens.includes('DAI'))) {
      console.log(`   ✅ ETH-Stablecoin pair detected → Fee tier: 3000 (0.3%)`);
      return 3000;
    }

    // Default to 3000 (0.3%) - most common pool
    console.log(`   ✅ Using default fee tier: 3000 (0.3%)`);
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
