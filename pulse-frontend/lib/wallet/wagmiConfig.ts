/**
 * wagmi configuration for Somnia Shannon testnet.
 *
 * Uses the injected() connector only -- this talks to window.ethereum
 * directly, working with MetaMask, Brave Wallet, Rabby, and any other
 * browser-extension wallet without pulling in heavy SDK dependencies.
 *
 * We import injected from the deep path (not the wagmi/connectors barrel)
 * to avoid Turbopack resolving ALL connector modules and their dependency
 * trees (walletConnect, coinbaseWallet, porto, baseAccount, etc.).
 */

import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';
import { injected } from 'wagmi/connectors';

/* -------------------------------------------------------------------------- */
/*  Chain definition                                                           */
/* -------------------------------------------------------------------------- */

export const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.infra.testnet.somnia.network/http'] },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Explorer',
      url: 'https://shannon-explorer.somnia.network',
    },
  },
});

/* -------------------------------------------------------------------------- */
/*  wagmi config                                                               */
/* -------------------------------------------------------------------------- */

export const wagmiConfig = createConfig({
  chains: [somniaTestnet],
  connectors: [injected()],
  transports: {
    [somniaTestnet.id]: http(),
  },
});
