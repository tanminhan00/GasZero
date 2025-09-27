'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits, formatUnits, encodeFunctionData, createPublicClient, createWalletClient, custom, http, parseEther, formatEther, type Hash } from 'viem';
import { arbitrumSepolia, sepolia } from 'viem/chains';
import toast, { Toaster } from 'react-hot-toast';
import relayerAddresses from '@/config/relayers.json';
import { NetworkType, DEX_CONFIG } from '@/config/chain.config';
import { getUserBalance, getPrice, getPool, estimateGas } from '@/lib/expand-api';
import { EXPAND_CONFIG } from '@/config/expand.config';
import { executeDirectSwap } from '@/lib/direct-swap';
import { executeRelayerSwap } from '@/lib/relayer-swap';
type SwapSupportedChain = 'eth-sepolia' | 'arb-sepolia';
type SupportedChain = SwapSupportedChain;
type TokenType = keyof typeof DEX_CONFIG['eth-sepolia']['TOKENS'];
type DexConfigType = typeof DEX_CONFIG['eth-sepolia'];
// Define token interface
interface TokenConfig {
  address: string;
  decimals: number;
  symbol: string;
  icon: string;
}

type Token = 'ETH' | 'USDC';

// Get the supported tokens for the current chain
const getSupportedTokens = (chain: SupportedChain): Record<string, TokenConfig> => {
  // Only ETH and USDC are supported on Sepolia
  const config = DEX_CONFIG['eth-sepolia'];
  return {
    ETH: config.TOKENS.ETH,
    USDC: config.TOKENS.USDC,
  };
};

const swapChains: Record<SwapSupportedChain, {
  name: string;
  color: string;
  icon: string;
  chain: typeof sepolia | typeof arbitrumSepolia;
  relayer: string;
}> = {
  'eth-sepolia': {
    name: 'Ethereum Sepolia',
    color: 'from-blue-500 to-cyan-500',
    icon: '⚡',
    chain: sepolia,
    relayer: relayerAddresses.relayerAddresses['eth-sepolia'],
  },
  'arb-sepolia': {
    name: 'Arbitrum Sepolia',
    color: 'from-purple-500 to-pink-500',
    icon: '🔷',
    chain: arbitrumSepolia,
    relayer: relayerAddresses.relayerAddresses['arb-sepolia'],
  },
};

export default function SwapPage() {
  const [selectedChain, setSelectedChain] = useState<SwapSupportedChain>('eth-sepolia');
  const [fromToken, setFromToken] = useState<Token>('USDC');
  const [toToken, setToToken] = useState<Token>('ETH');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [userETHBalance, setUserETHBalance] = useState('0');
  const [userUSDCBalance, setUserUSDCBalance] = useState('0');
  const [expectedOutput, setExpectedOutput] = useState('0');
  const [priceImpact, setPriceImpact] = useState('0');
  const [poolData, setPoolData] = useState<{
    pool: string;
    fee: string;
    liquidity: string;
  } | null>(null);
  const [autoApprovingEnabled, setAutoApprovingEnabled] = useState(true);
  const [swapMode, setSwapMode] = useState<'direct' | 'relayer' | 'gasless'>('direct');
  // Removed quote state
  const [approvalHistory, setApprovalHistory] = useState<{
    approvals: { spender: string; amount: string; timestamp: string; }[];
    totalApprovals: number;
  } | null>(null);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Check balances
  useEffect(() => {
    if (address && isConnected) {
      checkETHBalance();
      checkUSDCBalance();
    }
  }, [address, isConnected, selectedChain]);

  async function checkUSDCBalance() {
    if (!address) return;

    try {
      const usdcAddress = getSupportedTokens(selectedChain).USDC.address;
      const response = await getUserBalance({
        tokenAddress: usdcAddress,
        address,
        chainId: EXPAND_CONFIG.SUPPORTED_CHAINS[selectedChain].chainId,
      });

      if (response.status === 200) {
        setUserUSDCBalance(response.data.balance);
      }
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
    }
  }

  async function checkETHBalance() {
    if (!address) return;

    const chainConfig = swapChains[selectedChain];
    const publicClient = createPublicClient({
      chain: chainConfig.chain,
      transport: http(),
    });

    const balance = await publicClient.getBalance({ address });
    setUserETHBalance(formatEther(balance));
  }

  // Fetch pool and price data every 5 seconds when amount is set
  useEffect(() => {
    if (!fromToken || !toToken || !isConnected || !address) {
      setExpectedOutput('0');
      setPriceImpact('0');
      setPoolData(null);
      return;
    }

    const fetchData = async () => {
      try {
        const fromTokenAddress = getSupportedTokens(selectedChain)[fromToken].address;
        const toTokenAddress = getSupportedTokens(selectedChain)[toToken].address;
        const amountIn = amount ? parseUnits(amount, getSupportedTokens(selectedChain)[fromToken].decimals).toString() : '100000000';
        const dexId = EXPAND_CONFIG.SUPPORTED_CHAINS[selectedChain].dexId;
        const chainId = EXPAND_CONFIG.SUPPORTED_CHAINS[selectedChain].chainId;

        // Only fetch pool data if we're on Ethereum Sepolia and using USDC/ETH pair
        if (selectedChain === 'eth-sepolia' && 
            ((fromToken === 'USDC' && toToken === 'ETH') || 
             (fromToken === 'ETH' && toToken === 'USDC'))) {
          const poolResponse = await getPool({
            dexId,
            tokenA: fromTokenAddress,
            tokenB: toTokenAddress,
            path: [fromTokenAddress, toTokenAddress],
            amountIn,
            gas: '800000',
            from: address,
            to: address,
            cheapestSwap: true,
            gasPriority: 'high',
            bestSwap: true,
            chainId,
          });

          if (poolResponse.status === 200) {
            setPoolData({
              pool: poolResponse.data.pool,
              fee: poolResponse.data.fee,
              liquidity: poolResponse.data.liquidity,
            });
          }
        }

        // Only fetch price if amount is set
        if (amount) {
          const priceResponse = await getPrice({
            dexId,
            path: `${fromTokenAddress},${toTokenAddress}`,
            amountIn: parseUnits(amount, getSupportedTokens(selectedChain)[fromToken].decimals).toString(),
          });

          if (priceResponse.status === 200) {
            setExpectedOutput(priceResponse.data.amountOut);
            setPriceImpact(priceResponse.data.priceImpact || '0');
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);

    return () => clearInterval(interval);
  }, [amount, fromToken, toToken, isConnected, selectedChain, address]);

  // Check approval when amount changes
  useEffect(() => {
    if (amount && fromToken && toToken && address && isConnected) {
      checkApproval();
    }
  }, [amount, fromToken, toToken, address, isConnected, selectedChain]);

  // Removed approval history function as we're not using Expand API anymore

  async function checkApproval() {
    if (!address || !amount) return;

    setCheckingApproval(true);
    try {
      const chainConfig = swapChains[selectedChain];
      const tokenAddress = getSupportedTokens(selectedChain)[fromToken].address;
      const amountToApprove = parseUnits(amount, getSupportedTokens(selectedChain)[fromToken].decimals);

      const publicClient = createPublicClient({
        chain: chainConfig.chain,
        transport: http(),
      });

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
        args: [address, chainConfig.relayer as `0x${string}`],
      });

      setNeedsApproval((allowance as bigint) < amountToApprove);
    } catch (error) {
      console.error('Error checking approval:', error);
    } finally {
      setCheckingApproval(false);
    }
  }

  async function approveToken() {
    if (!address || !amount) return;

    const toastId = toast.loading('Preparing approval...');

    try {
      // Ensure we're on the correct chain first
      const chainConfig = swapChains[selectedChain];
      const ethereum = (window as any).ethereum;
      
      if (ethereum) {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chainConfig.chain.id.toString(16)}` }],
        }).catch(async (switchError: any) => {
          if (switchError.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${chainConfig.chain.id.toString(16)}`,
                chainName: chainConfig.name,
                rpcUrls: [chainConfig.chain.rpcUrls.default.http[0]],
                nativeCurrency: chainConfig.chain.nativeCurrency,
                blockExplorerUrls: [chainConfig.chain.blockExplorers?.default.url],
              }],
            });
          } else {
            throw switchError;
          }
        });
      }

      toast.loading('Please approve in your wallet...', { id: toastId });
      const tokenAddress = getSupportedTokens(selectedChain)[fromToken].address;
      const amountToApprove = parseUnits('1000000', getSupportedTokens(selectedChain)[fromToken].decimals);

      // Create wallet client with the correct chain
      const walletClient = createWalletClient({
        account: address as `0x${string}`,
        chain: swapChains[selectedChain].chain,
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
        args: [chainConfig.relayer as `0x${string}`, amountToApprove]
      });

      const hash = await walletClient.sendTransaction({
        chain: chainConfig.chain,
        to: tokenAddress as `0x${string}`,
        data: approveData,
      });

      toast.loading('Waiting for confirmation...', { id: toastId });

      const publicClient = createPublicClient({
        chain: chainConfig.chain,
        transport: http(),
      });

      await publicClient.waitForTransactionReceipt({ hash });

      toast.success('Approval successful!', { id: toastId });
      setNeedsApproval(false);

    } catch (error: any) {
      console.error('Approval error:', error);
      toast.error(error.message || 'Approval failed', { id: toastId });
    }
  }

  async function handleRelayerSwap() {
    if (!address || !amount) {
      toast.error(`Please check: ${!address ? 'Wallet not connected' : ''} ${!amount ? 'Amount not entered' : ''}`);
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Preparing relayer swap...');

    try {
      // Get relayer's private key from environment variable
      const relayerPrivateKey = process.env.NEXT_PUBLIC_RELAYER_PRIVATE_KEY;
      if (!relayerPrivateKey) {
        throw new Error('Relayer configuration missing');
      }

      // Execute the relayer swap
      const { hash, ethAmount } = await executeRelayerSwap(
        address as `0x${string}`,
        amount,
        relayerPrivateKey,
        0.5 // 0.5% fee
      );

      toast.success(
        <div>
          <p className="font-bold">🎉 Relayer Swap Successful!</p>
          <p className="text-sm">Swapped {amount} {fromToken} for {ethAmount} ETH</p>
          <p className="text-xs">Fee: 0.5%</p>
          <a
            href={`${swapChains[selectedChain].chain.blockExplorers?.default.url}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline mt-2 block hover:opacity-80"
          >
            View on Explorer →
          </a>
        </div>,
        { id: toastId, duration: 10000 }
      );

      setAmount('');
      checkApproval();
    } catch (error: any) {
      console.error('Relayer swap error:', error);
      toast.error(error.message || 'Relayer swap failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  async function handleDirectSwap() {
    if (!address || !amount) {
      toast.error(`Please check: ${!address ? 'Wallet not connected' : ''} ${!amount ? 'Amount not entered' : ''}`);
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Preparing swap...');

    try {
      const hash = await executeDirectSwap(
        selectedChain,
        fromToken,
        toToken,
        amount,
        address as `0x${string}`,
        0.5 // 0.5% slippage
      );

      toast.success(
        <div>
          <p className="font-bold">🎉 Swap Successful!</p>
          <p className="text-sm">Swapped {amount} {fromToken} for {toToken}</p>
          <p className="text-xs">Slippage: 0.5%</p>
          <a
            href={`${swapChains[selectedChain].chain.blockExplorers?.default.url}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline mt-2 block hover:opacity-80"
          >
            View on Explorer →
          </a>
        </div>,
        { id: toastId, duration: 10000 }
      );

      setAmount('');
      checkApproval();
    } catch (error: any) {
      console.error('Swap error:', error);
      toast.error(error.message || 'Swap failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  async function handleGaslessSwap() {
    if (!address || !amount) {
      toast.error(`Please check: ${!address ? 'Wallet not connected' : ''} ${!amount ? 'Amount not entered' : ''}`);
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Preparing gasless swap...');

    try {
      // Calculate minimum amount out with 0.5% slippage
      const amountIn = parseUnits(amount, getSupportedTokens(selectedChain)[fromToken].decimals);
      const minAmountOut = (amountIn * 995n) / 1000n; // 0.5% slippage

      // Get gas estimate
      const gasEstimate = await estimateGas({
        from: address,
        to: address,
        value: '0',
        data: '0x',
        chainId: EXPAND_CONFIG.SUPPORTED_CHAINS[selectedChain].chainId,
      });

      // Create message to sign
      const message = JSON.stringify({
        type: 'swap',
        chain: selectedChain,
        fromToken,
        toToken,
        amount,
        minAmountOut: minAmountOut.toString(),
        gas: gasEstimate.gasLimit,
        timestamp: Date.now(),
      });

      toast.loading('✍️ Please sign the message (FREE - no gas!)...', { id: toastId });
      const signature = await signMessageAsync({ message });

      toast.loading('⚡ Executing swap gaslessly...', { id: toastId });

      // Send to relayer
      const response = await fetch('/api/relay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          signature,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to execute swap');
      }

      const result = await response.json();
      toast.success(
        <div>
          <p className="font-bold">🎉 Swap Successful!</p>
          <p className="text-sm">Swapped {amount} {fromToken} for {toToken}</p>
          <p className="text-xs">Slippage: 0.5%</p>
          <p className="text-xs font-bold text-green-600">No ETH was used!</p>
          <a
            href={`${swapChains[selectedChain].chain.blockExplorers?.default.url}/tx/${result.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline mt-2 block hover:opacity-80"
          >
            View on Explorer →
          </a>
        </div>,
        { id: toastId, duration: 10000 }
      );

      setAmount('');
      checkApproval();
    } catch (error: any) {
      console.error('Swap error:', error);
      toast.error(error.message || 'Swap failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1f2937',
            color: '#fff',
            borderRadius: '12px',
            border: '1px solid #374151',
          },
        }}
      />

      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="border-b border-white/10 backdrop-blur-md bg-black/20">
          <div className="container mx-auto px-4 py-4">
              <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-lg opacity-50"></div>
                  <div className="relative bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full w-12 h-12 flex items-center justify-center text-2xl font-bold">
                    ⚡
                  </div>
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    GasZero Swap
                  </h1>
                  <p className="text-xs text-gray-400">Gasless swaps on Ethereum & Arbitrum</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {address && (
                  <div className="flex gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">ETH Balance</p>
                      <p className="text-sm font-mono text-white">
                        {parseFloat(userETHBalance).toFixed(4)} ETH
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">USDC Balance</p>
                      <p className="text-sm font-mono text-white">
                        {formatUnits(BigInt(userUSDCBalance || '0'), 6)} USDC
                      </p>
                    </div>
                  </div>
                )}
                <ConnectButton />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            {!isConnected ? (
              <div className="text-center py-20">
                <div className="mb-8 relative inline-block">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-2xl opacity-30 animate-pulse"></div>
                  <h2 className="relative text-6xl font-bold text-white mb-2">
                    Swap Tokens
                  </h2>
                  <h2 className="relative text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Without Gas
                  </h2>
                </div>
                <p className="text-xl text-gray-300 mb-12 max-w-lg mx-auto">
                  Swap tokens on Ethereum & Arbitrum without owning ETH.
                  We handle all the gas fees for you!
                </p>
                <div className="inline-flex p-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl">
                  <div className="bg-slate-900 rounded-lg px-1 py-1">
                    <ConnectButton />
                  </div>
                </div>

                {/* Features */}
                <div className="grid grid-cols-3 gap-4 mt-16 max-w-2xl mx-auto">
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                    <div className="text-3xl mb-3">💱</div>
                    <h3 className="font-bold text-white mb-1">Best Rates</h3>
                    <p className="text-xs text-gray-400">Optimized routing</p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                    <div className="text-3xl mb-3">✨</div>
                    <h3 className="font-bold text-white mb-1">True Gasless</h3>
                    <p className="text-xs text-gray-400">No ETH needed</p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                    <div className="text-3xl mb-3">🛡️</div>
                    <h3 className="font-bold text-white mb-1">MEV Protected</h3>
                    <p className="text-xs text-gray-400">Safe execution</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-white">Swap Tokens</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSwapMode('gasless')}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                          swapMode === 'gasless'
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                            : 'bg-white/10 text-gray-400 hover:bg-white/20'
                        }`}
                        title="Gasless swap through Expand"
                      >
                        Gasless
                      </button>
                      <button
                        onClick={() => setSwapMode('direct')}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                          swapMode === 'direct'
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                            : 'bg-white/10 text-gray-400 hover:bg-white/20'
                        }`}
                        title="Direct swap through Uniswap V3"
                      >
                        Direct
                      </button>
                      <button
                        onClick={() => setSwapMode('relayer')}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                          swapMode === 'relayer'
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                            : 'bg-white/10 text-gray-400 hover:bg-white/20'
                        }`}
                        title="Swap USDC to ETH via relayer (0.5% fee)"
                      >
                        Relayer
                      </button>
                    </div>
                    <div className="flex gap-2">
                      {Object.entries(swapChains).map(([chainId, chain]) => (
                        <button
                          key={chainId}
                          onClick={async () => {
                            try {
                              const ethereum = (window as any).ethereum;
                              if (ethereum) {
                                await ethereum.request({
                                  method: 'wallet_switchEthereumChain',
                                  params: [{ chainId: `0x${chain.chain.id.toString(16)}` }],
                                }).catch(async (switchError: any) => {
                                  if (switchError.code === 4902) {
                                    await ethereum.request({
                                      method: 'wallet_addEthereumChain',
                                      params: [{
                                        chainId: `0x${chain.chain.id.toString(16)}`,
                                        chainName: chain.name,
                                        rpcUrls: [chain.chain.rpcUrls.default.http[0]],
                                        nativeCurrency: chain.chain.nativeCurrency,
                                        blockExplorerUrls: [chain.chain.blockExplorers?.default.url],
                                      }],
                                    });
                                  } else {
                                    throw switchError;
                                  }
                                });
                              }

                              setSelectedChain(chainId as SwapSupportedChain);
                              setAmount('');
                              setNeedsApproval(false);
                              setCheckingApproval(false);
                              
                              if (address && isConnected) {
                                checkETHBalance();
                              }
                            } catch (error: any) {
                              console.error('Failed to switch network:', error);
                              toast.error(error.message || 'Failed to switch network');
                            }
                          }}
                          className={`px-4 py-2 rounded-xl transition-all font-semibold flex items-center gap-2 ${
                            selectedChain === chainId
                              ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                              : 'bg-white/10 hover:bg-white/20 text-gray-300'
                          }`}
                        >
                          <span>{chain.icon}</span>
                          <span>{chain.name}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded-full border border-green-500/50">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="text-xs text-green-400 font-medium">Gasless Active</span>
                    </div>
                  </div>
                </div>

                {/* From Token */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    From
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={fromToken}
                        onChange={(e) => setFromToken(e.target.value as Token)}
                        className="w-full appearance-none px-4 py-4 pl-10 bg-white/10 rounded-xl border border-white/20 focus:border-purple-500 focus:outline-none text-white backdrop-blur-sm"
                      >
                        {Object.entries(getSupportedTokens(selectedChain)).map(([token, details]: [string, TokenConfig]) => (
                          <option key={token} value={token} className="bg-slate-900">
                            {details.icon} {token}
                          </option>
                        ))}
                      </select>
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        {getSupportedTokens(selectedChain)[fromToken].icon}
                      </div>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        ▼
                      </div>
                    </div>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.0"
                      className="flex-[2] px-4 py-4 bg-white/10 rounded-xl border border-white/20 focus:border-purple-500 focus:outline-none text-white text-lg backdrop-blur-sm"
                    />
                  </div>
                </div>

                {/* Swap Direction */}
                <div className="flex justify-center my-4">
                  <button
                    onClick={() => {
                      const temp = fromToken;
                      setFromToken(toToken);
                      setToToken(temp);
                    }}
                    className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                  >
                    ↓
                  </button>
                </div>

                {/* To Token */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    To
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={toToken}
                        onChange={(e) => setToToken(e.target.value as Token)}
                        className="w-full appearance-none px-4 py-4 pl-10 bg-white/10 rounded-xl border border-white/20 focus:border-purple-500 focus:outline-none text-white backdrop-blur-sm"
                      >
                        {Object.entries(getSupportedTokens(selectedChain)).map(([token, details]: [string, TokenConfig]) => (
                          <option key={token} value={token} className="bg-slate-900">
                            {details.icon} {token}
                          </option>
                        ))}
                      </select>
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        {getSupportedTokens(selectedChain)[toToken].icon}
                      </div>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        ▼
                      </div>
                    </div>
                    <input
                      type="text"
                      value={formatUnits(BigInt(expectedOutput || '0'), getSupportedTokens(selectedChain)[toToken].decimals)}
                      readOnly
                      className="flex-[2] px-4 py-4 bg-white/10 rounded-xl border border-white/20 text-white text-lg backdrop-blur-sm"
                    />
                  </div>
                </div>

                {/* Pool and Price Info */}
                <div className="mt-2 space-y-1">
                  {/* Price Impact */}
                  {amount && expectedOutput !== '0' && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400">Price Impact:</span>
                      <span className={`font-medium ${
                        Number(priceImpact || 0) > 5 
                          ? 'text-red-400' 
                          : Number(priceImpact || 0) > 2 
                          ? 'text-yellow-400' 
                          : 'text-green-400'
                      }`}>
                        {Number(priceImpact || 0).toFixed(2)}%
                      </span>
                    </div>
                  )}
                  
                  {/* Pool Info */}
                  {poolData && (
                    <>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Pool Fee:</span>
                        <span className="text-white font-medium">
                          {(Number(poolData.fee) / 10000).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Pool Liquidity:</span>
                        <span className="text-white font-medium">
                          ${formatUnits(BigInt(poolData.liquidity), 6)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Pool Address:</span>
                        <a 
                          href={`${swapChains[selectedChain].chain.blockExplorers?.default.url}/address/${poolData.pool}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 font-mono text-xs"
                        >
                          {poolData.pool.slice(0, 6)}...{poolData.pool.slice(-4)}
                        </a>
                      </div>
                    </>
                  )}
                </div>

                {/* Approval History */}
                {approvalHistory && approvalHistory.approvals.length > 0 && (
                  <div className="mt-6">
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                      <h4 className="text-sm font-semibold text-white mb-2">Recent Approvals</h4>
                      <div className="space-y-2">
                        {approvalHistory.approvals.slice(0, 3).map((approval, i) => (
                          <div key={i} className="text-xs text-gray-300">
                            <div className="flex justify-between">
                              <span>Approved {formatUnits(BigInt(approval.amount), getSupportedTokens(selectedChain)[fromToken].decimals)} {fromToken}</span>
                              <span className="text-gray-400">
                                {new Date(parseInt(approval.timestamp) * 1000).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="text-gray-400 font-mono">
                              Spender: {approval.spender.slice(0, 6)}...{approval.spender.slice(-4)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Swap Button */}
                <button
                  onClick={needsApproval ? approveToken : (
                    swapMode === 'direct' ? handleDirectSwap :
                    swapMode === 'relayer' ? handleRelayerSwap :
                    handleGaslessSwap
                  )}
                  disabled={loading || !amount || checkingApproval || !isConnected}
                  className="w-full mt-6 py-5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400 rounded-xl font-bold text-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg disabled:shadow-none"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-3">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {needsApproval ? 'Approving...' : 'Processing Swap...'}
                    </span>
                  ) : checkingApproval ? (
                    'Checking Approval...'
                  ) : !isConnected ? (
                    'Connect Wallet'
                  ) : !amount ? (
                    'Enter Amount'
                  ) : needsApproval ? (
                    <span className="flex items-center justify-center gap-2">
                      <span>Approve {fromToken}</span>
                      <span className="px-2 py-1 bg-white/20 rounded-lg text-sm">One-time Setup</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <span>Swap {amount} {fromToken}</span>
                      <span className="px-2 py-1 bg-white/20 rounded-lg text-sm">No ETH Required</span>
                    </span>
                  )}
                </button>

                {/* Info Box */}
                <div className="mt-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-white/10">
                  <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                    <span className="text-lg">✨</span>
                    How Gasless Swaps Work
                  </h4>
                  <ol className="text-xs text-gray-300 space-y-1">
                    <li>1️⃣ Select tokens and amount</li>
                    <li>2️⃣ Sign message to approve swap (free)</li>
                    <li>3️⃣ Our relayers execute the swap</li>
                    <li>4️⃣ Small fee taken from output token</li>
                  </ol>
                  <p className="text-xs text-green-400 mt-2 font-semibold">
                    No ETH needed - we cover all gas fees! 🎉
                  </p>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mt-8">
              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 backdrop-blur-md rounded-xl p-5 border border-green-500/20">
                <p className="text-3xl font-bold text-green-400">$0</p>
                <p className="text-xs text-gray-300 mt-1">ETH Required</p>
              </div>
              <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 backdrop-blur-md rounded-xl p-5 border border-blue-500/20">
                <p className="text-3xl font-bold text-blue-400">0.5%</p>
                <p className="text-xs text-gray-300 mt-1">Max Slippage</p>
              </div>
              <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 backdrop-blur-md rounded-xl p-5 border border-purple-500/20">
                <p className="text-3xl font-bold text-purple-400">~15s</p>
                <p className="text-xs text-gray-300 mt-1">Swap Speed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </main>
  );
}
