// Truly Gasless Relayer - Funds users with ETH for approvals
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits, parseEther, type Hash, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const CHAIN_CONFIG = {
  chain: baseSepolia,
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  rpc: process.env.BASE_RPC || 'https://sepolia.base.org',
};

export class TrulyGaslessRelayer {
  private relayerAccount: any;
  private walletClient: any;
  private publicClient: any;

  constructor() {
    const privateKey = process.env.BASE_RELAYER_KEY;
    if (!privateKey) throw new Error('No relayer key');

    this.relayerAccount = privateKeyToAccount(privateKey as `0x${string}`);

    this.walletClient = createWalletClient({
      account: this.relayerAccount,
      chain: CHAIN_CONFIG.chain,
      transport: http(CHAIN_CONFIG.rpc),
    });

    this.publicClient = createPublicClient({
      chain: CHAIN_CONFIG.chain,
      transport: http(CHAIN_CONFIG.rpc),
    });
  }

  async processTrulyGaslessTransaction(
    userAddress: `0x${string}`,
    recipientAddress: `0x${string}`,
    amount: string,
    signature: `0x${string}`
  ): Promise<{ success: boolean; hash?: Hash; error?: string }> {
    try {
      const amountInWei = parseUnits(amount, 6);
      const fee = this.calculateFee(amountInWei);

      // Step 1: Check if user needs ETH for approval
      const userETHBalance = await this.publicClient.getBalance({ address: userAddress });
      const userAllowance = await this.checkAllowance(userAddress, this.relayerAccount.address);

      // If user has insufficient allowance and no ETH, fund them!
      if (userAllowance < amountInWei && userETHBalance < parseEther('0.001')) {
        console.log(`🎁 Funding ${userAddress} with ETH for approval...`);

        // Send minimal ETH for approval gas (relayer pays this)
        const fundingHash = await this.walletClient.sendTransaction({
          to: userAddress,
          value: parseEther('0.001'), // Minimal ETH for one approval tx
        });

        // Wait for funding to confirm
        await this.publicClient.waitForTransactionReceipt({ hash: fundingHash });
        console.log(`✅ Funded user with 0.001 ETH for approval`);

        // Now user has ETH, prompt them to approve
        // In production, you'd coordinate this with frontend
        return {
          success: false,
          error: 'User funded with ETH. Please approve USDC spending and retry.',
        };
      }

      // Step 2: Check if we have approval
      if (userAllowance < amountInWei) {
        return {
          success: false,
          error: 'Please approve USDC first (you now have ETH for gas!)',
        };
      }

      // Step 3: Execute the transfer (pull USDC from user)
      const transferData = encodeFunctionData({
        abi: [{
          name: 'transferFrom',
          type: 'function',
          inputs: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
          ],
          outputs: [{ type: 'bool' }]
        }],
        functionName: 'transferFrom',
        args: [userAddress, this.relayerAccount.address, amountInWei]
      });

      // Pull funds to relayer
      const pullHash = await this.walletClient.sendTransaction({
        to: CHAIN_CONFIG.usdc as `0x${string}`,
        data: transferData,
      });

      await this.publicClient.waitForTransactionReceipt({ hash: pullHash });

      // Step 4: Send net amount to recipient
      const sendData = encodeFunctionData({
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
        args: [recipientAddress, amountInWei - fee]
      });

      const sendHash = await this.walletClient.sendTransaction({
        to: CHAIN_CONFIG.usdc as `0x${string}`,
        data: sendData,
      });

      console.log(`✅ Transaction complete - truly gasless!`);
      console.log(`   User paid: 0 ETH (we funded them!)`);
      console.log(`   Relayer collected: ${formatUnits(fee, 6)} USDC fee`);

      return { success: true, hash: sendHash };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async checkAllowance(owner: `0x${string}`, spender: `0x${string}`): Promise<bigint> {
    const allowance = await this.publicClient.readContract({
      address: CHAIN_CONFIG.usdc as `0x${string}`,
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
      args: [owner, spender],
    });
    return allowance as bigint;
  }

  private calculateFee(amount: bigint): bigint {
    const fee = (amount * 50n) / 10000n; // 0.5%
    const minFee = parseUnits('0.5', 6);
    return fee > minFee ? fee : minFee;
  }

  // Helper: Execute approval on behalf of user (after funding them)
  async executeApprovalForUser(
    userPrivateKey: `0x${string}`, // User would need to share this, which is not ideal
    spender: `0x${string}`,
    amount: bigint
  ): Promise<Hash> {
    // This is problematic - we can't get user's private key
    // Better solution: User executes approval themselves with funded ETH
    throw new Error('Users must approve themselves - we just fund the gas!');
  }
}

// API endpoint would use this:
export async function handleTrulyGaslessRequest(
  userAddress: `0x${string}`,
  recipientAddress: `0x${string}`,
  amount: string,
  signature: `0x${string}`
): Promise<any> {
  const relayer = new TrulyGaslessRelayer();
  return relayer.processTrulyGaslessTransaction(
    userAddress,
    recipientAddress,
    amount,
    signature
  );
}