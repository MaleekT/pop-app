'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { arcTransport } from '@/lib/markets/rpc'

import '@rainbow-me/rainbowkit/styles.css'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
if (!projectId) {
  // WalletConnect connections will be unavailable without a project ID.
  // Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local for full wallet support.
  console.warn('[Pop] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — WalletConnect disabled')
}

// Without an explicit `transports`, getDefaultConfig calls createDefaultTransports(chains), which is
// ONE http() per chain aimed at the chain's default endpoint and no fallback. Every browser read
// therefore rode a single public Arc endpoint that four crons already rate-limit ("request limit
// reached", see 10983e2) — and a read that fails is indistinguishable from a zero, so a rate-limited
// `staked` call rendered as "you hold no position". The server jobs were given failover in 10983e2;
// this is the same transport, so the browser stops being the one client without it.
// Safe in a client bundle on purpose: arcRpcUrls() is keyless by design (see lib/markets/rpc.ts).
const config = getDefaultConfig({
  appName: 'Pop',
  projectId: projectId ?? 'no-walletconnect',
  chains: [arcTestnet],
  transports: { [arcTestnet.id]: arcTransport() },
  ssr: true,
})

// Stable singleton — this is a 'use client' module, so it is never shared across SSR requests.
const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#D7FF1E',
            accentColorForeground: '#0B0B0F',
            borderRadius: 'medium',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
