#!/usr/bin/env node

const { createPublicClient, http, formatEther } = require('viem');
const { arbitrumSepolia, baseSepolia, polygonMumbai } = require('viem/chains');
require('dotenv').config({ path: '.env.local' });

async function checkBalances() {
  console.log('🔍 Checking Testnet Relayer Balances...\n');

  // Get addresses from env
  const relayers = {
    'Arbitrum Sepolia': {
      address: process.env.ARBITRUM_RELAYER_ADDRESS,
      chain: arbitrumSepolia,
      rpc: 'https://sepolia-rollup.arbitrum.io/rpc'
    },
    'Base Sepolia': {
      address: process.env.BASE_RELAYER_ADDRESS,
      chain: baseSepolia,
      rpc: 'https://sepolia.base.org'
    },
    'Polygon Mumbai': {
      address: process.env.POLYGON_RELAYER_ADDRESS,
      chain: polygonMumbai,
      rpc: 'https://rpc-mumbai.maticvigil.com'
    }
  };

  for (const [name, config] of Object.entries(relayers)) {
    if (!config.address) {
      console.log(`❌ ${name}: No address configured`);
      continue;
    }

    try {
      const client = createPublicClient({
        chain: config.chain,
        transport: http(config.rpc),
      });

      const balance = await client.getBalance({
        address: config.address,
      });

      const balanceInEth = formatEther(balance);
      const emoji = parseFloat(balanceInEth) > 0.01 ? '✅' : '⚠️';

      console.log(`${emoji} ${name}:`);
      console.log(`   Address: ${config.address}`);
      console.log(`   Balance: ${balanceInEth} ${name.includes('Polygon') ? 'MATIC' : 'ETH'}`);
      console.log('');
    } catch (error) {
      console.log(`❌ ${name}: Error checking balance`);
      console.log(`   ${error.message}\n`);
    }
  }

  console.log('📝 Note: You need at least 0.01 ETH/MATIC to execute transactions');
  console.log('\n🔗 Faucets:');
  console.log('   Arbitrum Sepolia: https://www.alchemy.com/faucets/arbitrum-sepolia');
  console.log('   Base Sepolia: https://www.coinbase.com/faucets/base-sepolia');
  console.log('   Polygon Mumbai: https://faucet.polygon.technology/');
}

checkBalances().catch(console.error);
