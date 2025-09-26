// Evolution: Gasless V2 - Using Relayer Instead of Smart Account
// This replaces the smart account approach with relayer approach
// NO ETH NEEDED EVER!

import { createPublicClient, createWalletClient, custom, http, type Hash, parseUnits, formatUnits } from 'viem';
import { baseSepolia, polygon, arbitrum, optimism } from 'viem/chains';

const CHAINS = {
  base: baseSepolia,
  polygon: polygon,
  arbitrum: arbitrum,
  optimism: optimism,
} as const;

export type SupportedChain = keyof typeof CHAINS;

// Verify a signature
export async function verifySignature(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  try {
    const valid = await publicClient.verifyMessage({
      message,
      signature: signature as `0x${string}`,
      address: address as `0x${string}`,
    });
    return valid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

// Sign an intent message (no gas needed!)
export async function signIntent(
  message: string,
  walletClient: any
): Promise<`0x${string}`> {
  const signature = await walletClient.signMessage({
    message: message,
  });
  return signature;
}

// Execute gasless transaction via relayer
export async function executeGaslessTransactionV2(
  intent: string,
  userAddress: `0x${string}`,
  fromChain: SupportedChain = 'base',
  toChain?: SupportedChain
): Promise<Hash> {
  // Check if window.ethereum exists
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
  }

  // Create wallet client for signing only (no gas needed!)
  const walletClient = createWalletClient({
    account: userAddress,
    chain: CHAINS[fromChain],
    transport: custom((window as any).ethereum),
  });

  // Parse the intent
  const parsedIntent = parseIntent(intent);

  // Create intent object
  const intentObject = {
    from: userAddress,
    fromChain,
    toChain: toChain || fromChain,
    token: parsedIntent.token,
    amount: parsedIntent.amount.toString(),
    recipient: parsedIntent.recipient,
    action: toChain && toChain !== fromChain ? 'bridge' : 'transfer',
    timestamp: Date.now(),
  };

  // Sign the intent (no gas!)
  const message = JSON.stringify(intentObject);
  const signature = await signIntent(message, walletClient);

  // Send to relayer backend
  const response = await fetch('/api/relay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chain: fromChain,
      intent: intentObject,
      signature,
      from: userAddress,
    }),
  });

  if (!response.ok) {
    throw new Error('Relayer failed to execute transaction');
  }

  const result = await response.json();

  // Show fee breakdown to user
  console.log('Transaction executed:', {
    hash: result.hash,
    fee: `${formatUnits(BigInt(result.fee), 6)} USDC`,
    delivered: `${formatUnits(BigInt(result.netAmount), 6)} USDC`,
  });

  return result.hash;
}

// Get user balance on any chain (no gas needed to check!)
export async function getBalanceOnChain(
  userAddress: `0x${string}`,
  chain: SupportedChain,
  token: 'USDC' = 'USDC'
): Promise<string> {
  const publicClient = createPublicClient({
    chain: CHAINS[chain],
    transport: http(),
  });

  // Token addresses per chain
  const TOKEN_ADDRESSES = {
    base: {
      USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
    },
    polygon: {
      USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    },
    arbitrum: {
      USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    },
    optimism: {
      USDC: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    },
  };

  const tokenAddress = TOKEN_ADDRESSES[chain]?.[token];
  if (!tokenAddress) {
    throw new Error(`Token ${token} not supported on ${chain}`);
  }

  try {
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
      args: [userAddress],
    });

    return formatUnits(balance as bigint, 6); // USDC has 6 decimals
  } catch (error) {
    console.error('Error fetching balance:', error);
    return '0';
  }
}

// Get balances across all chains
export async function getAllBalances(
  userAddress: `0x${string}`
): Promise<Record<SupportedChain, string>> {
  const balances = await Promise.all(
    Object.keys(CHAINS).map(async (chain) => {
      const balance = await getBalanceOnChain(
        userAddress,
        chain as SupportedChain
      );
      return { chain, balance };
    })
  );

  return balances.reduce((acc, { chain, balance }) => {
    acc[chain as SupportedChain] = balance;
    return acc;
  }, {} as Record<SupportedChain, string>);
}

// Calculate cross-chain fee
export function calculateFee(
  amount: bigint,
  fromChain: SupportedChain,
  toChain: SupportedChain
): { fee: bigint; netAmount: bigint; feePercent: string } {
  const isCrossChain = fromChain !== toChain;

  // 0.5% same chain, 1.5% cross-chain
  const feeRate = isCrossChain ? 150n : 50n; // basis points
  const fee = (amount * feeRate) / 10000n;

  // Minimum fee
  const minFee = isCrossChain ? parseUnits('2', 6) : parseUnits('0.5', 6);
  const finalFee = fee > minFee ? fee : minFee;

  return {
    fee: finalFee,
    netAmount: amount - finalFee,
    feePercent: isCrossChain ? '1.5%' : '0.5%',
  };
}

// Parse intent (same as before but simplified)
function parseIntent(intent: string) {
  const normalized = intent.trim().toLowerCase();

  // Pattern: "send X USDC to 0x..."
  const pattern = /^(?:send|transfer)?\s*(\d+(?:\.\d+)?)\s+(usdc|usdt|dai)\s+to\s+(0x[a-fA-F0-9]{40})/i;
  const match = intent.match(pattern);

  if (!match) {
    throw new Error('Invalid intent format. Try: "send 10 USDC to 0x..."');
  }

  return {
    amount: parseUnits(match[1], 6), // Assuming 6 decimals
    token: match[2].toUpperCase(),
    recipient: match[3] as `0x${string}`,
  };
}
