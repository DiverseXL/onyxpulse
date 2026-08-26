import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pulse — Up or Down. That\'s It.',
  description:
    'The fastest way to trade crypto direction — powered by DreamDEX Event Contracts. Gasless trading, transparent settlement, real receipts. Built on Somnia testnet.',
  keywords: ['crypto', 'trading', 'DreamDEX', 'Somnia', 'event contracts', 'direction trading'],
  openGraph: {
    title: 'Pulse — Up or Down. That\'s It.',
    description:
      'Trade crypto direction with DreamDEX Event Contracts on Somnia testnet. Gasless, transparent, and simple.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
