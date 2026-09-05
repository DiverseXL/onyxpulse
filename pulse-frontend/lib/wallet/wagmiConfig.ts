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
import { injected } from 'wagmi/connectors';
import { somniaTestnet } from './chain';

export { somniaTestnet };

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
