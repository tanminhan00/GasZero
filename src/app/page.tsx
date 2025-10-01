'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { sepolia, arbitrumSepolia, baseSepolia } from 'wagmi/chains';
import GasZeroApp from './gaszero/page';
import SwapPage from './swap/page';

type Tab = 'gaszero' | 'swap';
type AppChain = 'eth-sepolia' | 'arb-sepolia' | 'base-sepolia';

// Map app chain names to wagmi chain objects
const CHAIN_MAP = {
  'eth-sepolia': sepolia,
  'arb-sepolia': arbitrumSepolia,
  'base-sepolia': baseSepolia,
} as const;

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('gaszero');
  const [selectedChain, setSelectedChain] = useState<AppChain>('base-sepolia');
  const { isConnected, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();

  // Sync selected chain with connected wallet chain on mount
  useEffect(() => {
    if (connectedChain) {
      if (connectedChain.id === sepolia.id) {
        setSelectedChain('eth-sepolia');
      } else if (connectedChain.id === arbitrumSepolia.id) {
        setSelectedChain('arb-sepolia');
      } else if (connectedChain.id === baseSepolia.id) {
        setSelectedChain('base-sepolia');
      }
    }
  }, [connectedChain]);

  // Function to handle chain switching
  const handleChainChange = async (chain: AppChain) => {
    setSelectedChain(chain);

    // Actually switch the user's wallet network
    const targetChain = CHAIN_MAP[chain];
    if (switchChain && targetChain) {
      try {
        toast.loading(`Switching to ${targetChain.name}...`, { id: 'chain-switch' });
        await switchChain({ chainId: targetChain.id });
        toast.success(`Switched to ${targetChain.name}!`, { id: 'chain-switch', duration: 2000 });
      } catch (error: any) {
        console.error('Chain switch error:', error);
        if (error.message?.includes('rejected') || error.message?.includes('denied')) {
          toast.error('Chain switch rejected', { id: 'chain-switch' });
        } else {
          toast.error('Failed to switch chain', { id: 'chain-switch' });
        }
      }
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 relative overflow-hidden">
      <Toaster position="top-right" />
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Header with Connect Button and Tabs */}
      <div className="relative border-b border-purple-500/20 backdrop-blur-xl bg-black/30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-2xl shadow-lg shadow-purple-500/50 animate-pulse">
                ⚡
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  OneTap
                </h1>
                <p className="text-sm text-purple-300/80">Gasless Transactions Made Simple</p>
              </div>
            </div>
            <ConnectButton />
          </div>

          {/* Tab Navigation */}
          {isConnected && (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('gaszero')}
                className={`
                  px-6 py-3 rounded-xl font-semibold transition-all duration-300
                  ${activeTab === 'gaszero'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/50'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <span className="mr-2">💸</span>
                GasZero Transfer
              </button>
              <button
                onClick={() => setActiveTab('swap')}
                className={`
                  px-6 py-3 rounded-xl font-semibold transition-all duration-300
                  ${activeTab === 'swap'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <span className="mr-2">🔄</span>
                Gasless Swap
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="relative">
        {!isConnected ? (
          <div className="container mx-auto px-4 py-20">
            <div className="max-w-4xl mx-auto text-center">
              <div className="mb-8 relative inline-block">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full blur-3xl opacity-30 animate-pulse"></div>
                <div className="relative">
                  <h2 className="text-6xl md:text-7xl font-bold text-white mb-4">
                    Never Worry About
                  </h2>
                  <h2 className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Gas Fees Again
                  </h2>
                </div>
              </div>

              <p className="text-xl text-purple-300 mb-12 max-w-2xl mx-auto leading-relaxed">
                Execute transactions, transfer tokens, and swap assets across multiple chains without owning any native tokens. We handle all the gas fees for you.
              </p>

              <div className="inline-flex p-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl mb-16">
                <div className="bg-slate-950 rounded-xl px-2 py-2">
                  <ConnectButton />
                </div>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/40 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30 hover:scale-105 transition-transform">
                  <div className="text-5xl mb-4">💸</div>
                  <h3 className="text-xl font-bold text-white mb-2">Zero Gas Transfers</h3>
                  <p className="text-purple-300 text-sm">
                    Send USDC, USDT across Ethereum, Arbitrum, and Base without any ETH
                  </p>
                </div>

                <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 hover:scale-105 transition-transform">
                  <div className="text-5xl mb-4">🔄</div>
                  <h3 className="text-xl font-bold text-white mb-2">Gasless Swaps</h3>
                  <p className="text-purple-300 text-sm">
                    Swap USDC to ETH and vice versa without spending a cent on gas
                  </p>
                </div>

                <div className="bg-gradient-to-br from-pink-900/40 to-purple-900/40 backdrop-blur-sm rounded-2xl p-8 border border-pink-500/30 hover:scale-105 transition-transform">
                  <div className="text-5xl mb-4">🎁</div>
                  <h3 className="text-xl font-bold text-white mb-2">Auto-Funding</h3>
                  <p className="text-purple-300 text-sm">
                    We automatically fund approval gas for you. One click and you're done!
                  </p>
                </div>
              </div>

              {/* Supported Chains */}
              <div className="mt-16">
                <p className="text-sm text-purple-400 mb-4 uppercase tracking-wide">Supported Networks</p>
                <div className="flex justify-center gap-6 flex-wrap">
                  <div className="px-6 py-3 bg-purple-900/30 rounded-xl border border-purple-500/30 backdrop-blur-sm">
                    <span className="text-white font-semibold">♦️ Ethereum Sepolia</span>
                  </div>
                  <div className="px-6 py-3 bg-blue-900/30 rounded-xl border border-blue-500/30 backdrop-blur-sm">
                    <span className="text-white font-semibold">⚡ Arbitrum Sepolia</span>
                  </div>
                  <div className="px-6 py-3 bg-indigo-900/30 rounded-xl border border-indigo-500/30 backdrop-blur-sm">
                    <span className="text-white font-semibold">🔷 Base Sepolia</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="transition-all duration-300">
            {activeTab === 'gaszero' && (
              <GasZeroApp
                embedded
                selectedChain={selectedChain}
                onChainChange={handleChainChange}
              />
            )}
            {activeTab === 'swap' && (
              <SwapPage
                embedded
                selectedChain={selectedChain === 'base-sepolia' ? 'eth-sepolia' : selectedChain}
                onChainChange={(chain) => handleChainChange(chain as AppChain)}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative border-t border-purple-500/20 backdrop-blur-xl bg-black/30 mt-20">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center text-purple-400 text-sm">
            <p>OneTap • Gasless Transactions • Built with ❤️</p>
          </div>
        </div>
      </div>
    </main>
  );
}
