#!/usr/bin/env node

const { Wallet } = require('ethers');
const fs = require('fs');

console.log('🔐 Generating Relayer Wallets for GasZero...\n');

const chains = ['POLYGON', 'ARBITRUM', 'BASE'];
const wallets = {};
let envContent = '';

chains.forEach(chain => {
  const wallet = Wallet.createRandom();
  wallets[chain] = {
    address: wallet.address,
    privateKey: wallet.privateKey
  };

  console.log(`${chain} Relayer:`);
  console.log(`  Address: ${wallet.address}`);
  console.log(`  Private Key: ${wallet.privateKey}`);
  console.log(`  ⚠️  SAVE THIS PRIVATE KEY SECURELY!\n`);

  envContent += `${chain}_RELAYER_KEY=${wallet.privateKey}\n`;
  envContent += `${chain}_RELAYER_ADDRESS=${wallet.address}\n`;
});

// Save to .env.local.example (never commit the actual .env.local!)
fs.writeFileSync('.env.local.example', envContent);

console.log('✅ Wallets generated successfully!');
console.log('📄 Saved to .env.local.example');
console.log('\n⚠️  IMPORTANT:');
console.log('1. Copy .env.local.example to .env.local');
console.log('2. NEVER commit .env.local to git');
console.log('3. Fund these wallets with native tokens:');
console.log('   - Polygon: 0.5 MATIC');
console.log('   - Arbitrum: 0.1 ETH');
console.log('   - Base: 0.1 ETH');

// Also save addresses to a public config file
const publicConfig = {
  relayerAddresses: {
    polygon: wallets.POLYGON.address,
    arbitrum: wallets.ARBITRUM.address,
    base: wallets.BASE.address
  }
};

fs.writeFileSync(
  'src/config/relayers.json',
  JSON.stringify(publicConfig, null, 2)
);

console.log('\n📁 Public addresses saved to src/config/relayers.json');
console.log('   (This file is safe to commit)');
