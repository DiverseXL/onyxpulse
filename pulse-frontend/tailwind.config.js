/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  corePlugins: {
    // Our CSS module globals.css handles all base resets.
    // Preflight would fight with our custom design tokens.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        'water-deep':      '#0D2B52',
        'water-shadow':    '#0A1F3D',
        'moss':            '#1F3D1A',
        'shadow-mountain': '#050A05',
        'paper':           '#F2EDE1',
        'rust':            '#C1502E',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        body:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-jetbrains-mono)', 'monospace'],
      },
      borderRadius: {
        pill: '9999px',
      },
    },
  },
  plugins: [],
};
