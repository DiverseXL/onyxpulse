'use client';

/**
 * useTestUsdcBalance -- Hook to fetch and format the connected user's
 * test USDC balance on Somnia Shannon testnet (Chain 50312).
 *
 * NO EMOJI in code, comments, or UI.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { createPublicClient, http, erc20Abi, type Hex } from 'viem';
import { somniaTestnet } from './chain';

/** Test USDC contract on Shannon testnet (6 decimals). */
export const TEST_USDC_ADDRESS = '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as const;
export const USDC_DECIMALS = 6;

const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(),
});

export interface UseTestUsdcBalanceReturn {
  /** Human-readable formatted balance string with 2 decimal places (e.g. "1,250.00"). */
  balance: string;
  /** Raw numeric balance or null if not yet loaded. */
  rawBalance: number | null;
  /** Loading state. */
  isLoading: boolean;
  /** Manual refetch trigger. */
  refetch: () => void;
}

export function useTestUsdcBalance(): UseTestUsdcBalanceReturn {
  const { address, isConnected } = useAccount();
  const [directBalance, setDirectBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Wagmi useBalance hook
  const {
    data: wagmiData,
    isLoading: wagmiLoading,
    refetch: wagmiRefetch,
  } = useBalance({
    address: address as `0x${string}` | undefined,
    token: TEST_USDC_ADDRESS,
    chainId: somniaTestnet.id,
    query: {
      enabled: Boolean(isConnected && address),
      refetchInterval: 10_000,
    },
  });

  // Direct viem read fallback (guaranteed on Somnia testnet even if wagmi multicall fails)
  const fetchDirect = useCallback(async () => {
    if (!address || !isConnected) {
      setDirectBalance(null);
      return;
    }
    try {
      setLoading(true);
      const raw = await publicClient.readContract({
        address: TEST_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address as Hex],
      });
      const numeric = Number(raw) / Math.pow(10, USDC_DECIMALS);
      setDirectBalance(numeric);
    } catch {
      // Keep directBalance as is or null
    } finally {
      setLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    if (isConnected && address) {
      fetchDirect();
      const interval = setInterval(fetchDirect, 10_000);
      return () => clearInterval(interval);
    } else {
      setDirectBalance(null);
    }
  }, [isConnected, address, fetchDirect]);

  const rawBalance = useMemo(() => {
    if (wagmiData?.formatted) {
      const parsed = parseFloat(wagmiData.formatted);
      if (!isNaN(parsed)) return parsed;
    }
    return directBalance;
  }, [wagmiData, directBalance]);

  const balance = useMemo(() => {
    if (rawBalance === null) return '0.00';
    return rawBalance.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [rawBalance]);

  const refetch = useCallback(() => {
    wagmiRefetch();
    fetchDirect();
  }, [wagmiRefetch, fetchDirect]);

  return {
    balance,
    rawBalance,
    isLoading: (loading || wagmiLoading) && rawBalance === null,
    refetch,
  };
}
