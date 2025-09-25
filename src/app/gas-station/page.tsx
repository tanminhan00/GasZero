'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { executeGaslessTransactionV2, getAllBalances, calculateFee, type SupportedChain } from '@/lib/gasless-v2';
import { parseUnits, formatUnits } from 'viem';
import toast, { Toaster } from 'react-hot-toast';

export default function GasStation() {
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [fromChain, setFromChain] = useState<SupportedChain>('polygon');
  const [toChain, setToChain] = useState<SupportedChain>('arbitrum');
  const [balances, setBalances] = useState<Record<SupportedChain, string>>({
    base: '0',
    polygon: '0',
    arbitrum: '0',
    optimism: '0',
  });
  const [estimatedFee, setEstimatedFee] = useState<string>('');
  const { address, isConnected } = useAccount();

  // Fetch balances across all chains
  useEffect(() => {
    if (address) {
      getAllBalances(address)
        .then(setBalances)
        .catch(console.error);
    }
  }, [address]);

  // Calculate fee when intent changes
  useEffect(() => {
    if (intent) {
      try {
        // Extract amount from intent
        const match = intent.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          const amount = parseUnits(match[1], 6);
          const { fee, netAmount, feePercent } = calculateFee(amount, fromChain, toChain);
          setEstimatedFee(`Fee: ${formatUnits(fee, 6)} USDC (${feePercent})`);
        }
      } catch (error) {
        setEstimatedFee('');
      }
    }
  }, [intent, fromChain, toChain]);

  async function handleExecute() {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Processing your gasless transaction...');

    try {
      const hash = await executeGaslessTransactionV2(
        intent,
        address,
        fromChain,
        toChain !== fromChain ? toChain : undefined
      );

      toast.success(
        <div>
          <p>Transaction successful! (No ETH used!)</p>
          <a
            href={`https://layerzeroscan.com/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View on Explorer
          </a>
        </div>,
        { id: toastId, duration: 5000 }
      );

      setIntent('');
      // Refresh balances
      if (address) {
        getAllBalances(address).then(setBalances);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Transaction failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  // Calculate total stuck value
  const totalStuckValue = Object.entries(balances).reduce((total, [chain, balance]) => {
    // Check if user has tokens but no native gas token
    // For demo, assuming they have no native tokens
    return total + parseFloat(balance);
  }, 0);

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50 to-blue-50">
      <Toaster position="top-right" />

      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              ⛽ OneTap Gas Station
            </h1>
            <p className="text-2xl text-gray-700 font-semibold">
              Never Buy ETH for Gas Again
            </p>
            <p className="text-lg text-gray-600 mt-2">
              Pay gas with USDC on any chain • Bridge without native tokens
            </p>
          </div>

          {/* Wallet Connection */}
          <div className="flex justify-center mb-8">
            <ConnectButton />
          </div>

          {isConnected && (
            <>
              {/* Balance Overview */}
              <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
                <h2 className="text-xl font-bold mb-4">Your Balances Across Chains</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(balances).map(([chain, balance]) => (
                    <div
                      key={chain}
                      className={`p-4 rounded-lg border-2 ${
                        parseFloat(balance) > 0 ? 'border-green-200 bg-green-50' : 'border-gray-200'
                      }`}
                    >
                      <p className="text-sm font-semibold capitalize">{chain}</p>
                      <p className="text-lg font-bold">{balance} USDC</p>
                      {parseFloat(balance) > 0 && (
                        <p className="text-xs text-orange-600">⚠️ No ETH</p>
                      )}
                    </div>
                  ))}
                </div>
                {totalStuckValue > 0 && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-semibold text-yellow-900">
                      💰 Total Stuck Value: ${totalStuckValue.toFixed(2)}
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      You can access all of this without buying ETH!
                    </p>
                  </div>
                )}
              </div>

              {/* Transaction Builder */}
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <h2 className="text-xl font-bold mb-6">Send Tokens Anywhere (No ETH Needed!)</h2>

                {/* Chain Selectors */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      From Chain
                    </label>
                    <select
                      value={fromChain}
                      onChange={(e) => setFromChain(e.target.value as SupportedChain)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="polygon">Polygon</option>
                      <option value="arbitrum">Arbitrum</option>
                      <option value="base">Base</option>
                      <option value="optimism">Optimism</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Balance: {balances[fromChain]} USDC
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      To Chain
                    </label>
                    <select
                      value={toChain}
                      onChange={(e) => setToChain(e.target.value as SupportedChain)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="arbitrum">Arbitrum</option>
                      <option value="polygon">Polygon</option>
                      <option value="base">Base</option>
                      <option value="optimism">Optimism</option>
                    </select>
                    {fromChain !== toChain && (
                      <p className="text-xs text-blue-600 mt-1">
                        🌉 Cross-chain transfer
                      </p>
                    )}
                  </div>
                </div>

                {/* Intent Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What do you want to do?
                  </label>
                  <input
                    type="text"
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder="send 10 USDC to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    disabled={loading}
                  />
                  {estimatedFee && (
                    <p className="mt-2 text-sm text-gray-600">{estimatedFee}</p>
                  )}
                </div>

                {/* Features */}
                <div className="grid grid-cols-3 gap-4 mb-6 text-center">
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-2xl mb-1">⛽</p>
                    <p className="text-xs font-semibold">No ETH Needed</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-2xl mb-1">🌉</p>
                    <p className="text-xs font-semibold">Cross-Chain</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl mb-1">💨</p>
                    <p className="text-xs font-semibold">Instant</p>
                  </div>
                </div>

                <button
                  onClick={handleExecute}
                  disabled={loading || !intent}
                  className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg"
                >
                  {loading ? 'Executing (No Gas!)...' : '🚀 Execute Gasless Transaction'}
                </button>

                {/* Info */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600">
                    <strong>How it works:</strong> Sign with your wallet → Our relayers execute →
                    Pay only a small USDC fee → No ETH/MATIC/AVAX needed ever!
                  </p>
                </div>
              </div>

              {/* Value Proposition */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-xl shadow">
                  <h3 className="font-bold text-lg mb-2">🎯 Before OneTap</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>❌ Buy ETH on exchange</li>
                    <li>❌ Wait for transfer</li>
                    <li>❌ Pay $5+ in gas</li>
                    <li>❌ Stuck tokens everywhere</li>
                  </ul>
                </div>
                <div className="bg-gradient-to-r from-purple-100 to-blue-100 p-6 rounded-xl shadow">
                  <h3 className="font-bold text-lg mb-2">⚡ With OneTap</h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>✅ Use tokens you have</li>
                    <li>✅ Instant execution</li>
                    <li>✅ Pay $0.50 fee</li>
                    <li>✅ Access all chains</li>
                  </ul>
                </div>
                <div className="bg-white p-6 rounded-xl shadow">
                  <h3 className="font-bold text-lg mb-2">💰 You Save</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>💵 $4.50 per transaction</li>
                    <li>⏱️ 30 minutes of time</li>
                    <li>🧠 Mental overhead</li>
                    <li>🎉 100% gas anxiety gone</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
