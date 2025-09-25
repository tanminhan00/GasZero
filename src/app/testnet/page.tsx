'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits, formatUnits, createPublicClient, http } from 'viem';
import { arbitrumSepolia, baseSepolia } from 'viem/chains';
import toast, { Toaster } from 'react-hot-toast';

type Chain = 'arbitrum' | 'base';
type Token = 'USDC';

// Testnet configurations
const TESTNET_CONFIG = {
  arbitrum: {
    name: 'Arbitrum Sepolia',
    chain: arbitrumSepolia,
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    explorer: 'https://sepolia.arbiscan.io',
    icon: '🔵',
    color: 'blue',
  },
  base: {
    name: 'Base Sepolia',
    chain: baseSepolia,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    explorer: 'https://sepolia.basescan.org',
    icon: '🔷',
    color: 'indigo',
  },
};

export default function TestnetGasStation() {
  const [selectedChain, setSelectedChain] = useState<Chain>('arbitrum');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<string>('0');
  const [relayerStatus, setRelayerStatus] = useState<any>(null);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Check relayer status
  useEffect(() => {
    fetch('/api/relay')
      .then(r => r.json())
      .then(setRelayerStatus)
      .catch(console.error);
  }, []);

  // Check user's USDC balance
  useEffect(() => {
    if (address && selectedChain) {
      checkBalance();
    }
  }, [address, selectedChain]);

  async function checkBalance() {
    if (!address) return;

    const config = TESTNET_CONFIG[selectedChain];
    const client = createPublicClient({
      chain: config.chain,
      transport: http(),
    });

    try {
      const bal = await client.readContract({
        address: config.usdc as `0x${string}`,
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

      setBalance(formatUnits(bal as bigint, 6));
    } catch (error) {
      console.error('Error checking balance:', error);
      setBalance('0');
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

    if (parseFloat(balance) < parseFloat(amount)) {
      toast.error(`Insufficient USDC balance. You have ${balance} USDC`);
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Preparing gasless transaction...');

    try {
      // Create intent message
      const intent = {
        chain: selectedChain,
        from: address,
        to: recipientAddress,
        token: 'USDC',
        amount,
        timestamp: Date.now(),
        nonce: Math.floor(Math.random() * 1000000),
        deadline: Math.floor(Date.now() / 1000) + 300, // 5 min
      };

      const message = JSON.stringify(intent);

      // Sign the message (no gas!)
      toast.loading('Please sign the message (no gas needed!)...', { id: toastId });
      const signature = await signMessageAsync({ message });

      // Send to relayer
      toast.loading('Executing transaction without ETH! 🎉', { id: toastId });

      const response = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...intent,
          signature,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(
          <div>
            <p className="font-bold">🎉 Gasless Transaction Successful!</p>
            <p className="text-sm">Sent {result.netAmount} USDC</p>
            <p className="text-xs">Fee: {result.fee} USDC</p>
            <p className="text-xs font-bold text-green-600">No ETH was used!</p>
            <a
              href={result.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline mt-2 block"
            >
              View on Explorer →
            </a>
          </div>,
          { id: toastId, duration: 10000 }
        );

        // Refresh balance
        setTimeout(checkBalance, 2000);

        // Clear form
        setAmount('');
        setRecipientAddress('');
      } else {
        throw new Error(result.error || 'Transaction failed');
      }
    } catch (error: any) {
      console.error('Transaction error:', error);
      toast.error(error.message || 'Transaction failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  // Calculate fee
  const calculateFee = () => {
    if (!amount) return null;
    try {
      const amountBN = parseUnits(amount, 6);
      const fee = (amountBN * 50n) / 10000n; // 0.5%
      const minFee = parseUnits('0.5', 6);
      const finalFee = fee > minFee ? fee : minFee;
      return formatUnits(finalFee, 6);
    } catch {
      return null;
    }
  };

  const estimatedFee = calculateFee();

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="border-b border-purple-800/50 backdrop-blur-sm bg-black/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="text-3xl">⛽</div>
              <div>
                <h1 className="text-2xl font-bold text-white">GasZero Testnet</h1>
                <p className="text-xs text-purple-300">Gasless transactions on testnets</p>
              </div>
            </div>
            <ConnectButton />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">

          {/* Relayer Status */}
          {relayerStatus && (
            <div className="mb-6 p-4 bg-black/40 backdrop-blur-sm rounded-xl border border-purple-800/50">
              <h3 className="text-sm font-semibold text-purple-300 mb-2">Relayer Status</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-xs">
                  <span className="text-gray-400">Arbitrum:</span>
                  <span className={`ml-2 ${relayerStatus.relayers?.arbitrum > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {relayerStatus.relayers?.arbitrum || '0'} ETH
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-gray-400">Base:</span>
                  <span className={`ml-2 ${relayerStatus.relayers?.base > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {relayerStatus.relayers?.base || '0'} ETH
                  </span>
                </div>
              </div>
            </div>
          )}

          {!isConnected ? (
            <div className="text-center py-20">
              <h2 className="text-5xl font-bold text-white mb-4">
                Test Gasless Transactions
              </h2>
              <p className="text-xl text-purple-300 mb-8">
                Send USDC without ETH on testnets
              </p>
              <div className="inline-block">
                <ConnectButton />
              </div>
              <div className="mt-12 p-6 bg-black/40 backdrop-blur-sm rounded-xl border border-purple-800/50 max-w-md mx-auto">
                <h3 className="text-white font-bold mb-3">📝 Testnet Setup</h3>
                <ul className="text-left text-sm text-purple-300 space-y-2">
                  <li>1. Connect wallet to Arbitrum Sepolia or Base Sepolia</li>
                  <li>2. Get testnet USDC from faucet</li>
                  <li>3. Send USDC without needing any ETH!</li>
                </ul>
              </div>
            </div>
          ) : (
            <>
              {/* Balance Display */}
              <div className="mb-6 p-4 bg-gradient-to-r from-purple-900/50 to-blue-900/50 backdrop-blur-sm rounded-xl border border-purple-700/50">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-purple-300">Your USDC Balance</p>
                    <p className="text-2xl font-bold text-white">{balance} USDC</p>
                  </div>
                  <button
                    onClick={checkBalance}
                    className="px-3 py-1 bg-purple-800/50 hover:bg-purple-700/50 rounded-lg text-xs text-white transition-all"
                  >
                    Refresh
                  </button>
                </div>
                {parseFloat(balance) === 0 && (
                  <div className="mt-3 p-3 bg-yellow-900/30 rounded-lg border border-yellow-700/50">
                    <p className="text-xs text-yellow-300">
                      ⚠️ You need testnet USDC to test. Get some from a faucet or ask in our Discord.
                    </p>
                  </div>
                )}
              </div>

              {/* Chain Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-purple-300 mb-3">
                  Select Testnet Chain
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(TESTNET_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedChain(key as Chain)}
                      className={`p-4 rounded-xl border-2 transition-all backdrop-blur-sm ${
                        selectedChain === key
                          ? 'border-purple-500 bg-purple-900/50'
                          : 'border-purple-800/50 bg-black/40 hover:border-purple-700'
                      }`}
                    >
                      <div className="text-3xl mb-2">{config.icon}</div>
                      <div className="font-semibold text-white">{config.name}</div>
                      <div className="text-xs text-purple-400 mt-1">No ETH needed</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction Form */}
              <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-6 border border-purple-800/50">
                <h3 className="text-xl font-bold text-white mb-6">Send USDC (Gasless)</h3>

                {/* Amount Input */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-purple-300 mb-2">
                    Amount (USDC)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="10"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-3 bg-black/60 rounded-lg border border-purple-700/50 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500"
                  />
                  {estimatedFee && (
                    <p className="text-xs text-purple-400 mt-2">
                      Fee: {estimatedFee} USDC (0.5%, min $0.50)
                    </p>
                  )}
                </div>

                {/* Recipient Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-purple-300 mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    className="w-full px-4 py-3 bg-black/60 rounded-lg border border-purple-700/50 focus:border-purple-500 focus:outline-none text-white font-mono text-sm placeholder-gray-500"
                  />
                </div>

                {/* Warning for allowance */}
                <div className="mb-4 p-3 bg-blue-900/30 rounded-lg border border-blue-700/50">
                  <p className="text-xs text-blue-300">
                    💡 First time? You may need to approve USDC spending (requires a tiny bit of ETH for approval only).
                    After approval, all transfers are gasless!
                  </p>
                </div>

                {/* Submit Button */}
                <button
                  onClick={executeGaslessTransaction}
                  disabled={loading || !amount || !recipientAddress}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg font-bold text-lg text-white hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    `Send ${amount || '0'} USDC without ETH! 🚀`
                  )}
                </button>

                {/* Info */}
                <div className="mt-4 p-4 bg-purple-900/30 rounded-lg">
                  <p className="text-xs text-purple-300">
                    ⚡ <strong>How it works:</strong> Sign a message (free) → Our relayers pay gas →
                    Fee deducted from your USDC → Transaction complete without ETH!
                  </p>
                </div>
              </div>

              {/* Features */}
              <div className="grid grid-cols-3 gap-4 mt-8">
                <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-purple-800/50">
                  <p className="text-2xl mb-2">⛽</p>
                  <p className="text-xs text-purple-300">Zero ETH</p>
                </div>
                <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-purple-800/50">
                  <p className="text-2xl mb-2">💰</p>
                  <p className="text-xs text-purple-300">0.5% Fee</p>
                </div>
                <div className="bg-black/40 backdrop-blur-sm rounded-lg p-4 border border-purple-800/50">
                  <p className="text-2xl mb-2">⚡</p>
                  <p className="text-xs text-purple-300">Instant</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
