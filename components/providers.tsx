'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

import '@rainbow-me/rainbowkit/styles.css'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
if (!projectId) {
  // WalletConnect connections will be unavailable without a project ID.
  // Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local for full wallet support.
  console.warn('[Pop] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — WalletConnect disabled')
}

const config = getDefaultConfig({
  appName: 'Pop',
  projectId: projectId ?? 'no-walletconnect',
  chains: [arcTestnet],
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
