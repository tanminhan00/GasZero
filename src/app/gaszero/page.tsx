'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits, formatUnits, encodeFunctionData, createPublicClient, createWalletClient, custom, http, parseEther, formatEther } from 'viem';
import { baseSepolia, arbitrumSepolia, sepolia } from 'viem/chains';
import toast, { Toaster } from 'react-hot-toast';
import relayerAddresses from '@/config/relayers.json';

type Chain = 'eth-sepolia' | 'arb-sepolia' | 'base-sepolia';
type Token = 'USDC' | 'USDT';

const TOKEN_ADDRESSES = {
  'eth-sepolia': {
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Ethereum Sepolia
    USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // USDT on Ethereum Sepolia
  },
  'arb-sepolia': {
    USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    USDT: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  },
  'base-sepolia': {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    USDT: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
};

interface GasZeroProps {
  embedded?: boolean;
  selectedChain?: Chain;
  onChainChange?: (chain: Chain) => void;
}

export default function GasZeroApp({
  embedded = false,
  selectedChain: externalSelectedChain,
  onChainChange
}: GasZeroProps) {
  const [internalSelectedChain, setInternalSelectedChain] = useState<Chain>('base-sepolia');

  // Use external chain if provided (embedded mode), otherwise use internal state
  const selectedChain = externalSelectedChain || internalSelectedChain;
  const setSelectedChain = onChainChange || setInternalSelectedChain;
  const [selectedToken, setSelectedToken] = useState<Token>('USDC');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [userETHBalance, setUserETHBalance] = useState('0');
  const [autoApprovingEnabled, setAutoApprovingEnabled] = useState(true);
  const [isFundingInProgress, setIsFundingInProgress] = useState(false);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Chain configurations
  const chains = {
    'eth-sepolia': {
      name: 'Ethereum Sepolia',
      color: 'from-purple-500 to-blue-500',
      icon: '♦️',
      logo: '/eth.png',
      tokens: ['USDC', 'USDT'],
      chain: sepolia,
      relayer: relayerAddresses.relayerAddresses['eth-sepolia'],
    },
    'arb-sepolia': {
      name: 'Arbitrum Sepolia',
      color: 'from-blue-500 to-cyan-500',
      icon: '⚡',
      logo: '/ARB.jpg',
      tokens: ['USDC', 'USDT'],
      chain: arbitrumSepolia,
      relayer: relayerAddresses.relayerAddresses['arb-sepolia'],
    },
    'base-sepolia': {
      name: 'Base Sepolia',
      color: 'from-blue-600 to-indigo-600',
      icon: '🔷',
      logo: '/base.png',
      tokens: ['USDC', 'USDT'],
      chain: baseSepolia,
      relayer: relayerAddresses.relayerAddresses['base-sepolia'],
    },
  };

  // Check ETH balance
  useEffect(() => {
    if (address) {
      checkETHBalance();
    }
  }, [address, selectedChain]);

  async function checkETHBalance() {
    if (!address) return;

    const chainConfig = chains[selectedChain];
    const publicClient = createPublicClient({
      chain: chainConfig.chain,
      transport: http(),
    });

    const balance = await publicClient.getBalance({ address });
    setUserETHBalance(formatEther(balance));
  }

  // Check approval when amount or chain changes
  useEffect(() => {
    if (address && amount && parseFloat(amount) > 0) {
      checkApproval();
    }
  }, [amount, selectedChain, selectedToken, address]);

  async function checkApproval() {
    if (!address || !amount) return;

    setCheckingApproval(true);
    try {
      const chainConfig = chains[selectedChain];
      const tokenAddress = TOKEN_ADDRESSES[selectedChain][selectedToken];
      const relayerAddress = chainConfig.relayer;

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
        args: [address, relayerAddress as `0x${string}`],
      });

      const amountNeeded = parseUnits(amount, 6);
      setNeedsApproval((allowance as bigint) < amountNeeded);
    } catch (error) {
      console.error('Error checking approval:', error);
    } finally {
      setCheckingApproval(false);
    }
  }

  // New combined function: Fund and approve in one flow
  async function requestETHFundingAndApprove() {
    console.log('[GASZERO] Starting combined funding + approval flow');

    const fundingToastId = toast.loading('🎁 Step 1: Getting ETH for gas...');

    try {
      // Step 1: Fund the user
      const funded = await requestETHFunding(fundingToastId);

      if (!funded) {
        toast.error('Failed to get funding', { id: fundingToastId });
        return false;
      }

      // Step 2: Update balance and continue with approval
      toast.loading('✍️ Step 2: Please sign the approval...', { id: fundingToastId });

      // Small delay to ensure balance is updated
      await new Promise(resolve => setTimeout(resolve, 2000));
      await checkETHBalance();

      // Continue with approval (skip funding check since we just funded)
      await approveToken(false, true);

      return true;

    } catch (error) {
      console.error('[GASZERO] Combined flow error:', error);
      toast.error('Process failed. Please try again.', { id: fundingToastId });
      return false;
    }
  }

  // Request ETH funding from relayer
  async function requestETHFunding(existingToastId?: any) {
    // Prevent duplicate requests
    if (isFundingInProgress) {
      console.log('[GASZERO] Funding already in progress, skipping...');
      return false;
    }

    setIsFundingInProgress(true);
    const toastId = existingToastId || toast.loading('🎁 Requesting ETH for gas-free approval...');

    try {
      const response = await fetch('/api/fund-user-eth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          reason: 'approval_needed',
          chain: selectedChain, // Pass the selected chain
        }),
      });

      // Check for rate limiting
      if (!response.ok) {
        const errorData = await response.json();

        // If rate limited, check if user already has ETH
        if (response.status === 429) {
          console.log('[GASZERO] Rate limited, checking if user already has ETH...');
          await checkETHBalance();
          const currentBalance = parseEther(userETHBalance);

          if (currentBalance >= parseEther('0.0001')) {
            console.log('[GASZERO] User already has sufficient ETH!');
            toast.success('✅ You already have ETH for approval!', { id: toastId });
            return true; // User has enough ETH, proceed
          }
        }

        toast.error(errorData.error || 'Failed to get ETH funding', { id: toastId });
        return false;
      }

      const result = await response.json();

      if (result.success) {
        toast.success(
          <div>
            <p className="font-bold">💰 ETH funding received!</p>
            <p className="text-sm">Amount: {result.amount} ETH</p>
            <p className="text-xs">Gas Price: {result.gasPrice}</p>
            <p className="text-xs mt-1">Now approving...</p>
          </div>,
          { id: toastId, duration: 5000 }
        );

        // Don't auto-approve here if called from combined flow
        if (!existingToastId) {
          // Only auto-approve if this was called standalone
          await new Promise(resolve => setTimeout(resolve, 2000));
          await checkETHBalance();

          if (autoApprovingEnabled) {
            await approveToken(true, true);
          }
        }

        return true;
      } else {
        toast.error(result.error || 'Failed to get ETH funding', { id: toastId });
        return false;
      }
    } catch (error: any) {
      console.error('Funding error:', error);
      toast.error('Failed to request ETH funding', { id: toastId });
      return false;
    } finally {
      setIsFundingInProgress(false);
    }
  }

  async function approveToken(isAutoApprove = false, skipFundingCheck = false) {
    if (!address || !amount) return;

    // Check if user has enough ETH first (unless we just funded them)
    if (!skipFundingCheck) {
      const ethBalance = parseEther(userETHBalance);
      if (ethBalance < parseEther('0.0001')) {
        // Request ETH funding AND continue with approval
        toast('Getting ETH for approval, then you\'ll sign...', {
          icon: '🚀',
          duration: 4000,
        });

        // Fund and continue with approval in one flow
        const funded = await requestETHFundingAndApprove();
        if (!funded) {
          toast.error('Failed to get funding. Please try again.');
        }
        return;
      }
    }

    const toastId = toast.loading(
      isAutoApprove
        ? '✨ Auto-approving with funded ETH...'
        : 'Please approve in your wallet...'
    );

    try {
      const chainConfig = chains[selectedChain];
      const tokenAddress = TOKEN_ADDRESSES[selectedChain][selectedToken];
      const relayerAddress = chainConfig.relayer;

      // Ensure MetaMask is available
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        throw new Error('No wallet detected. Please install MetaMask.');
      }

      // Switch to correct network if needed
      const ethereum = (window as any).ethereum;
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chainConfig.chain.id.toString(16)}` }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          // Network not added, add it
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
        } else if (switchError.code === 4001) {
          // User rejected the switch
          toast.error('Please switch to the correct network', { id: toastId });
          return;
        }
      }

      const walletClient = createWalletClient({
        account: address,
        chain: chainConfig.chain,
        transport: custom((window as any).ethereum),
      });

      const amountToApprove = parseUnits('1000000', 6); // Approve 1M tokens

      console.log('Approval details:', {
        tokenAddress,
        spender: relayerAddress,
        amount: amountToApprove.toString(),
        userAddress: address,
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
        args: [relayerAddress as `0x${string}`, amountToApprove]
      });

      toast.loading('Check MetaMask for approval request...', { id: toastId });

      const hash = await walletClient.sendTransaction({
        to: tokenAddress as `0x${string}`,
        data: approveData,
        gas: 100000n, // Explicit gas limit
      });

      toast.loading('Waiting for confirmation...', { id: toastId });

      const publicClient = createPublicClient({
        chain: chainConfig.chain,
        transport: http(),
      });

      await publicClient.waitForTransactionReceipt({ hash });

      toast.success(
        isAutoApprove
          ? '🎉 Auto-approval complete! Truly gasless!'
          : 'Approval successful!',
        { id: toastId }
      );
      setNeedsApproval(false);

    } catch (error: any) {
      console.error('Approval error:', error);
      toast.error(error.message || 'Approval failed', { id: toastId });
    }
  }

  async function executeGaslessTransaction() {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!recipientAddress || !amount) {
      toast.error('Please fill in all fields');
      return;
    }

    if (!recipientAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      toast.error('Invalid recipient address');
      return;
    }

    // Check approval and handle if needed
    if (needsApproval) {
      const ethBalance = parseEther(userETHBalance);
      if (ethBalance < parseEther('0.0001')) {
        // Automatically request ETH and approve
        await requestETHFunding();
        return;
      } else {
        toast.error('Please approve the token first');
        return;
      }
    }

    setLoading(true);
    const toastId = toast.loading('🚀 Preparing gasless transaction...');

    try {
      const intent = {
        type: 'transfer',
        chain: selectedChain,
        from: address,
        to: recipientAddress,
        token: selectedToken,
        amount,
        timestamp: Date.now(),
      };

      const message = JSON.stringify(intent);

      toast.loading('✍️ Please sign the message (FREE - no gas!)...', { id: toastId });
      const signature = await signMessageAsync({ message });

      toast.loading('⚡ Executing transaction gaslessly...', { id: toastId });

      const response = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'transfer', // Explicitly specify type
          chain: selectedChain,
          from: address,
          to: recipientAddress,
          token: selectedToken,
          amount,
          signature,
          intent,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(
          <div>
            <p className="font-bold">🎊 Transaction Successful!</p>
            <p className="text-sm">Truly gasless - No ETH used!</p>
            <p className="text-xs mt-1 opacity-75">Fee: {result.fee} {selectedToken}</p>
            <a
              href={result.explorer}
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
        setRecipientAddress('');
        checkApproval();
      } else {
        const errorMessage = result.error || 'Transaction failed';
        toast.error(errorMessage, { id: toastId });
      }
    } catch (error: any) {
      console.error('Transaction error:', error);
      toast.error(error.message || 'Transaction failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  const calculateFee = () => {
    if (!amount) return null;

    try {
      const amountBN = parseUnits(amount, 6);
      const fee = (amountBN * 50n) / 10000n;
      const minFee = parseUnits('0.5', 6);
      const finalFee = fee > minFee ? fee : minFee;
      return formatUnits(finalFee, 6);
    } catch {
      return null;
    }
  };

  const estimatedFee = calculateFee();
  const netAmount = amount && estimatedFee
    ? (parseFloat(amount) - parseFloat(estimatedFee)).toFixed(2)
    : null;

  return (
    <main className={embedded ? "" : "min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900"}>
      {!embedded && (
        <>
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
        </>
      )}

      <div className="relative z-10">
        {!embedded && (
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
                      GasZero
                    </h1>
                    <p className="text-xs text-gray-400">Truly gasless from day one</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {address && (
                    <div className="text-right">
                      <p className="text-xs text-gray-400">ETH Balance</p>
                      <p className="text-sm font-mono text-white">
                        {parseFloat(userETHBalance).toFixed(4)} ETH
                      </p>
                    </div>
                  )}
                  <ConnectButton />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">

            {!isConnected ? (
              embedded ? null : (
              <div className="text-center py-20">
                <div className="mb-8 relative inline-block">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-2xl opacity-30 animate-pulse"></div>
                  <h2 className="relative text-6xl font-bold text-white mb-2">
                    Never Buy ETH
                  </h2>
                  <h2 className="relative text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    For Gas Again
                  </h2>
                </div>
                <p className="text-xl text-gray-300 mb-12 max-w-lg mx-auto">
                  Send tokens on any chain without owning native tokens.
                  We handle everything - including approval gas!
                </p>
                <div className="inline-flex p-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl">
                  <div className="bg-slate-900 rounded-lg px-1 py-1">
                    <ConnectButton />
                  </div>
                </div>

                {/* Features */}
                <div className="grid grid-cols-3 gap-4 mt-16 max-w-2xl mx-auto">
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                    <div className="text-3xl mb-3">🎁</div>
                    <h3 className="font-bold text-white mb-1">Auto ETH Funding</h3>
                    <p className="text-xs text-gray-400">We fund your first approval</p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                    <div className="text-3xl mb-3">✨</div>
                    <h3 className="font-bold text-white mb-1">True Gasless</h3>
                    <p className="text-xs text-gray-400">No ETH purchase needed</p>
                  </div>
                  <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                    <div className="text-3xl mb-3">🚀</div>
                    <h3 className="font-bold text-white mb-1">Instant Setup</h3>
                    <p className="text-xs text-gray-400">Start sending in seconds</p>
                  </div>
                </div>
              </div>
              )
            ) : (
              <>
                {/* Chain Selector */}
                <div className="mb-8">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Select Chain
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(chains).map(([key, chain]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedChain(key as Chain)}
                        className={`relative p-6 rounded-2xl border-2 transition-all overflow-hidden group ${
                          selectedChain === key
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-white/10 hover:border-white/30 bg-white/5'
                        }`}
                      >
                        {selectedChain === key && (
                          <div className={`absolute inset-0 bg-gradient-to-br ${chain.color} opacity-10`}></div>
                        )}
                        <div className="relative flex flex-col items-center">
                          <img src={chain.logo} alt={chain.name} className="w-12 h-12 mb-2 rounded-full" />
                          <div className="font-bold text-white">{chain.name}</div>
                          <div className="text-xs text-gray-400 mt-1">Zero gas required</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transaction Form */}
                <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-white">Send Tokens</h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded-full border border-green-500/50">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="text-xs text-green-400 font-medium">Gasless Active</span>
                    </div>
                  </div>

                  {/* Token Selector */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Token
                    </label>
                    <div className="flex gap-2">
                      {['USDC', 'USDT'].map((token) => (
                        <button
                          key={token}
                          onClick={() => setSelectedToken(token as Token)}
                          className={`px-6 py-3 rounded-xl transition-all font-semibold ${
                            selectedToken === token
                              ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                              : 'bg-white/10 hover:bg-white/20 text-gray-300'
                          }`}
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Amount
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="100"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full px-4 py-4 bg-white/10 rounded-xl border border-white/20 focus:border-purple-500 focus:outline-none text-white text-lg backdrop-blur-sm"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                        {selectedToken}
                      </div>
                    </div>
                    {estimatedFee && (
                      <div className="mt-3 p-3 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Network Fee:</span>
                          <span className="text-white">{estimatedFee} {selectedToken}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-gray-400">You'll receive:</span>
                          <span className="text-green-400 font-semibold">{netAmount} {selectedToken}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recipient Input */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Recipient Address
                    </label>
                    <input
                      type="text"
                      placeholder="0x..."
                      value={recipientAddress}
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      className="w-full px-4 py-4 bg-white/10 rounded-xl border border-white/20 focus:border-purple-500 focus:outline-none font-mono text-sm text-white backdrop-blur-sm"
                    />
                  </div>

                  {/* Approval Status */}
                  {checkingApproval && (
                    <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                      <p className="text-sm text-yellow-400 flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Checking approval status...
                      </p>
                    </div>
                  )}

                  {needsApproval && !checkingApproval && amount && (
                    <div className="mb-4 p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl">
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">🎁</div>
                        <div className="flex-1">
                          <p className="text-sm text-yellow-400 font-semibold mb-1">
                            One-time Approval Needed
                          </p>
                          <p className="text-xs text-gray-300 mb-3">
                            {parseFloat(userETHBalance) < 0.0001
                              ? "No ETH? One click does it all: We fund → You sign → Done! 🚀"
                              : "You have ETH. Click to approve the relayer."}
                          </p>
                          <button
                            onClick={() => approveToken(false)}
                            className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 rounded-lg text-sm font-semibold text-white transition-all"
                          >
                            {parseFloat(userETHBalance) < 0.0001
                              ? '🎆 One-Click: Fund + Approve'
                              : `Approve ${selectedToken}`}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={executeGaslessTransaction}
                    disabled={loading || !amount || !recipientAddress}
                    className="w-full py-5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400 rounded-xl font-bold text-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg disabled:shadow-none"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-3">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Processing Gaslessly...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <span>Send {amount || '0'} {selectedToken}</span>
                        <span className="px-2 py-1 bg-white/20 rounded-lg text-sm">No ETH Required</span>
                      </span>
                    )}
                  </button>

                  {/* Info Box */}
                  <div className="mt-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-white/10">
                    <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                      <span className="text-lg">✨</span>
                      How Our True Gasless Works
                    </h4>
                    <ol className="text-xs text-gray-300 space-y-1">
                      <li>1️⃣ Need approval? We fund your ETH automatically</li>
                      <li>2️⃣ Sign a message (always free)</li>
                      <li>3️⃣ Our relayers execute on-chain</li>
                      <li>4️⃣ Fee taken from your {selectedToken} amount</li>
                    </ol>
                    <p className="text-xs text-green-400 mt-2 font-semibold">
                      Result: You never need to buy or own ETH! 🎉
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mt-8">
                  <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 backdrop-blur-md rounded-xl p-5 border border-green-500/20">
                    <p className="text-3xl font-bold text-green-400">$0</p>
                    <p className="text-xs text-gray-300 mt-1">ETH Required</p>
                  </div>
                  <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 backdrop-blur-md rounded-xl p-5 border border-blue-500/20">
                    <p className="text-3xl font-bold text-blue-400">0.5%</p>
                    <p className="text-xs text-gray-300 mt-1">Service Fee</p>
                  </div>
                  <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 backdrop-blur-md rounded-xl p-5 border border-purple-500/20">
                    <p className="text-3xl font-bold text-purple-400">~10s</p>
                    <p className="text-xs text-gray-300 mt-1">Transaction Speed</p>
                  </div>
                </div>
              </>
            )}
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
