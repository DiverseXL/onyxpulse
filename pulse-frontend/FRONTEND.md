# Pulse Frontend

> **BTC/ETH direction trading on DreamDEX Event Contracts — Somnia Shannon testnet.**

This is the Next.js (App Router) frontend for Pulse. It provides a landing page with an interactive trade showcase, a full markets lobby, individual market trading pages with order placement, a faucet/onboarding page, and wallet connectivity via MetaMask.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env.local

# 3. Start the dev server (Turbopack)
npm run dev

# 4. Open http://localhost:3000
```

The app boots for read-only browsing without any env vars. The Thirdweb keys are only needed for smart-account wallet features (currently unused in the main flow).

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.3.3 |
| React | React 19 | 19.2.8 |
| Language | TypeScript (strict mode) | 5.x |
| Styling | CSS Modules + Tailwind CSS (preflight disabled) | 3.4.x |
| Animations | Framer Motion | 13.x |
| State / Data | TanStack React Query | 5.x |
| Wallet | wagmi + viem (injected connector only) | wagmi 2.14, viem 2.55 |
| Engine SDK | @somnia-chain/markets-sdk | 0.28.x |
| Icons | lucide-react | 1.34.x |
| Testing | Vitest + @testing-library/react | vitest 4.x |

---

## Project Structure

```
pulse-frontend/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (fonts, Providers wrapper)
│   ├── page.tsx                  # Landing page (/)
│   ├── loading.tsx               # Root loading skeleton (route transitions)
│   ├── not-found.tsx             # 404 page
│   ├── error.tsx                 # Error boundary (page-level)
│   ├── global-error.tsx          # Error boundary (root layout crash)
│   ├── globals.css               # Design system tokens + resets
│   ├── markets/
│   │   ├── page.tsx              # Markets lobby (/markets)
│   │   └── Markets.module.css
│   ├── market/
│   │   └── [id]/
│   │       ├── page.tsx          # Market detail + trading (/market/:id)
│   │       ├── loading.tsx       # Market detail skeleton
│   │       └── MarketDetail.module.css
│   ├── faucet/
│   │   ├── page.tsx              # Faucet / onboarding (/faucet)
│   │   └── Faucet.module.css
│   └── api/                      # Next.js API routes (server-side)
│       ├── markets/route.ts      # Full market listing
│       ├── markets-preview/route.ts  # Landing page preview
│       ├── trade-preview/route.ts    # Single market data
│       └── receipt-preview/route.ts  # Settlement receipts
│
├── components/                   # Shared React components
│   ├── PulseLanding.tsx          # Landing page shell (tab state)
│   ├── HeroV2.tsx                # Hero section with tab bar
│   ├── HeroV2.module.css
│   ├── TradeShowcasePanel.tsx    # Interactive trade/markets/portfolio/receipt panel
│   ├── TradeShowcasePanel.module.css
│   ├── WhyPulseSection.tsx       # Feature cards section
│   ├── WhyPulseSection.module.css
│   ├── Footer.tsx                # Footer with parallax lake scene
│   ├── Footer.module.css
│   ├── MarketsBody.tsx           # Markets tab (landing page list)
│   ├── MarketsBody.module.css
│   ├── PortfolioBody.tsx         # Portfolio tab (sample data)
│   ├── PortfolioBody.module.css
│   ├── ReceiptBody.tsx           # Receipt tab (settlement cards)
│   ├── ReceiptBody.module.css
│   ├── ui/
│   │   └── button.tsx            # Shared Button component (shadcn-style)
│   └── markets/
│       ├── AppChromeNav.tsx      # Sticky nav bar (markets/faucet pages)
│       ├── AppChromeNav.module.css
│       ├── ConnectButton.tsx     # Wallet connect/disconnect button
│       ├── ChainMismatchBanner.tsx   # Wrong-network warning
│       ├── MarketCard.tsx        # Market grid card
│       ├── MarketCard.module.css
│       ├── MarketSkeleton.tsx    # Loading skeleton for market grid
│       ├── MarketSkeleton.module.css
│       └── AnimatedCounter.tsx   # Animated number counter
│
├── lib/                          # Utilities and business logic
│   ├── providers.tsx             # wagmi + React Query + PulseWallet providers
│   ├── motion.ts                 # Framer Motion helpers (reduced-motion safe)
│   ├── utils.ts                  # General utilities (cn, etc.)
│   ├── engine/                   # DreamDEX engine SDK wrappers
│   │   ├── index.ts              # Barrel export
│   │   ├── client.ts             # createPulseClient, createTrader
│   │   ├── markets.ts            # getLiveBinaryMarkets, etc.
│   │   ├── orderbook.ts          # getOrderBookSnapshot
│   │   ├── trading.ts            # Place/cancel orders
│   │   ├── portfolio.ts          # Position queries
│   │   ├── settlement.ts         # Resolution/claim logic
│   │   ├── candles.ts            # Price candle data
│   │   ├── priceFeed.ts          # Spot price queries
│   │   ├── receipt.ts            # buildShareableReceipt
│   │   └── ...                   # (18 modules total)
│   └── wallet/                   # Wallet integration
│       ├── wagmiConfig.ts        # wagmi config (Somnia Shannon chain)
│       ├── PulseWalletContext.tsx # Wallet state context provider
│       ├── usePulseWallet.ts     # Wallet hook
│       ├── placeOrder.ts         # Client-side order placement
│       └── thirdwebAdapter.ts    # Thirdweb → OperatorSigner bridge
│
├── __tests__/                    # Vitest test files
│   ├── utils.test.ts             # Utility tests
│   └── ConnectButton.test.tsx    # Component tests
│
├── vitest.config.ts              # Vitest configuration
├── vitest.setup.ts               # Test setup (jest-dom matchers)
├── .env.example                  # Environment variable template
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.mjs
├── eslint.config.mjs
└── next.config.ts
```

---

## Design System

### Color Tokens (globals.css)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-shadow-mountain` | `#050A05` | Page background, dark surfaces |
| `--color-paper` | `#F2EDE1` | Primary text, light elements |
| `--color-rust` | `#C1502E` | Accent, CTAs, active states |
| `--color-water-deep` | `#0D2B52` | Glass badge backgrounds |
| `--color-water-shadow` | `#0A1F3D` | Deep water tones |
| `--color-moss` | `#1F3D1A` | Green accents |

### Typography Scale

| Token | Size | Usage |
|-------|------|-------|
| `--text-display` | `clamp(2.5rem, 5vw+0.5rem, 5rem)` | Hero headlines (Fraunces 700) |
| `--text-h2` | `1.375rem` | Section headers, market titles |
| `--text-body` | `1rem` | Body copy, subheads |
| `--text-label` | `0.875rem` | Badge pills, tab labels, buttons |
| `--text-small` | `0.8125rem` | Secondary UI labels |
| `--text-micro` | `0.6875rem` | Honesty strips, footnotes, mono labels |

### Font Families

| Variable | Font | Usage |
|----------|------|-------|
| `--font-display` | Fraunces 700/800 | Headlines, wordmarks |
| `--font-body` | Inter 300-600 | Body text, UI elements |
| `--font-mono` | JetBrains Mono 400/500 | Prices, codes, timestamps |

### Spacing Scale (4px base)

| Token | Value |
|-------|-------|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |
| `--space-8` | 64px |

### Opacity Steps

| Token | Value | Usage |
|-------|-------|-------|
| `--opacity-primary` | 1 | Primary text, active labels |
| `--opacity-secondary` | 0.72 | Secondary labels, subtext |
| `--opacity-muted` | 0.48 | Muted context, footnotes |

---

## Pages

### Landing Page (`/`)

The landing page is a single-page showcase built from:

1. **HeroV2** — Centered glass hero with staggered entrance animations, badge pill (Somnia + DreamDEX), headline, CTA button, and a segmented tab bar with a sliding glass pill indicator.

2. **TradeShowcasePanel** — A floating dark glass panel that renders one of four tabs:
   - **Trade** — Interactive price chart (SVG), order ticket (Yes/No, Buy/Sell, amount input, breakdown). Fetches live data from `/api/trade-preview`.
   - **Markets** — Live market list with asset filters, countdown timers, sparklines. Fetches from `/api/markets-preview`.
   - **Portfolio** — Sample portfolio with positions table, P/L chart. Currently hardcoded sample data.
   - **Receipt** — Verified settlement receipts. Fetches from `/api/receipt-preview`.

3. **WhyPulseSection** — Three glassmorphism feature cards (Somnia-Native Speed, Provable Settlement, Simple Wallet Connect) with `whileInView` stagger animations.

4. **Footer** — Parallax 4-layer lake scene (background water, PULSE wordmark, wake trail, bobbing sailboat) with overlaid glass link grid.

### Markets Lobby (`/markets`)

Full markets listing with:
- **Stats strip** — Live window count, settled count, live polling indicator
- **Toolbar** — Search bar, segmented control (Markets/Settled/Archive), sort dropdown
- **Category chips** — All, BTC, ETH, 15m, 1h, Ending soon
- **Market grid** — 3-column card grid (responsive: 2-col → 1-col)
- **Loading skeleton** — Shimmer cards matching real card dimensions

Fetches from `/api/markets` with 15s poll interval via TanStack Query.

### Market Detail (`/market/:id`)

Individual market trading page with:
- **Chart column** — Context line, title, hero price with delta badge, interactive SVG chart with crosshair tooltip, timeframe selector (1H/1D/All)
- **Ticket column** — Side toggle (Yes/No), order type (Buy/Sell), amount input with quick chips, breakdown (quantity, cost, to win), CTA button
- **Outcome footer** — Yes/No outcome rows with prices and delta
- **Wallet integration** — Place orders via wagmi walletClient
- **Loading skeleton** — Full glass-panel shimmer matching the real layout

Fetches from `/api/trade-preview?marketId=...` with 15s poll interval.

### Faucet (`/faucet`)

Onboarding page with two states:
1. **Disconnected** — Prompt to connect wallet
2. **Connected** — Step-by-step flow:
   - Step 1: Get STT (copy address, open faucet, refresh balance)
   - Step 2: Get Test USDC (on-chain faucet call)
   - Ready CTA → Navigate to `/markets`

---

## API Routes

All API routes are server-side (no client env vars needed).

| Route | Purpose | Polling |
|-------|---------|---------|
| `GET /api/markets` | Full market listing with pricing, volumes, sparklines | 15s |
| `GET /api/markets-preview` | Lightweight landing page preview | 20s |
| `GET /api/trade-preview?marketId=...` | Single market data for trade panel | 15s |
| `GET /api/receipt-preview` | Latest settlement receipt | One-time |

Each route creates a `PulseClient` via `createPulseClient()` which connects to the Somnia Shannon testnet SDK.

---

## Wallet Integration

### Architecture

```
wagmi (injected connector)
  → PulseWalletContext (React context)
    → usePulseWallet() hook
      → ConnectButton, faucet, market detail
```

### Key Files

- **`wagmiConfig.ts`** — Defines Somnia Shannon testnet (chain 50312), injected connector only
- **`PulseWalletContext.tsx`** — Provides `connectionStatus`, `address`, `sttBalance`, `connect`, `disconnect`
- **`ConnectButton.tsx`** — Toggle connect/disconnect, shows truncated address + STT balance when connected
- **`placeOrder.ts`** — Client-side order placement via wagmi `walletClient`
- **`thirdwebAdapter.ts`** — Optional Thirdweb smart-account → OperatorSigner bridge

### Hydration Safety

All wagmi-dependent components use a `mounted` guard pattern to avoid SSR/client mismatches:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return <Placeholder />;
```

This is applied in:
- `ConnectButton.tsx`
- `ChainMismatchBanner.tsx`

---

## Engine SDK

The `lib/engine/` directory wraps the `@somnia-chain/markets-sdk` for use in API routes and server-side code.

### Key Functions

```typescript
// Client creation
createPulseClient()        // Shannon testnet client
createPulseMainnetClient() // Mainnet (reserved)

// Market data
getLiveBinaryMarkets(client)
getUpcomingBinaryMarkets(client)
getFinalizedBinaryMarkets(client)

// Orderbook
getOrderBookSnapshot(client, marketAddress, decimals)

// Pricing
getSpotPrice(client, asset)
getFairProbability(spot, strike, secondsRemaining)
getMarketCandles(client, marketAddress, interval, limit)
getMarketVolume(market)

// Settlement
getResolution(client, marketId)
buildShareableReceipt(client, marketId)
```

---

## Styling Conventions

### CSS Modules

Every component has a co-located `.module.css` file. Class names use camelCase:

```css
.marketTitle { ... }
.heroPriceEnter { ... }
.ticketCtaYes { ... }
```

### Inline Styles

Some components (especially those with dynamic values or one-off layouts) use inline styles with CSS custom properties:

```tsx
style={{
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-small)',
  color: 'rgba(242, 237, 225, var(--opacity-secondary))',
}}
```

### Responsive Breakpoints

| Breakpoint | Usage |
|------------|-------|
| 1024px | Footer glass grid → 2 columns |
| 860px | Trade panel grid → single column |
| 768px | Hero section adjustments, WhyPulse → single column |
| 640px | Most mobile adjustments, nav badges hidden |
| 520px | MarketsBody columns hidden, nav labels hidden |
| 430px | Small mobile, reduced spacing |

### Reduced Motion

All animations respect `prefers-reduced-motion: reduce` via:

```typescript
const reducedMotion = useReducedMotionSafe();
// Then gate all animations:
transition={safeTransition(reducedMotion, { duration: MOTION_MEDIUM })}
```

Motion constants are defined in `lib/motion.ts`:
- `MOTION_FAST` — 150ms
- `MOTION_MEDIUM` — 250ms
- `MOTION_SLOW` — 400ms
- `STAGGER_DELAY` — 60ms between children

---

## Testing

```bash
npm test          # Watch mode
npm run test:run  # Single run
```

Tests use Vitest with `jsdom` environment and `@testing-library/react`. Setup file is `vitest.setup.ts`.

### Writing Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock wagmi hooks before importing components
vi.mock('wagmi', () => ({
  useAccount: () => ({ isConnected: false, address: undefined }),
  // ...
}));

import MyComponent from '@/components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` | No | Thirdweb SDK client ID (browser-safe) |
| `THIRDWEB_SECRET_KEY` | No | Thirdweb SDK secret key (server-only) |

The app works fully for read-only browsing without these. They are only needed for Thirdweb smart-account features.

---

## Common Patterns

### Loading States

1. **Route transitions** — `loading.tsx` files in `app/` directories show shimmer skeletons
2. **API data fetching** — TanStack Query `isLoading` triggers in-page skeletons
3. **Shimmer animation** — All skeletons use a consistent shimmer keyframe:
   ```css
   @keyframes shimmer {
     0%, 100% { opacity: 0.25; }
     50% { opacity: 0.6; }
   }
   ```

### Error Handling

1. **`error.tsx`** — Page-level error boundary with "Try again" + "Home" actions
2. **`global-error.tsx`** — Root layout crash handler with its own `<html>`/`<body>`
3. **`not-found.tsx`** — 404 page with "Back to home" CTA
4. **API routes** — Return empty data with 500 status on failure

### Data Fetching

- **Client-side**: TanStack Query with `refetchInterval` for live polling
- **Server-side**: API routes use `createPulseClient()` to fetch from the engine SDK
- **Placeholder data**: `placeholderData: (prev) => prev` keeps previous data visible during refetches

### Wallet Connection Flow

1. User clicks "Connect" in `ConnectButton`
2. wagmi's `useConnect()` triggers MetaMask popup
3. On success, `PulseWalletContext` updates with address + balance
4. `ConnectButton` shows truncated address + STT balance
5. `ChainMismatchBanner` checks if on correct network (chain 50312)

---

## Deployment

```bash
npm run build    # Build for production
npm start        # Start production server
```

The app is a standard Next.js application. Deploy to Vercel, Netlify, or any Node.js hosting.

---

## Troubleshooting

### Hydration Mismatch

If you see "Hydration failed because the server rendered HTML didn't match the client":

1. Check if the component uses wagmi hooks (`useAccount`, `useChainId`, etc.)
2. Add a `mounted` guard pattern (see ConnectButton for reference)
3. Ensure no `Date.now()` or `Math.random()` in render path

### node_modules Corruption

If `npm install` fails with `ENOTEMPTY`:

```bash
rm -rf node_modules
npm install
```

### Build Fails

```bash
npx tsc --noEmit    # Check for type errors
npm run lint        # Check for lint errors
```
