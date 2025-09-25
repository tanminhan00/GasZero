// src/app/providers.tsx
'use client';

import React from 'react';
import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { baseSepolia } from 'wagmi/chains';

// WalletConnect Project ID is optional - only needed for WalletConnect wallet connections
// For MetaMask and browser wallets, it works without it
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  'a5bba1ba8b3f0a26f0e9e045a7b89e5b'; // Demo project ID

const config = getDefaultConfig({
  appName: 'OneTap',
  projectId: walletConnectProjectId,
  chains: [baseSepolia],
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
