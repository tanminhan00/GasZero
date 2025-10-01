'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import toast, { Toaster } from 'react-hot-toast';

type Chain = 'eth-sepolia' | 'arb-sepolia' | 'base-sepolia';
type Token = 'USDC' | 'USDT' | 'ETH';

interface BridgePageProps {
    embedded?: boolean;
}

const chains = {
    'eth-sepolia': {
        name: 'Ethereum Sepolia',
        logo: '/eth.png',
        color: 'from-blue-500 to-cyan-500'
    },
    'arb-sepolia': {
        name: 'Arbitrum Sepolia',
        logo: '/ARB.jpg',
        color: 'from-purple-500 to-pink-500'
    },
    'base-sepolia': {
        name: 'Base Sepolia',
        logo: '/base.png',
        color: 'from-indigo-500 to-blue-500'
    }
};

const tokens: Token[] = ['USDC', 'USDT', 'ETH'];

export default function BridgePage({ embedded = false }: BridgePageProps) {
    const [fromChain, setFromChain] = useState<Chain>('eth-sepolia');
    const [toChain, setToChain] = useState<Chain>('arb-sepolia');
    const [selectedToken, setSelectedToken] = useState<Token>('USDC');
    const [amount, setAmount] = useState('');
    const [userIntent, setUserIntent] = useState('');

    const { address, isConnected } = useAccount();

    const handleSwapChains = () => {
        const temp = fromChain;
        setFromChain(toChain);
        setToChain(temp);
    };

    const handleBridge = () => {
        if (!amount || parseFloat(amount) === 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        const intent = `Bridge ${amount} ${selectedToken} from ${chains[fromChain].name} to ${chains[toChain].name}`;
        setUserIntent(intent);

        toast.success(
            <div>
                <p className="font-bold">🚧 Bridge Request Created</p>
                <p className="text-sm mt-1">{intent}</p>
                <p className="text-xs text-orange-400 mt-2">⚠️ Feature coming soon!</p>
            </div>,
            { duration: 5000 }
        );
    };

    return (
        <main className={`${embedded ? '' : 'min-h-screen'} bg-gradient-to-br from-slate-950 via-orange-950/30 to-slate-950 relative overflow-hidden`}>
            <Toaster position="top-right" />

            {/* Animated Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            {!embedded && (
                <div className="relative border-b border-orange-500/20 backdrop-blur-xl bg-black/30">
                    <div className="container mx-auto px-4 py-6">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center text-2xl shadow-lg shadow-orange-500/50">
                                    🌉
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-pink-400 bg-clip-text text-transparent">
                                        GasZero Bridge
                                    </h1>
                                    <p className="text-sm text-orange-300/80">Cross-chain transfers without gas</p>
                                </div>
                            </div>
                            <ConnectButton />
                        </div>
                    </div>
                </div>
            )}

            <div className="container mx-auto px-4 py-12">
                <div className="max-w-2xl mx-auto">
                    {/* WIP Banner */}
                    <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-orange-500/20 to-pink-500/20 border border-orange-500/30 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <div className="text-3xl">🚧</div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Work In Progress</h3>
                                <p className="text-sm text-orange-300">
                                    This feature is under development. UI for demonstration purposes only.
                                </p>
                            </div>
                        </div>
                    </div>

                    {!isConnected ? (
                        <div className="text-center py-20">
                            <div className="mb-8 inline-block p-8 rounded-full bg-gradient-to-br from-orange-500/20 to-pink-500/20 border border-orange-500/30">
                                <div className="text-6xl">🌉</div>
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-4">Connect Your Wallet</h2>
                            <p className="text-orange-300 mb-8">
                                Bridge tokens across chains without worrying about gas fees
                            </p>
                            <div className="inline-flex p-1 bg-gradient-to-r from-orange-500 to-pink-500 rounded-2xl">
                                <div className="bg-slate-950 rounded-xl px-2 py-2">
                                    <ConnectButton />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Natural Language Input */}
                            <div className="mb-6 p-6 rounded-3xl bg-gradient-to-br from-orange-900/30 to-pink-900/30 border border-orange-500/30 backdrop-blur-xl">
                                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <span>💬</span>
                                    What would you like to do?
                                </h3>
                                <div className="relative">
                                    <textarea
                                        value={userIntent}
                                        onChange={(e) => setUserIntent(e.target.value)}
                                        placeholder="e.g., 'Bridge 100 USDC from Ethereum to Arbitrum' or 'Send 50 USDT to Base'"
                                        className="w-full p-4 rounded-xl bg-black/40 border border-orange-500/30 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
                                        rows={3}
                                    />
                                    <div className="mt-2 text-xs text-orange-400">
                                        ✨ AI will parse your intent and create the bridge request
                                    </div>
                                </div>
                            </div>

                            {/* Or Manual Selection */}
                            <div className="mb-4 text-center">
                                <span className="px-4 py-2 bg-orange-500/10 text-orange-300 rounded-full text-sm">
                                    OR CONFIGURE MANUALLY
                                </span>
                            </div>

                            {/* Bridge Interface */}
                            <div className="p-6 rounded-3xl bg-gradient-to-br from-orange-900/50 to-pink-900/50 border border-orange-500/40 backdrop-blur-xl shadow-2xl shadow-orange-500/20">
                                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                                    <span>Bridge Tokens</span>
                                    <span className="text-sm font-normal px-3 py-1 rounded-full bg-orange-500/20 text-orange-300">GasZero 🌉</span>
                                </h3>

                                {/* From Chain */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-orange-300 mb-2">From Chain</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {Object.entries(chains).map(([key, chain]) => (
                                            <button
                                                key={key}
                                                onClick={() => setFromChain(key as Chain)}
                                                className={`p-3 rounded-xl border-2 transition-all ${
                                                    fromChain === key
                                                        ? 'border-orange-500 bg-orange-500/20'
                                                        : 'border-orange-500/30 hover:border-orange-500/50 bg-black/40'
                                                }`}
                                            >
                                                <img src={chain.logo} alt={chain.name} className="w-8 h-8 mx-auto mb-2 rounded-full" />
                                                <div className="text-xs text-white font-semibold text-center">{chain.name.split(' ')[0]}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Token & Amount */}
                                <div className="mb-4 p-4 rounded-2xl bg-black/40 border border-orange-500/30">
                                    <div className="flex justify-between items-center mb-3">
                                        <select
                                            value={selectedToken}
                                            onChange={(e) => setSelectedToken(e.target.value as Token)}
                                            className="bg-orange-500/20 text-white px-4 py-2 rounded-xl border border-orange-500/30 focus:outline-none focus:border-orange-500 font-semibold cursor-pointer"
                                        >
                                            {tokens.map(token => (
                                                <option key={token} value={token}>{token}</option>
                                            ))}
                                        </select>
                                        <div className="text-xs text-orange-400">Balance: 0.00</div>
                                    </div>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.0"
                                        className="w-full text-3xl font-bold bg-transparent border-none outline-none text-white placeholder-gray-600"
                                    />
                                </div>

                                {/* Swap Direction Button */}
                                <div className="flex justify-center -my-3 relative z-10">
                                    <button
                                        onClick={handleSwapChains}
                                        className="p-3 rounded-xl bg-gradient-to-br from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 border-4 border-slate-950 shadow-lg transition-all transform hover:scale-110 hover:rotate-180"
                                    >
                                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                        </svg>
                                    </button>
                                </div>

                                {/* To Chain */}
                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-orange-300 mb-2">To Chain</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {Object.entries(chains).map(([key, chain]) => (
                                            <button
                                                key={key}
                                                onClick={() => setToChain(key as Chain)}
                                                disabled={key === fromChain}
                                                className={`p-3 rounded-xl border-2 transition-all ${
                                                    toChain === key
                                                        ? 'border-orange-500 bg-orange-500/20'
                                                        : key === fromChain
                                                        ? 'border-gray-700 bg-gray-900/40 opacity-50 cursor-not-allowed'
                                                        : 'border-orange-500/30 hover:border-orange-500/50 bg-black/40'
                                                }`}
                                            >
                                                <img src={chain.logo} alt={chain.name} className="w-8 h-8 mx-auto mb-2 rounded-full" />
                                                <div className="text-xs text-white font-semibold text-center">{chain.name.split(' ')[0]}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Bridge Info */}
                                <div className="mb-6 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="text-orange-300">Estimated Time</span>
                                        <span className="text-white font-semibold">~5-10 minutes</span>
                                    </div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="text-orange-300">Bridge Fee</span>
                                        <span className="text-white font-semibold">0.1% + Gas</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-orange-300">You'll Receive</span>
                                        <span className="text-white font-semibold">{amount || '0'} {selectedToken}</span>
                                    </div>
                                </div>

                                {/* Bridge Button */}
                                <button
                                    onClick={handleBridge}
                                    disabled={!amount || parseFloat(amount) === 0}
                                    className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 text-white font-bold text-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-orange-500/50"
                                >
                                    🌉 Bridge Tokens (WIP)
                                </button>

                                {/* Info Note */}
                                <div className="mt-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                                    <p className="text-xs text-orange-200">
                                        🚧 <strong>Work in Progress:</strong> This feature is under development. The bridge will allow cross-chain transfers without requiring gas tokens on either chain!
                                    </p>
                                </div>
                            </div>

                            {/* Features Preview */}
                            <div className="mt-8 grid grid-cols-3 gap-3">
                                <div className="p-4 rounded-xl bg-gradient-to-br from-orange-900/40 to-pink-900/40 border border-orange-500/30 text-center">
                                    <div className="text-2xl mb-1">⚡</div>
                                    <div className="text-xs text-white font-bold">No Gas</div>
                                    <div className="text-xs text-orange-300">On either chain</div>
                                </div>
                                <div className="p-4 rounded-xl bg-gradient-to-br from-orange-900/40 to-pink-900/40 border border-orange-500/30 text-center">
                                    <div className="text-2xl mb-1">🔒</div>
                                    <div className="text-xs text-white font-bold">Secure</div>
                                    <div className="text-xs text-orange-300">Non-custodial</div>
                                </div>
                                <div className="p-4 rounded-xl bg-gradient-to-br from-orange-900/40 to-pink-900/40 border border-orange-500/30 text-center">
                                    <div className="text-2xl mb-1">⏱️</div>
                                    <div className="text-xs text-white font-bold">Fast</div>
                                    <div className="text-xs text-orange-300">5-10 minutes</div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}
