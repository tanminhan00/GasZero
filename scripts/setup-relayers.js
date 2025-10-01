#!/usr/bin/env node
/**
 * Setup script for OneTap relayer wallets
 * This script generates new wallets for testnets and provides instructions
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

console.log(`${colors.bright}${colors.cyan}
╔═══════════════════════════════════════════════════╗
║         OneTap Relayer Setup Script               ║
╚═══════════════════════════════════════════════════╝
${colors.reset}`);

function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase
  };
}

// Generate wallets for each chain
const wallets = {
  'ETH_SEPOLIA': generateWallet(),
  'ARB_SEPOLIA': generateWallet(),
  'BASE_SEPOLIA': generateWallet(),
  'BASE': generateWallet(), // Additional for BASE_RELAYER_KEY
};

// Create .env.local content
let envContent = `# OneTap Environment Variables - Generated ${new Date().toISOString()}
# ⚠️ IMPORTANT: Keep these keys secure and never commit them to git!

# Expand Network API Key (get from https://expand.network)
NEXT_PUBLIC_EXPAND_API_KEY=

# Relayer Private Keys (Generated for testnets)
`;

// Add wallet keys to env content
for (const [chain, wallet] of Object.entries(wallets)) {
  if (chain === 'BASE') {
    envContent += `BASE_RELAYER_KEY=${wallet.privateKey}\n`;
  } else {
    envContent += `${chain}_RELAYER_KEY=${wallet.privateKey}\n`;
  }
}

envContent += `
# RPC URLs (using public endpoints)
ETH_RPC=https://eth-sepolia.g.alchemy.com/v2/demo
ARBITRUM_RPC=https://sepolia-rollup.arbitrum.io/rpc
BASE_RPC=https://sepolia.base.org

# Optional: WalletConnect & Pimlico for future features
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_PIMLICO_API_KEY=
NEXT_PUBLIC_BUNDLER_URL=
`;

// Write to .env.local
const envPath = path.join(process.cwd(), '.env.local');

// Check if .env.local already exists
if (fs.existsSync(envPath)) {
  console.log(`${colors.yellow}⚠️  Warning: .env.local already exists${colors.reset}`);
  console.log(`${colors.yellow}   Creating .env.local.new instead${colors.reset}\n`);
  fs.writeFileSync(path.join(process.cwd(), '.env.local.new'), envContent);
} else {
  fs.writeFileSync(envPath, envContent);
  console.log(`${colors.green}✅ Created .env.local file${colors.reset}`);
}

// Display wallet information
console.log(`${colors.bright}\n📝 Generated Relayer Wallets:${colors.reset}`);
console.log('═══════════════════════════════════════════════════════════\n');

for (const [chain, wallet] of Object.entries(wallets)) {
  const chainName = chain.replace(/_/g, ' ');
  console.log(`${colors.cyan}${chainName} Relayer:${colors.reset}`);
  console.log(`  Address: ${colors.bright}${wallet.address}${colors.reset}`);
  console.log(`  Private Key: ${colors.yellow}${wallet.privateKey}${colors.reset}`);
  console.log('');
}

// Faucet links
console.log(`${colors.bright}💰 Fund Your Relayers (Required for gas):${colors.reset}`);
console.log('═══════════════════════════════════════════════════════════\n');

const faucets = [
  {
    name: 'Ethereum Sepolia',
    address: wallets['ETH_SEPOLIA'].address,
    links: [
      'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
      'https://www.alchemy.com/faucets/ethereum-sepolia',
      'https://sepolia-faucet.pk910.de/'
    ]
  },
  {
    name: 'Arbitrum Sepolia',
    address: wallets['ARB_SEPOLIA'].address,
    links: [
      'https://faucet.quicknode.com/arbitrum/sepolia',
      'https://faucet.triangleplatform.com/arbitrum/sepolia'
    ]
  },
  {
    name: 'Base Sepolia',
    address: wallets['BASE_SEPOLIA'].address,
    links: [
      'https://cloud.google.com/application/web3/faucet/ethereum/base-sepolia',
      'https://faucet.quicknode.com/base/sepolia'
    ]
  }
];

faucets.forEach(faucet => {
  console.log(`${colors.blue}${faucet.name}:${colors.reset}`);
  console.log(`  Address to fund: ${colors.bright}${faucet.address}${colors.reset}`);
  console.log('  Faucets:');
  faucet.links.forEach(link => {
    console.log(`    • ${link}`);
  });
  console.log('');
});

// Next steps
console.log(`${colors.bright}${colors.green}🚀 Next Steps:${colors.reset}`);
console.log('═══════════════════════════════════════════════════════════\n');
console.log(`1. ${colors.cyan}Get Expand Network API Key:${colors.reset}`);
console.log(`   • Sign up at: https://expand.network`);
console.log(`   • Add to .env.local: NEXT_PUBLIC_EXPAND_API_KEY=your_key_here\n`);

console.log(`2. ${colors.cyan}Fund Your Relayers:${colors.reset}`);
console.log(`   • Each relayer needs ~0.1 ETH on testnets for gas`);
console.log(`   • Use the faucet links above to get testnet tokens\n`);

console.log(`3. ${colors.cyan}Get Testnet USDC:${colors.reset}`);
console.log(`   • Use Uniswap on testnets to swap ETH for USDC`);
console.log(`   • Or use Circle's testnet USDC faucet\n`);

console.log(`4. ${colors.cyan}Start Development:${colors.reset}`);
console.log(`   ${colors.bright}npm run dev${colors.reset}\n`);

console.log(`${colors.yellow}⚠️  Security Reminder:${colors.reset}`);
console.log(`   • Never commit .env.local to git`);
console.log(`   • Use different keys for production`);
console.log(`   • Consider using a key management service in production\n`);

console.log(`${colors.green}✨ Setup complete! Happy building with OneTap!${colors.reset}\n`);
