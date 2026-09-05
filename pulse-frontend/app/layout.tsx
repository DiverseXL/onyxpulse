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
    'The fastest way to trade crypto direction — powered by DreamDEX Event Contracts on Somnia testnet. Simple wallet connect, transparent settlement, verifiable on-chain.',
  keywords: ['crypto', 'trading', 'DreamDEX', 'Somnia', 'event contracts', 'direction trading', 'BTC', 'ETH'],
  openGraph: {
    title: "Pulse — Up or Down. That's It.",
    description:
      'BTC/ETH direction trading on DreamDEX Event Contracts. Capped risk, verifiable on-chain settlement.',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
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
