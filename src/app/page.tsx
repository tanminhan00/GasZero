'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { executeGaslessTransaction, getSmartAccountAddress, getSmartAccountUSDCBalance } from '@/lib/gasless';
// Removed unused revenue import
import toast, { Toaster } from 'react-hot-toast';

export default function Home() {
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string>('');
  const [smartAccountBalance, setSmartAccountBalance] = useState<string>('0');
  const { address, isConnected } = useAccount();

  // Get smart account address and balance when wallet connects
  useEffect(() => {
    if (address) {
      getSmartAccountAddress(address)
        .then(addr => {
          setSmartAccountAddress(addr);
          // Also fetch the balance
          return getSmartAccountUSDCBalance(addr);
        })
        .then(setSmartAccountBalance)
        .catch(console.error);
    }
  }, [address]);

  // Refresh balance after transaction
  const refreshBalance = async () => {
    if (smartAccountAddress) {
      const balance = await getSmartAccountUSDCBalance(smartAccountAddress as `0x${string}`);
      setSmartAccountBalance(balance);
    }
  };

  async function handleExecute() {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Processing your transaction...');

    try {
      // Execute gasless transaction
      const hash = await executeGaslessTransaction(intent, address);

      toast.success(
        <div>
          <p>Transaction successful!</p>
          <a
            href={`https://sepolia.basescan.org/tx/${hash}`}
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
      await refreshBalance(); // Refresh balance after transaction
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Transaction failed', { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Toaster position="top-right" />

      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              OneTap
            </h1>
            <p className="text-xl text-gray-600">
              Execute any transaction without ETH
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Pay gas with USDC on Base Sepolia Testnet
            </p>
          </div>

          {/* Wallet Connection */}
          <div className="flex justify-center mb-8">
            <ConnectButton />
          </div>

          {isConnected && (
            <>
              {/* Smart Account Info */}
              {smartAccountAddress && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-sm font-semibold text-blue-900">
                      🔮 Smart Account Details
                    </h3>
                    <div className="text-right">
                      <p className="text-sm font-bold text-blue-900">
                        Smart Account: {smartAccountBalance} USDC
                      </p>
                      {parseFloat(smartAccountBalance) < 10 && parseFloat(smartAccountBalance) > 0 && (
                        <p className="text-xs text-orange-600">
                          ⚠️ Balance low
                        </p>
                      )}
                      <button
                        onClick={refreshBalance}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-blue-800 mb-3">
                    Smart Account Address: <code className="bg-blue-100 px-1 rounded">{smartAccountAddress.slice(0, 6)}...{smartAccountAddress.slice(-4)}</code>
                  </p>

                  {parseFloat(smartAccountBalance) === 0 && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-xs font-semibold text-yellow-900 mb-2">
                        ⚡ Fund Your Smart Account (100% Gasless!)
                      </p>
                      <p className="text-xs text-yellow-800 mb-2">
                        Reality check: Smart accounts require ETH for initial setup.
                        Consider using the GasZero page instead for truly gasless transactions!
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            const amount = prompt('How much USDC to transfer to smart account?', '10');
                            if (!amount) return;

                            const toastId = toast.loading('Initializing gasless transfer...');

                            // Use executeGaslessTransaction with a funding intent
                            // This will use the paymaster to sponsor the gas!

                            try {
                              // Create an intent to fund the smart account
                              const fundingIntent = `transfer ${amount} USDC to ${smartAccountAddress}`;

                              toast.loading('Sign in MetaMask (NO gas fees - paymaster sponsors everything!)...', { id: toastId });

                              // Execute through smart account with paymaster sponsorship
                              const hash = await executeGaslessTransaction(
                                fundingIntent,
                                address as `0x${string}`
                              );

                              toast.success(`Funded gaslessly! Hash: ${hash.slice(0, 10)}...`, { id: toastId });

                              // Refresh balance
                              setTimeout(async () => {
                                const newBalance = await getSmartAccountUSDCBalance(smartAccountAddress as `0x${string}`);
                                setSmartAccountBalance(newBalance);
                                toast.success(`Smart account received ${amount} USDC!`);
                              }, 5000);

                            } catch (smartAccountError: any) {
                              // If smart account fails, offer alternative
                              console.error('Smart account error:', smartAccountError);

                              if (smartAccountError.message?.includes('Insufficient balance in smart account')) {
                                // This is expected - the smart account needs initial funding
                                // For the VERY first funding, we need a different approach

                                toast.error('Initial funding requires a one-time ETH transaction. After this, everything is gasless!', { id: toastId });

                                // Fallback to direct transfer for initial funding only
                                const { createWalletClient, custom, encodeFunctionData, parseUnits } = await import('viem');
                                const { baseSepolia } = await import('viem/chains');
                                const { USDC_ADDRESS } = await import('@/config/chain.config');

                                const walletClient = createWalletClient({
                                  account: address as `0x${string}`,
                                  chain: baseSepolia,
                                  transport: custom(window.ethereum),
                                });

                                const transferData = encodeFunctionData({
                                  abi: [{
                                    name: 'transfer',
                                    type: 'function',
                                    inputs: [
                                      { name: 'to', type: 'address' },
                                      { name: 'amount', type: 'uint256' }
                                    ],
                                    outputs: [{ type: 'bool' }]
                                  }],
                                  functionName: 'transfer',
                                  args: [smartAccountAddress as `0x${string}`, parseUnits(amount, 6)]
                                });

                                toast.loading('One-time setup: Please confirm in MetaMask...', { id: toastId });

                                const hash = await walletClient.sendTransaction({
                                  to: USDC_ADDRESS as `0x${string}`,
                                  data: transferData,
                                  chain: baseSepolia,
                                });

                                toast.success(`Initial funding complete! All future transactions will be gasless.`, { id: toastId });

                                setTimeout(async () => {
                                  const newBalance = await getSmartAccountUSDCBalance(smartAccountAddress as `0x${string}`);
                                  setSmartAccountBalance(newBalance);
                                }, 5000);
                              } else {
                                toast.error(smartAccountError.message || 'Failed to fund smart account', { id: toastId });
                              }
                            }

                          } catch (error: any) {
                            console.error('Funding error:', error);
                            toast.error(error.message || 'Transaction failed');
                          }
                        }}
                        className="text-xs px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                      >
                        Fund Smart Account (Gasless)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Intent Input */}
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    What do you want to do?
                  </label>
                  <input
                    type="text"
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder="send 10 USDC to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  />
                  <div className="mt-2 flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-500">Examples:</p>
                      <ul className="mt-1 text-xs text-gray-400 space-y-1">
                        <li>• send 10 USDC to 0x742d35...</li>
                        <li>• 5.5 USDC to 0x742d35...</li>
                        <li>• transfer 1 USDC to 0x742d35...</li>
                      </ul>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-gray-600">Fees:</p>
                      <p className="text-xs text-gray-500">0.5% (min $0.10)</p>
                      <p className="text-xs text-green-600 font-semibold">First 10 FREE!</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleExecute}
                  disabled={loading || !intent}
                  className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? 'Executing...' : 'Execute Transaction'}
                </button>
              </div>

              {/* Info Box */}
              <div className="mt-8 p-6 bg-blue-50 rounded-xl">
                <h3 className="font-semibold text-blue-900 mb-2">How it works:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• You sign with your wallet (MetaMask, etc.)</li>
                  <li>• Smart account is created automatically</li>
                  <li>• Gas is paid with your USDC tokens</li>
                  <li>• No ETH needed at any point!</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}