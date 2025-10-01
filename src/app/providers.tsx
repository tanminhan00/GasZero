// src/app/providers.tsx
'use client';

import React from 'react';
import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { baseSepolia, sepolia, arbitrumSepolia } from 'wagmi/chains';

// WalletConnect project ID is optional for development
// Get one from https://cloud.walletconnect.com/ for production
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'a5819fcf1f36b210f9c5f1f5e978b6b3'; // Default fallback for development

const config = getDefaultConfig({
  appName: 'OneTap',
  projectId: walletConnectProjectId,
  chains: [baseSepolia, sepolia, arbitrumSepolia], // Base Sepolia as default
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
