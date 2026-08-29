'use client';

import { ThirdwebProvider as TWProvider } from 'thirdweb/react';
import { createThirdwebClient } from 'thirdweb';
import { defineChain } from 'thirdweb/chains';

/**
 * Thirdweb client singleton — created once at module scope.
 * Requires NEXT_PUBLIC_THIRDWEB_CLIENT_ID env var.
 */
const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID ?? '';

export const thirdwebClient = createThirdwebClient(
  clientId
    ? { clientId }
    : { clientId: 'placeholder' }, // Will show connect UI but fail gracefully
);

/**
 * Somnia Shannon testnet chain definition for Thirdweb.
 */
export const somniaTestnetChain = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
  rpc: 'https://api.infra.testnet.somnia.network/http',
});

/**
 * Thirdweb Provider — wraps the app tree so useConnect / ConnectButton work.
 */
export function ThirdwebWalletProvider({ children }: { children: React.ReactNode }) {
  return <TWProvider>{children}</TWProvider>;
}
