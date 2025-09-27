'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';

export default function Home() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Toaster position="top-right" />

      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            {/* Header */}
            <div className="mb-16">
              <div className="relative inline-block mb-8">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full blur-2xl opacity-30 animate-pulse"></div>
                <h1 className="relative text-7xl font-bold text-white mb-4">
                  OneTap
                </h1>
              </div>
              <p className="text-2xl text-gray-300 mb-6 max-w-2xl mx-auto">
                Swap and transfer tokens on Ethereum & Arbitrum with direct Uniswap integration or relayer services
              </p>
              <p className="text-lg text-gray-400">
                Choose your preferred method: Direct swaps or gasless transfers
              </p>
            </div>

            {/* Wallet Connection */}
            <div className="flex justify-center mb-12">
              <div className="inline-flex p-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl">
                <div className="bg-slate-900 rounded-lg px-1 py-1">
                  <ConnectButton />
                </div>
              </div>
            </div>

            {/* Action Cards */}
            <div className="grid md:grid-cols-2 gap-8 mb-16">
              {/* Swap Card */}
              <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10 hover:bg-white/10 transition-all group">
                <div className="text-6xl mb-6 group-hover:scale-110 transition-transform">💱</div>
                <h3 className="text-2xl font-bold text-white mb-4">Token Swaps</h3>
                <p className="text-gray-300 mb-6">
                  Swap tokens directly through Uniswap V3 or use our relayer service for USDC to ETH swaps
                </p>
                <button
                  onClick={() => router.push('/swap')}
                  className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-400 hover:to-purple-400 rounded-xl font-bold text-white transition-all shadow-lg"
                >
                  Start Swapping
                </button>
                <div className="mt-4 text-sm text-gray-400">
                  • Direct Uniswap V3 integration
                  • Relayer service available
                  • Best rates and low slippage
                </div>
              </div>

              {/* Transfer Card */}
              <div className="bg-white/5 backdrop-blur-md rounded-3xl p-8 border border-white/10 hover:bg-white/10 transition-all group">
                <div className="text-6xl mb-6 group-hover:scale-110 transition-transform">📤</div>
                <h3 className="text-2xl font-bold text-white mb-4">Token Transfers</h3>
                <p className="text-gray-300 mb-6">
                  Send tokens to any address using our relayer service without needing ETH for gas fees
                </p>
                <button
                  onClick={() => {
                    toast.success('Transfer functionality available via API. Check /api/relay endpoint for details.');
                  }}
                  className="w-full py-3 px-6 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-400 hover:to-teal-400 rounded-xl font-bold text-white transition-all shadow-lg"
                >
                  API Documentation
                </button>
                <div className="mt-4 text-sm text-gray-400">
                  • Gasless token transfers
                  • 0.5% relayer fee
                  • No ETH required
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                <div className="text-3xl mb-3">⚡</div>
                <h3 className="font-bold text-white mb-2">Fast Execution</h3>
                <p className="text-sm text-gray-400">Quick swaps and transfers</p>
              </div>
              <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                <div className="text-3xl mb-3">🔒</div>
                <h3 className="font-bold text-white mb-2">Secure</h3>
                <p className="text-sm text-gray-400">Non-custodial and safe</p>
              </div>
              <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
                <div className="text-3xl mb-3">💰</div>
                <h3 className="font-bold text-white mb-2">Low Fees</h3>
                <p className="text-sm text-gray-400">Competitive rates</p>
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