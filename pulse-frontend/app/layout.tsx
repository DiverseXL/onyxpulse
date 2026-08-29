import type { Metadata } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/lib/providers';
import './globals.css';

/* ── Google Fonts via next/font ─────────────
   Loaded at build time, no render-blocking request.
   Each font injects its own CSS variable.
────────────────────────────────────────────── */
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Pulse — Up or Down. That's It.",
  description:
    'The fastest way to trade crypto direction — powered by DreamDEX Event Contracts on Somnia testnet. Gasless trading, transparent settlement, verifiable on-chain.',
  keywords: ['crypto', 'trading', 'DreamDEX', 'Somnia', 'event contracts', 'direction trading', 'BTC', 'ETH'],
  openGraph: {
    title: "Pulse — Up or Down. That's It.",
    description:
      'Gasless BTC/ETH direction trading on DreamDEX Event Contracts. Zero fees, capped risk, verifiable on-chain.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
