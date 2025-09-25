// Truly Gasless from Day One - Relayer funds ETH for approvals
import { createWalletClient, createPublicClient, custom, http, encodeFunctionData, parseUnits, parseEther, type Hash } from 'viem';
import { baseSepolia } from 'viem/chains';
import { USDC_ADDRESS } from '@/config/chain.config';

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Check if user needs approval
async function needsApproval(
  userAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  amount: bigint
): Promise<boolean> {
  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: [{
      name: 'allowance',
      type: 'function',
      inputs: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' }
      ],
      outputs: [{ type: 'uint256' }],
      stateMutability: 'view',
    }],
    functionName: 'allowance',
    args: [userAddress, spenderAddress],
  });
  return (allowance as bigint) < amount;
}

// Execute truly gasless transaction
export async function executeTrulyGaslessTransaction(
  intent: string,
  userAddress: `0x${string}`
): Promise<Hash> {
  // Step 1: Parse intent
  const parsedIntent = parseIntent(intent);
  const amount = parsedIntent.amount;

  // Step 2: Check if user needs ETH for approval
  const relayerAddress = '0x...'; // Get from backend
  const needsApprovalFlag = await needsApproval(userAddress, relayerAddress, amount);
  const userETH = await publicClient.getBalance({ address: userAddress });

  if (needsApprovalFlag && userETH < parseEther('0.001')) {
    // Step 3: Request ETH funding from relayer
    const fundingResponse = await fetch('/api/fund-user-eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress,
        reason: 'approval_needed',
      }),
    });

    if (!fundingResponse.ok) {
      throw new Error('Failed to get ETH funding');
    }

    // Step 4: Wait for ETH to arrive
    let attempts = 0;
    while (attempts < 10) {
      const newBalance = await publicClient.getBalance({ address: userAddress });
      if (newBalance >= parseEther('0.0005')) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    // Step 5: Now execute approval with the funded ETH
    const walletClient = createWalletClient({
      account: userAddress,
      chain: baseSepolia,
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
      args: [relayerAddress as `0x${string}`, amount * 2n] // Approve extra for future
    });

    // User executes approval with relayer-funded ETH!
    await walletClient.sendTransaction({
      to: USDC_ADDRESS as `0x${string}`,
      data: approveData,
    });
  }

  // Step 6: Now execute the actual transaction (gasless)
  const response = await fetch('/api/relay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chain: 'base',
      from: userAddress,
      to: parsedIntent.recipient,
      token: 'USDC',
      amount: parsedIntent.amountString,
      signature: await signIntent(intent, userAddress),
    }),
  });

  const result = await response.json();
  return result.hash;
}

// Sign intent
async function signIntent(intent: string, userAddress: `0x${string}`): Promise<`0x${string}`> {
  const walletClient = createWalletClient({
    account: userAddress,
    chain: baseSepolia,
    transport: custom((window as any).ethereum),
  });

  return walletClient.signMessage({ message: intent });
}

// Parse intent helper
function parseIntent(intent: string): {
  amount: bigint;
  amountString: string;
  recipient: `0x${string}`;
} {
  const match = intent.match(/(\d+(?:\.\d+)?)\s+USDC\s+to\s+(0x[a-fA-F0-9]{40})/i);
  if (!match) throw new Error('Invalid intent');

  return {
    amountString: match[1],
    amount: parseUnits(match[1], 6),
    recipient: match[2] as `0x${string}`,
  };
}