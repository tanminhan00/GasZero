#!/usr/bin/env node
/**
 * Check OneTap setup and diagnose common issues
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
require('dotenv').config({ path: '.env.local' });

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

console.log(`${colors.bright}${colors.cyan}
╔════════════════════════════════════════════════════╗
║           OneTap Setup Checker                    ║
╚════════════════════════════════════════════════════╝
${colors.reset}`);

async function checkEnvFile() {
  console.log(`\n${colors.bright}📋 Checking Environment Configuration${colors.reset}`);
  console.log('═══════════════════════════════════════════════\n');

  const envPath = path.join(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    console.log(`${colors.red}❌ .env.local not found!${colors.reset}`);
    console.log(`   Run: ${colors.bright}npm run setup${colors.reset} to create it\n`);
    return false;
  }

  console.log(`${colors.green}✓${colors.reset} .env.local exists`);

  // Check required keys
  const required = {
    'NEXT_PUBLIC_EXPAND_API_KEY': process.env.NEXT_PUBLIC_EXPAND_API_KEY,
    'ETH_SEPOLIA_RELAYER_KEY': process.env.ETH_SEPOLIA_RELAYER_KEY,
    'ARB_SEPOLIA_RELAYER_KEY': process.env.ARB_SEPOLIA_RELAYER_KEY,
    'BASE_SEPOLIA_RELAYER_KEY': process.env.BASE_SEPOLIA_RELAYER_KEY || process.env.BASE_RELAYER_KEY,
  };

  let hasAllKeys = true;

  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      console.log(`${colors.red}❌ Missing: ${key}${colors.reset}`);
      hasAllKeys = false;
    } else {
      const displayValue = key.includes('KEY')
        ? `${value.slice(0, 10)}...${value.slice(-4)}`
        : value.slice(0, 20) + '...';
      console.log(`${colors.green}✓${colors.reset} ${key}: ${displayValue}`);
    }
  }

  return hasAllKeys;
}

async function checkRelayerBalances() {
  console.log(`\n${colors.bright}💰 Checking Relayer Balances${colors.reset}`);
  console.log('═══════════════════════════════════════════════\n');

  const chains = [
    {
      name: 'Ethereum Sepolia',
      key: process.env.ETH_SEPOLIA_RELAYER_KEY,
      rpc: 'https://eth-sepolia.g.alchemy.com/v2/demo',
      explorer: 'https://sepolia.etherscan.io/address/',
      minBalance: '0.01', // Minimum recommended
    },
    {
      name: 'Arbitrum Sepolia',
      key: process.env.ARB_SEPOLIA_RELAYER_KEY,
      rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
      explorer: 'https://sepolia.arbiscan.io/address/',
      minBalance: '0.01',
    },
    {
      name: 'Base Sepolia',
      key: process.env.BASE_SEPOLIA_RELAYER_KEY || process.env.BASE_RELAYER_KEY,
      rpc: 'https://sepolia.base.org',
      explorer: 'https://sepolia.basescan.org/address/',
      minBalance: '0.01',
    },
  ];

  for (const chain of chains) {
    console.log(`${colors.cyan}${chain.name}:${colors.reset}`);

    if (!chain.key) {
      console.log(`  ${colors.red}❌ No relayer key configured${colors.reset}\n`);
      continue;
    }

    try {
      const provider = new ethers.providers.JsonRpcProvider(chain.rpc);
      const wallet = new ethers.Wallet(chain.key, provider);
      const balance = await wallet.getBalance();
      const balanceETH = ethers.utils.formatEther(balance);

      console.log(`  Address: ${wallet.address}`);
      console.log(`  Balance: ${balanceETH} ETH`);

      if (parseFloat(balanceETH) < parseFloat(chain.minBalance)) {
        console.log(`  ${colors.yellow}⚠️  Low balance! Need at least ${chain.minBalance} ETH${colors.reset}`);
        console.log(`  ${colors.yellow}   Get testnet ETH from faucets${colors.reset}`);
      } else {
        console.log(`  ${colors.green}✓ Sufficient balance${colors.reset}`);
      }

      console.log(`  Explorer: ${chain.explorer}${wallet.address}\n`);

    } catch (error) {
      console.log(`  ${colors.red}❌ Error checking balance: ${error.message}${colors.reset}\n`);
    }
  }
}

async function checkExpandAPI() {
  console.log(`\n${colors.bright}🌐 Checking Expand API${colors.reset}`);
  console.log('═══════════════════════════════════════════════\n');

  const apiKey = process.env.NEXT_PUBLIC_EXPAND_API_KEY;

  if (!apiKey) {
    console.log(`${colors.red}❌ NEXT_PUBLIC_EXPAND_API_KEY not set${colors.reset}`);
    console.log('   Get your API key from: https://expand.network\n');
    return false;
  }

  try {
    // Try a simple API call
    const response = await fetch('https://api.expand.network/chain/getchainid?chainId=11155111', {
      headers: {
        'x-api-key': apiKey,
      },
    });

    if (response.ok) {
      console.log(`${colors.green}✓ Expand API key is valid${colors.reset}`);
      const data = await response.json();
      console.log(`  Connected to: ${data.data?.chainName || 'API'}\n`);
      return true;
    } else {
      console.log(`${colors.red}❌ Expand API key is invalid${colors.reset}`);
      console.log(`  Status: ${response.status} ${response.statusText}\n`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ Failed to connect to Expand API${colors.reset}`);
    console.log(`  Error: ${error.message}\n`);
    return false;
  }
}

async function main() {
  let allGood = true;

  // Check environment file
  const hasEnv = await checkEnvFile();
  if (!hasEnv) {
    allGood = false;
  }

  // Check relayer balances
  await checkRelayerBalances();

  // Check Expand API
  const apiWorks = await checkExpandAPI();
  if (!apiWorks) {
    allGood = false;
  }

  // Summary
  console.log(`${colors.bright}📊 Summary${colors.reset}`);
  console.log('═══════════════════════════════════════════════\n');

  if (allGood) {
    console.log(`${colors.green}${colors.bright}✅ Setup looks good!${colors.reset}`);
    console.log(`\nYou can now run: ${colors.bright}npm run dev${colors.reset}\n`);
  } else {
    console.log(`${colors.yellow}${colors.bright}⚠️  Some issues need attention${colors.reset}\n`);

    console.log('Quick fixes:');
    console.log(`1. Run: ${colors.bright}npm run setup${colors.reset} to generate relayer wallets`);
    console.log(`2. Get Expand API key from: ${colors.cyan}https://expand.network${colors.reset}`);
    console.log(`3. Fund relayers with testnet ETH from faucets`);
    console.log(`4. Add keys to ${colors.bright}.env.local${colors.reset}\n`);
  }
}

main().catch(console.error);
