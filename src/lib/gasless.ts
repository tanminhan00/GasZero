import {
    createSmartAccountClient,
  } from 'permissionless';
  import {
    toSimpleSmartAccount,
  } from 'permissionless/accounts';
  import { createPimlicoClient } from 'permissionless/clients/pimlico';
  import { createPublicClient, createWalletClient, custom, http, type Hash, parseUnits, encodeFunctionData, formatUnits, decodeFunctionData } from 'viem';
  import { baseSepolia } from 'viem/chains';
  import { BUNDLER_URL, USDC_ADDRESS, ENTRYPOINT_ADDRESS } from '@/config/chain.config';

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  // Use the correct entry point address for V0.7
  const ENTRYPOINT_ADDRESS_V07 = {
    address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const,
    version: '0.7' as const
  };

  const pimlicoClient = createPimlicoClient({
    transport: http(BUNDLER_URL),
    entryPoint: ENTRYPOINT_ADDRESS_V07,
  });

  export async function getSmartAccountAddress(
    userAddress: `0x${string}`
  ): Promise<`0x${string}`> {
    // Check if window.ethereum exists
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
    }

    // Create wallet client from user's connected wallet
    const walletClient = createWalletClient({
      account: userAddress,
      chain: baseSepolia,
      transport: custom((window as any).ethereum),
    });

    // Create smart account to get its address
    const smartAccount = await toSimpleSmartAccount({
      client: publicClient,
      owner: walletClient,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      factoryAddress: '0x9406Cc6185a346906296840746125a0E44976454', // SimpleAccountFactory on Base Sepolia
    });

    return smartAccount.address;
  }

  export async function getSmartAccountUSDCBalance(
    smartAccountAddress: `0x${string}`
  ): Promise<string> {
    try {
      const balance = await publicClient.readContract({
        address: USDC_ADDRESS as `0x${string}`,
        abi: [{
          name: 'balanceOf',
          type: 'function',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
        }],
        functionName: 'balanceOf',
        args: [smartAccountAddress],
      });

      return formatUnits(balance as bigint, 6);
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
      return '0';
    }
  }

  // Helper function to get USDC balance
  async function getUSDCBalance(address: `0x${string}`): Promise<bigint> {
    try {
      const balance = await publicClient.readContract({
        address: USDC_ADDRESS as `0x${string}`,
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
      return balance as bigint;
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
      return 0n;
    }
  }

  // Helper function to extract amount from transfer data
  function getAmountFromTransferData(data: `0x${string}`): bigint {
    try {
      const decoded = decodeFunctionData({
        abi: [{
          name: 'transfer',
          type: 'function',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ type: 'bool' }]
        }],
        data: data,
      });
      return (decoded.args as any)[1] as bigint;
    } catch (error) {
      console.error('Error decoding transfer data:', error);
      return 0n;
    }
  }

  // Helper function to ensure USDC allowance
  async function ensureUSDCAllowance(
    owner: `0x${string}`,
    spender: `0x${string}`,
    amount: bigint,
    walletClient: any
  ): Promise<void> {
    // Check current allowance
    const allowance = await publicClient.readContract({
      address: USDC_ADDRESS as `0x${string}`,
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
      args: [owner, spender],
    });

    if ((allowance as bigint) < amount) {
      // Need to approve
      const approveTx = {
        to: USDC_ADDRESS as `0x${string}`,
        data: encodeFunctionData({
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
          args: [spender, amount * 2n] // Approve double for future transactions
        })
      };

      // This requires ETH for gas (one-time approval)
      const hash = await walletClient.sendTransaction(approveTx);

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }

  export async function executeGaslessTransaction(
    intent: string,
    userAddress: `0x${string}`
  ): Promise<Hash> {

    // Check if window.ethereum exists
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
    }

    // Create wallet client from user's connected wallet
    const walletClient = createWalletClient({
      account: userAddress,
      chain: baseSepolia,
      transport: custom((window as any).ethereum),
    });

    // Create smart account using the correct API
    const smartAccount = await toSimpleSmartAccount({
      client: publicClient,
      owner: walletClient,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      factoryAddress: '0x9406Cc6185a346906296840746125a0E44976454', // SimpleAccountFactory on Base Sepolia
    });

    // Parse the intent to get the transaction details
    const txIntent = parseIntent(intent);

    // For USDC transactions, we'll check if we need to move funds from EOA
    if (txIntent.to === USDC_ADDRESS) {
      // Decode the transfer amount from the transaction data
      const amount = getAmountFromTransferData(txIntent.data as `0x${string}`);

      // Check smart account balance
      const smartAccountBalance = await getUSDCBalance(smartAccount.address);

      if (smartAccountBalance < amount) {
        // Check EOA balance
        const eoaBalance = await getUSDCBalance(userAddress);
        const neededAmount = amount - smartAccountBalance;

        if (eoaBalance < neededAmount) {
          throw new Error(`Insufficient USDC balance. Your EOA has ${formatUnits(eoaBalance, 6)} USDC but needs ${formatUnits(neededAmount, 6)} USDC`);
        }

        // Important note: We need the user to fund their smart account first
        // This is a one-time operation that requires ETH for gas
        throw new Error(`Insufficient balance in smart account. Need ${formatUnits(neededAmount, 6)} more USDC. Please fund your smart account using the "Fund Smart Account" button above (one-time setup, requires ETH for gas).`);
      }
    }

    // Create smart account client with paymaster
    const smartAccountClient = createSmartAccountClient({
      account: smartAccount,
      chain: baseSepolia,
      bundlerTransport: http(BUNDLER_URL),
      paymaster: pimlicoClient,
      userOperation: {
        estimateFeesPerGas: async () => {
          return (await pimlicoClient.getUserOperationGasPrice()).fast;
        },
      },
    });

    // Send the transaction (gasless!)
    const hash = await smartAccountClient.sendTransaction(txIntent);

    return hash;
  }

// Simple helper: Direct transfer with paymaster sponsorship
export async function fundSmartAccountDirectly(
  userAddress: `0x${string}`,
  smartAccountAddress: `0x${string}`,
  amount: string
): Promise<Hash> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet detected.');
  }

  // For initial funding, we need to use a simple transfer
  // The issue is that smart accounts can't fund themselves
  // We need to transfer from EOA to smart account

  // Create wallet client
  const walletClient = createWalletClient({
    account: userAddress,
    chain: baseSepolia,
    transport: custom((window as any).ethereum),
  });

  // Parse amount
  const amountInWei = parseUnits(amount, 6);

  // Check balance
  const balance = await getUSDCBalance(userAddress);
  if (balance < amountInWei) {
    throw new Error(`Insufficient USDC. You have ${formatUnits(balance, 6)} USDC`);
  }

  // Simple transfer - this DOES require ETH for gas
  // There's no way around this for the initial funding
  const hash = await walletClient.sendTransaction({
    to: USDC_ADDRESS as `0x${string}`,
    data: encodeFunctionData({
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
      args: [smartAccountAddress, amountInWei]
    }),
  });

  return hash;
}

// Alternative: Use permit for gasless approval (if USDC supports EIP-2612)
export async function executeGaslessWithPermit(
  intent: string,
  userAddress: `0x${string}`,
  permitSignature?: {
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
    deadline: number;
  }
): Promise<Hash> {
  // Similar to executeGaslessTransaction but uses permit instead of approve
  // This allows completely gasless USDC transfers without any ETH ever!

  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No wallet detected.');
  }

  const walletClient = createWalletClient({
    account: userAddress,
    chain: baseSepolia,
    transport: custom((window as any).ethereum),
  });

  const smartAccount = await toSimpleSmartAccount({
    client: publicClient,
    owner: walletClient,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    factoryAddress: '0x9406Cc6185a346906296840746125a0E44976454',
  });

  const txIntent = parseIntent(intent);

  // If we have a permit signature, use it for gasless approval
  if (permitSignature && txIntent.to === USDC_ADDRESS) {
    // Create smart account client with paymaster
    const smartAccountClient = createSmartAccountClient({
      account: smartAccount,
      chain: baseSepolia,
      bundlerTransport: http(BUNDLER_URL),
      paymaster: pimlicoClient,
      userOperation: {
        estimateFeesPerGas: async () => {
          return (await pimlicoClient.getUserOperationGasPrice()).fast;
        },
      },
    });

    // Batch permit + transfer in one transaction
    const batchedCalls = [
      // Call permit on USDC
      {
        to: USDC_ADDRESS as `0x${string}`,
        data: encodeFunctionData({
          abi: [{
            name: 'permit',
            type: 'function',
            inputs: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
              { name: 'v', type: 'uint8' },
              { name: 'r', type: 'bytes32' },
              { name: 's', type: 'bytes32' }
            ],
            outputs: []
          }],
          functionName: 'permit',
          args: [
            userAddress,
            smartAccount.address,
            getAmountFromTransferData(txIntent.data as `0x${string}`),
            BigInt(permitSignature.deadline),
            permitSignature.v,
            permitSignature.r,
            permitSignature.s
          ]
        }),
        value: 0n
      },
      // Then execute the transfer
      txIntent
    ];

    // Execute both transactions separately
    const permitHash = await smartAccountClient.sendTransaction(batchedCalls[0]);
    const transferHash = await smartAccountClient.sendTransaction(batchedCalls[1]);

    return transferHash;
  }

  // Fallback to regular gasless execution
  return executeGaslessTransaction(intent, userAddress);
}

  function parseIntent(intent: string) {
    try {
      // Normalize the input
      const normalized = intent.trim().toLowerCase();

      // Validate input exists
      if (!normalized) {
        throw new Error('Please enter a transaction intent');
      }

      // Pattern 1: "send X USDC to 0x..."
      const usdcPattern = /^send\s+(\d+(?:\.\d+)?)\s+usdc\s+to\s+(0x[a-fA-F0-9]{40})$/i;
      const usdcMatch = intent.match(usdcPattern);

      if (usdcMatch) {
        const amount = usdcMatch[1];
        const to = usdcMatch[2] as `0x${string}`;

        // Validate address
        if (!to.match(/^0x[a-fA-F0-9]{40}$/)) {
          throw new Error('Invalid recipient address');
        }

        // Parse amount and validate
        const parsedAmount = parseUnits(amount, 6); // USDC has 6 decimals
        if (parsedAmount <= 0n) {
          throw new Error('Amount must be greater than 0');
        }

        // Encode USDC transfer
        const data = encodeFunctionData({
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
          args: [to, parsedAmount]
        });

        return {
          to: USDC_ADDRESS as `0x${string}`,
          data: data,
          value: 0n
        };
      }

      // Pattern 2: "X USDC to 0x..." (shorter format)
      const shortUsdcPattern = /^(\d+(?:\.\d+)?)\s+usdc\s+to\s+(0x[a-fA-F0-9]{40})$/i;
      const shortUsdcMatch = intent.match(shortUsdcPattern);

      if (shortUsdcMatch) {
        const amount = shortUsdcMatch[1];
        const to = shortUsdcMatch[2] as `0x${string}`;

        // Validate address
        if (!to.match(/^0x[a-fA-F0-9]{40}$/)) {
          throw new Error('Invalid recipient address');
        }

        const parsedAmount = parseUnits(amount, 6);
        if (parsedAmount <= 0n) {
          throw new Error('Amount must be greater than 0');
        }

        const data = encodeFunctionData({
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
          args: [to, parsedAmount]
        });

        return {
          to: USDC_ADDRESS as `0x${string}`,
          data: data,
          value: 0n
        };
      }

      // Pattern 3: "transfer X USDC to 0x..."
      const transferPattern = /^transfer\s+(\d+(?:\.\d+)?)\s+usdc\s+to\s+(0x[a-fA-F0-9]{40})$/i;
      const transferMatch = intent.match(transferPattern);

      if (transferMatch) {
        const amount = transferMatch[1];
        const to = transferMatch[2] as `0x${string}`;

        if (!to.match(/^0x[a-fA-F0-9]{40}$/)) {
          throw new Error('Invalid recipient address');
        }

        const parsedAmount = parseUnits(amount, 6);
        if (parsedAmount <= 0n) {
          throw new Error('Amount must be greater than 0');
        }

        const data = encodeFunctionData({
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
          args: [to, parsedAmount]
        });

        return {
          to: USDC_ADDRESS as `0x${string}`,
          data: data,
          value: 0n
        };
      }

      // Pattern 4: Simple ETH transfer "X ETH to 0x..."
      const ethPattern = /^(\d+(?:\.\d+)?)\s+eth\s+to\s+(0x[a-fA-F0-9]{40})$/i;
      const ethMatch = intent.match(ethPattern);

      if (ethMatch) {
        const amount = ethMatch[1];
        const to = ethMatch[2] as `0x${string}`;

        if (!to.match(/^0x[a-fA-F0-9]{40}$/)) {
          throw new Error('Invalid recipient address');
        }

        const parsedAmount = parseUnits(amount, 18);
        if (parsedAmount <= 0n) {
          throw new Error('Amount must be greater than 0');
        }

        return {
          to: to,
          value: parsedAmount,
          data: '0x' as `0x${string}`
        };
      }

      // If no pattern matches, throw helpful error
      throw new Error('Invalid format. Try: "send 10 USDC to 0x..." or "0.1 ETH to 0x..."');

    } catch (error: any) {
      throw new Error(error.message || 'Failed to parse transaction intent');
    }
  }
