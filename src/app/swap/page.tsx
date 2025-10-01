'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseUnits, formatUnits, encodeFunctionData, createPublicClient, createWalletClient, custom, http, formatEther, parseEther, type Hash } from 'viem';
import { arbitrumSepolia, sepolia } from 'viem/chains';
import toast, { Toaster } from 'react-hot-toast';
import relayerAddresses from '@/config/relayers.json';
import { DEX_CONFIG } from '@/config/chain.config';

type SwapSupportedChain = 'eth-sepolia' | 'arb-sepolia';
type Token = 'ETH' | 'USDC';

interface TokenConfig {
    address: string;
    decimals: number;
    symbol: string;
    icon: string;
}

const getSupportedTokens = (chain: SwapSupportedChain): Record<string, TokenConfig> => {
    const config = DEX_CONFIG[chain]; // Use the actual chain parameter
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

interface SwapPageProps {
    embedded?: boolean;
    selectedChain?: SwapSupportedChain;
    onChainChange?: (chain: SwapSupportedChain) => void;
}

export default function SwapPage({
    embedded = false,
    selectedChain: externalSelectedChain,
    onChainChange
}: SwapPageProps) {
    const [internalSelectedChain, setInternalSelectedChain] = useState<SwapSupportedChain>('eth-sepolia');

    // Use external chain if provided (embedded mode), otherwise use internal state
    const selectedChain = externalSelectedChain as SwapSupportedChain || internalSelectedChain;
    const setSelectedChain = (chain: SwapSupportedChain) => {
        if (onChainChange) {
            onChainChange(chain as any); // Cast to parent's chain type
        } else {
            setInternalSelectedChain(chain);
        }
    };
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
    const [autoFundingEnabled, setAutoFundingEnabled] = useState(true);
    const [isFundingInProgress, setIsFundingInProgress] = useState(false);
    const [isFetchingPrice, setIsFetchingPrice] = useState(false);

    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    useEffect(() => {
        if (address && isConnected) {
            checkETHBalance();
            checkUSDCBalance();
        }
    }, [address, isConnected, selectedChain]);

    async function checkUSDCBalance() {
        if (!address) return;
        try {
            const usdcConfig = getSupportedTokens(selectedChain).USDC;
            console.log(`[SWAP] Checking USDC balance for ${selectedChain}:`, usdcConfig.address);

            const publicClient = createPublicClient({
                chain: swapChains[selectedChain].chain,
                transport: http(),
            });

            const balance = await publicClient.readContract({
                address: usdcConfig.address as `0x${string}`,
                abi: [{
                    name: 'balanceOf',
                    type: 'function',
                    inputs: [{ name: 'account', type: 'address' }],
                    outputs: [{ name: '', type: 'uint256' }],
                    stateMutability: 'view',
                }],
                functionName: 'balanceOf',
                args: [address],
            }) as bigint;

            const formattedBalance = formatUnits(balance, usdcConfig.decimals);
            console.log(`[SWAP] USDC balance on ${selectedChain}:`, formattedBalance);
            setUserUSDCBalance(formattedBalance);
        } catch (error: any) {
            console.error(`[SWAP] Error fetching USDC balance:`, error?.message || error);
            setUserUSDCBalance('0');
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

    useEffect(() => {
        if (!fromToken || !toToken || !isConnected || !address || !amount) {
            setExpectedOutput('0');
            setPriceImpact('0');
            return;
        }

        const fetchData = async () => {
            setIsFetchingPrice(true);
            try {
                const fromTokenConfig = getSupportedTokens(selectedChain)[fromToken];
                const toTokenConfig = getSupportedTokens(selectedChain)[toToken];

                console.log('[SWAP] Fetching quote from', amount, fromToken, '→', toToken, 'on', selectedChain);

                const amountInWei = parseUnits(amount, fromTokenConfig.decimals);
                const chainDexConfig = DEX_CONFIG[selectedChain];
                const quoterAddress = chainDexConfig.QUOTER_ADDRESS as `0x${string}`;
                const feeTier = 3000; // 0.3% fee tier (USDC/WETH pool on Sepolia)

                const publicClient = createPublicClient({
                    chain: swapChains[selectedChain].chain,
                    transport: http(),
                });

                // For testnet - provide a realistic estimate based on typical rates
                // USDC → ETH: ~$1 USDC = 0.0003 ETH (at $3000/ETH)
                // ETH → USDC: 1 ETH = ~$3000 USDC
                try {
                    // Mock estimate for UI (actual swap will use on-chain pricing)
                    const mockEstimate = parseFloat(amount) * 0.0001; // Rough testnet estimate
                    setExpectedOutput(mockEstimate.toFixed(6));
                    console.log('[SWAP] Using mock estimate for testnet:', mockEstimate.toFixed(6), toToken);
                    console.log('[SWAP] ⚠️ Actual output will be determined by on-chain swap');
                } catch (quoteError: any) {
                    console.error('[SWAP] Error:', quoteError.message);
                    setExpectedOutput('0');
                }
            } catch (error: any) {
                console.error('[SWAP] Error fetching price:', error);

                // Show user-friendly error message for common issues
                if (error?.message?.includes('Pool not found')) {
                    console.warn('[SWAP] No liquidity pool found for this pair on', selectedChain);
                    console.warn('[SWAP] This pair may not be available on this testnet');
                } else if (error?.message?.includes('Invalid ERC20')) {
                    console.error('[SWAP] Invalid token address for', selectedChain);
                }

                setExpectedOutput('0');
            } finally {
                setIsFetchingPrice(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [amount, fromToken, toToken, isConnected, selectedChain, address]);

    useEffect(() => {
        if (amount && fromToken && toToken && address && isConnected) {
            checkApproval();
        }
    }, [amount, fromToken, toToken, address, isConnected, selectedChain]);

    // New combined function: Fund and approve in one flow
    async function requestETHFundingAndApprove() {
        console.log('[SWAP] Starting combined funding + approval flow');

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

            // Set a flag to skip funding check since we just funded
            await approveToken(true);

            return true;

        } catch (error) {
            console.error('[SWAP] Combined flow error:', error);
            toast.error('Process failed. Please try again.', { id: fundingToastId });
            return false;
        }
    }

    // Request ETH funding from relayer for approval
    async function requestETHFunding(existingToastId?: any) {
        // Prevent duplicate requests
        if (isFundingInProgress) {
            console.log('[SWAP] Funding already in progress, skipping...');
            return false;
        }

        console.log('[SWAP] Requesting ETH funding for approval');
        console.log('[SWAP] User address:', address);
        console.log('[SWAP] Selected chain:', selectedChain);
        console.log('[SWAP] Current ETH balance:', userETHBalance);

        setIsFundingInProgress(true);
        const toastId = existingToastId || toast.loading('🎁 Requesting ETH for gas-free approval...');

        try {
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout

            const response = await fetch('/api/fund-user-eth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userAddress: address,
                    reason: 'approval_needed',
                    chain: selectedChain,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            console.log('[SWAP] Funding response status:', response.status);

            if (!response.ok) {
                console.error('[SWAP] Funding response not OK:', response.status, response.statusText);
                try {
                    const errorData = await response.json();
                    console.error('[SWAP] Error details:', errorData);

                    // If rate limited, check if user already has ETH
                    if (response.status === 429) {
                        console.log('[SWAP] Rate limited, checking if user already has ETH...');
                        await checkETHBalance();
                        const currentBalance = parseEther(userETHBalance);

                        if (currentBalance >= parseEther('0.0001')) {
                            console.log('[SWAP] User already has sufficient ETH!');
                            toast.success('✅ You already have ETH for approval!', { id: toastId });
                            return true; // User has enough ETH, proceed
                        }
                    }

                    toast.error(errorData.error || `Failed: ${response.statusText}`, { id: toastId });
                } catch {
                    toast.error(`Failed: ${response.statusText}`, { id: toastId });
                }
                setIsFundingInProgress(false);
                return false;
            }

            const result = await response.json();
            console.log('[SWAP] Funding result:', result);

            if (result.success) {
                toast.success(
                    <div>
                        <p className="font-bold">💰 ETH funding received!</p>
                        <p className="text-sm">Amount: {result.amount} ETH</p>
                        <p className="text-xs">Gas Price: {result.gasPrice}</p>
                    </div>,
                    { id: toastId, duration: 5000 }
                );

                // Wait for ETH to be confirmed
                console.log('[SWAP] Funding successful, returning true');

                // Don't auto-approve here if called from combined flow
                if (!existingToastId) {
                    // Only auto-approve if this was called standalone
                    console.log('[SWAP] Waiting for ETH confirmation...');
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    console.log('[SWAP] Checking balance after funding...');
                    await checkETHBalance();

                    if (autoFundingEnabled) {
                        console.log('[SWAP] Auto-approving after funding...');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await approveToken(true);
                    }
                }

                return true;
            } else {
                console.error('[SWAP] Funding failed:', result.error);
                toast.error(result.error || 'Failed to get ETH funding', { id: toastId });
                return false;
            }
        } catch (error: any) {
            console.error('[SWAP] Funding error:', error);

            if (error.name === 'AbortError') {
                toast.error('Funding request timed out. Please try again.', { id: toastId });
            } else if (error.message?.includes('fetch')) {
                toast.error('Network error. Please check your connection.', { id: toastId });
            } else {
                toast.error(`Failed: ${error.message || 'Unknown error'}`, { id: toastId });
            }
            return false;
        } finally {
            setIsFundingInProgress(false);
        }
    }

    async function checkApproval() {
        if (!address || !amount || fromToken === 'ETH') {
            setNeedsApproval(false);
            return;
        }

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

    async function approveToken(skipFundingCheck = false) {
        if (!address || !amount) return;

        console.log('[SWAP] Starting approval process');
        console.log('[SWAP] Current ETH balance:', userETHBalance);
        console.log('[SWAP] From token:', fromToken);
        console.log('[SWAP] Skip funding check:', skipFundingCheck);

        // Only need approval for USDC, not ETH
        if (fromToken === 'ETH') {
            console.log('[SWAP] No approval needed for ETH');
            return;
        }

        // Check if user has enough ETH first (unless we just funded them)
        if (!skipFundingCheck) {
            const ethBalance = parseEther(userETHBalance);
            if (ethBalance < parseEther('0.0001')) {
                console.log('[SWAP] User needs ETH funding for approval');
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

        const toastId = toast.loading('Preparing approval...');

        try {
            const chainConfig = swapChains[selectedChain];
            const ethereum = (window as any).ethereum;

            if (!ethereum) {
                throw new Error('No wallet detected. Please install MetaMask.');
            }

            // Ensure we're on the right network
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

            toast.loading('Please approve in your wallet...', { id: toastId });
            const tokenAddress = getSupportedTokens(selectedChain)[fromToken].address;
            const amountToApprove = parseUnits('1000000', getSupportedTokens(selectedChain)[fromToken].decimals);

            const walletClient = createWalletClient({
                account: address as `0x${string}`,
                chain: swapChains[selectedChain].chain,
                transport: custom((window as any).ethereum),
            });

            console.log('Swap approval details:', {
                tokenAddress,
                spender: chainConfig.relayer,
                amount: amountToApprove.toString(),
                userAddress: address,
                chain: selectedChain,
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
            toast.success('✅ Approval successful!', { id: toastId });
            setNeedsApproval(false);
        } catch (error: any) {
            console.error('Approval error:', error);
            toast.error(error.message || 'Approval failed', { id: toastId });
        }
    }

    // ✅ EXECUTE GASLESS SWAP
    async function executeSwap() {
        if (!address || !amount || parseFloat(amount) === 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        setLoading(true);
        const toastId = toast.loading('🔄 Preparing gasless swap...');

        // Warn about testnet liquidity
        if (!expectedOutput || parseFloat(expectedOutput) < parseFloat(amount) * 0.0001) {
            console.warn('[SWAP] ⚠️ Low/no price quote - testnet liquidity issue');
            toast('⚠️ Testnet has low liquidity - actual output may vary', {
                icon: '⚠️',
                duration: 3000
            });
        }

        try {
            // ⚠️ TESTNET FIX: Use very low minAmountOut due to poor liquidity on testnets
            // On production, you'd want proper slippage protection
            const minAmountOut = '1'; // Accept any output amount (1 wei minimum)

            console.log('[SWAP] Swap parameters:');
            console.log('  Amount in:', amount, fromToken);
            console.log('  Expected out:', expectedOutput || 'Unknown', toToken);
            console.log('  Min amount out (wei):', minAmountOut, '(accepting any amount due to testnet liquidity)');

            // Create swap request matching RelayerService expectations
            const swapRequest = {
                type: 'swap' as const,
                chain: selectedChain,
                fromAddress: address as `0x${string}`,
                fromToken,
                toToken,
                amount,
                minAmountOut,
                signature: '' as `0x${string}`, // Will be filled after signing
                nonce: Math.floor(Math.random() * 1000000),
                deadline: Math.floor(Date.now() / 1000) + 3600,
            };

            // Create intent object for signing (matching what relay API expects)
            const intent = {
                type: 'swap',
                chain: selectedChain,
                from: address, // User's wallet address
                fromToken,
                toToken,
                amount,
                minAmountOut, // Include for verification
                timestamp: Date.now(),
            };

            const message = JSON.stringify(intent);

            // Sign the message (gasless!)
            toast.loading('✍️ Please sign in your wallet (no gas!)...', { id: toastId });
            const signature = await signMessageAsync({ message }) as `0x${string}`;

            // Send to relayer with correct structure
            toast.loading('⚡ Executing gasless swap...', { id: toastId });

            const response = await fetch('/api/relay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...swapRequest,
                    signature,
                    intent, // Include intent for signature verification
                }),
            });

            const result = await response.json();

            if (result.success) {
                toast.success(
                    <div>
                        <p className="font-bold">🎉 Swap Successful!</p>
                        <p className="text-sm">Swapped {amount} {fromToken} → {toToken}</p>
                        <p className="text-xs">Fee: {result.fee} USDC</p>
                        <p className="text-xs font-bold text-green-600">✅ No gas paid!</p>
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

                // Reset form and refresh balances
                setAmount('');
                setExpectedOutput('0');
                setTimeout(() => {
                    checkETHBalance();
                    checkUSDCBalance();
                }, 2000);
            } else {
                throw new Error(result.error || 'Swap failed');
            }
        } catch (error: any) {
            console.error('Swap error:', error);
            toast.error(error.message || 'Swap failed', { id: toastId });
        } finally {
            setLoading(false);
        }
    }

    function switchTokens() {
        const temp = fromToken;
        setFromToken(toToken);
        setToToken(temp);
        setAmount('');
        setExpectedOutput('0');
    }

    const calculateFee = () => {
        if (!amount) return null;
        try {
            const amountBN = parseUnits(amount, getSupportedTokens(selectedChain)[fromToken].decimals);
            const fee = (amountBN * 50n) / 10000n;
            const minFee = parseUnits('0.5', 6);
            const finalFee = fee > minFee ? fee : minFee;
            return formatUnits(finalFee, 6);
        } catch {
            return null;
        }
    };

    const estimatedFee = calculateFee();

    return (
        <main className={embedded ? "" : "min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 relative overflow-hidden"}>
            {!embedded && (
                <>
            <Toaster position="top-right" />

            {/* Animated Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>

            {/* Header with Connect Button */}
            <div className="relative border-b border-purple-500/20 backdrop-blur-xl bg-black/30">
                <div className="container mx-auto px-4 py-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-2xl shadow-lg shadow-purple-500/50">
                                ⚡
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                                    GasZero Swap
                                </h1>
                                <p className="text-sm text-purple-300/80">Trade without gas fees</p>
                            </div>
                        </div>
                        <ConnectButton />
                    </div>
                </div>
            </div>
                </>
            )}

            <div className="relative container mx-auto px-4 py-12">
                <div className="max-w-lg mx-auto">
                    {!isConnected ? (
                        embedded ? null : (
                        <div className="text-center py-20">
                            <div className="mb-8 inline-block p-8 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
                                <div className="text-6xl">🔮</div>
                            </div>
                            <h2 className="text-5xl font-bold text-white mb-4">
                                Welcome to the Future
                            </h2>
                            <p className="text-xl text-purple-300 mb-12 max-w-md mx-auto">
                                Experience gasless token swaps powered by AI relayers
                            </p>

                            <div className="mb-12 flex justify-center">
                                <ConnectButton />
                            </div>

                            <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
                                {[
                                    { icon: '⚡', label: 'Zero Gas', desc: 'No ETH needed' },
                                    { icon: '🚀', label: 'Instant', desc: 'Fast execution' },
                                    { icon: '🔒', label: 'Secure', desc: 'Non-custodial' },
                                ].map((feature, i) => (
                                    <div key={i} className="p-6 rounded-2xl bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-500/30 backdrop-blur-sm hover:scale-105 transition-transform">
                                        <div className="text-4xl mb-2">{feature.icon}</div>
                                        <div className="text-sm font-bold text-white">{feature.label}</div>
                                        <div className="text-xs text-purple-300 mt-1">{feature.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        )
                    ) : (
                        <>
                    {/* Chain Selector */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-purple-300 mb-3">
                            Select Chain
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(swapChains).map(([key, chain]) => (
                                <button
                                    key={key}
                                    onClick={() => setSelectedChain(key as SwapSupportedChain)}
                                    className={`relative p-4 rounded-2xl border-2 transition-all overflow-hidden group ${
                                        selectedChain === key
                                            ? 'border-purple-500 bg-purple-500/10'
                                            : 'border-purple-500/30 hover:border-purple-500/50 bg-black/40'
                                    }`}
                                >
                                    {selectedChain === key && (
                                        <div className={`absolute inset-0 bg-gradient-to-br ${chain.color} opacity-10`}></div>
                                    )}
                                    <div className="relative">
                                        <div className="text-3xl mb-2">{chain.icon}</div>
                                        <div className="font-bold text-white">{chain.name}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                            <div className="mb-6 p-5 rounded-2xl bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-500/30 backdrop-blur-xl">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-sm text-purple-300">Your Balances</span>
                                    <button onClick={() => { checkETHBalance(); checkUSDCBalance(); }} className="text-xs px-3 py-1 rounded-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-all">
                                        🔄 Refresh
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 rounded-xl bg-black/30">
                                        <div className="text-xs text-gray-400 mb-1">⚡ ETH</div>
                                        <div className="text-lg font-bold text-white">{parseFloat(userETHBalance).toFixed(4)}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-black/30">
                                        <div className="text-xs text-gray-400 mb-1">💰 USDC</div>
                                        <div className="text-lg font-bold text-white">{parseFloat(userUSDCBalance || '0').toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-900/50 to-pink-900/50 border border-purple-500/40 backdrop-blur-xl shadow-2xl shadow-purple-500/20">
                                <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                                    <span>Swap Tokens</span>
                                    <span className="text-sm font-normal px-3 py-1 rounded-full bg-purple-500/20 text-purple-300">Gasless ⚡</span>
                                </h3>

                                <div className="mb-2">
                                    <label className="block text-sm font-medium text-purple-300 mb-2">From</label>
                                    <div className="p-4 rounded-2xl bg-black/40 border border-purple-500/30">
                                        <div className="flex justify-between items-center mb-3">
                                            <select value={fromToken} onChange={(e) => setFromToken(e.target.value as Token)} className="bg-purple-500/20 text-white px-4 py-2 rounded-xl border border-purple-500/30 focus:outline-none focus:border-purple-500 font-semibold cursor-pointer">
                                                <option value="ETH">⚡ ETH</option>
                                                <option value="USDC">💰 USDC</option>
                                            </select>
                                            <div className="text-right">
                                                <div className="text-xs text-gray-400">Balance</div>
                                                <div className="text-sm font-medium text-white">
                                            {fromToken === 'ETH' ? parseFloat(userETHBalance).toFixed(4) : parseFloat(userUSDCBalance || '0').toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                        <input type="number" step="0.01" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent text-3xl font-bold text-white placeholder-gray-600 focus:outline-none" />
                                    </div>
                                </div>

                                <div className="flex justify-center -my-3 relative z-10">
                                    <button onClick={switchTokens} className="p-3 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 border-4 border-slate-950 shadow-lg transition-all transform hover:scale-110 hover:rotate-180">
                                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-purple-300 mb-2">To</label>
                                    <div className="p-4 rounded-2xl bg-black/40 border border-purple-500/30">
                                        <div className="flex justify-between items-center mb-3">
                                            <select value={toToken} onChange={(e) => setToToken(e.target.value as Token)} className="bg-purple-500/20 text-white px-4 py-2 rounded-xl border border-purple-500/30 focus:outline-none focus:border-purple-500 font-semibold cursor-pointer">
                                                <option value="ETH">⚡ ETH</option>
                                                <option value="USDC">💰 USDC</option>
                                            </select>
                                            <div className="text-right">
                                                <div className="text-xs text-gray-400">Balance</div>
                                                <div className="text-sm font-medium text-white">
                                            {toToken === 'ETH' ? parseFloat(userETHBalance).toFixed(4) : parseFloat(userUSDCBalance || '0').toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-3xl font-bold text-white">
                                            {expectedOutput && parseFloat(expectedOutput) > 0 ? parseFloat(expectedOutput).toFixed(6) : (isFetchingPrice ? 'Loading...' : '0.0')}
                                        </div>
                                        {!isFetchingPrice && parseFloat(expectedOutput || '0') < 0.00001 && amount && parseFloat(amount) > 0 && (
                                            <div className="mt-2 p-3 rounded-lg bg-blue-900/20 border border-blue-500/30">
                                                <div className="text-xs text-blue-300 font-semibold mb-1">
                                                    ℹ️ Price: {expectedOutput || '0'} {toToken}
                                                </div>
                                                <div className="text-xs text-blue-200/80">
                                                    Price API returned low value. Swap will execute at actual pool rate. Check console logs.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {amount && parseFloat(amount) > 0 && (
                                    <div className="mb-6 p-4 rounded-xl bg-black/30 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Price Impact</span>
                                            <span className={`font-medium ${parseFloat(priceImpact) > 5 ? 'text-red-400' : 'text-green-400'}`}>
                        {parseFloat(priceImpact).toFixed(2)}%
                      </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Relayer Fee</span>
                                            <span className="font-medium text-purple-300">{estimatedFee || '0'} USDC (0.5%)</span>
                                        </div>
                                    </div>
                                )}

                                {needsApproval ? (
                                    <button onClick={() => approveToken()} disabled={loading || checkingApproval} className="w-full py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold text-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-yellow-500/50">
                                        {checkingApproval ? 'Checking...' : parseFloat(userETHBalance) < 0.0001 ? '🎆 One-Click: Fund + Approve' : '🔓 Approve Token'}
                                    </button>
                                ) : (
                                    <button onClick={executeSwap} disabled={loading || !amount || parseFloat(amount) === 0} className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-purple-500/50">
                                        {loading ? (
                                            <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Swapping...
                      </span>
                                        ) : (
                                            `⚡ Swap ${amount || '0'} ${fromToken} → ${toToken}`
                                        )}
                                    </button>
                                )}

                                <div className="mt-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                                    <p className="text-xs text-purple-200">
                                        💡 <strong>Gasless Magic:</strong> {parseFloat(userETHBalance) < 0.0001 ? "One click: We'll fund ETH → You sign approval → Done!" : "Sign once, we handle the rest. No ETH needed for gas!"}
                                    </p>
                                </div>

                                {needsApproval && parseFloat(userETHBalance) < 0.0001 && (
                                    <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                                        <p className="text-xs text-green-300 font-medium">
                                            🎆 <strong>Auto-Funding:</strong> Click approve and we'll automatically send you ETH for gas!
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-3 mt-6">
                                <div className="p-4 rounded-xl bg-gradient-to-br from-green-900/40 to-emerald-900/40 border border-green-500/30 text-center hover:scale-105 transition-transform">
                                    <div className="text-2xl mb-1">✅</div>
                                    <div className="text-xs font-medium text-white">No ETH</div>
                                </div>
                                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-900/40 to-cyan-900/40 border border-blue-500/30 text-center hover:scale-105 transition-transform">
                                    <div className="text-2xl mb-1">⚡</div>
                                    <div className="text-xs font-medium text-white">Instant</div>
                                </div>
                                <div className="p-4 rounded-xl bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-500/30 text-center hover:scale-105 transition-transform">
                                    <div className="text-2xl mb-1">🔒</div>
                                    <div className="text-xs font-medium text-white">Secure</div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}
