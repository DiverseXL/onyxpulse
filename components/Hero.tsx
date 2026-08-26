'use client';

import styles from './Hero.module.css';

export default function Hero() {
  return (
    <main className={styles.hero} id="hero">
      {/* Full-bleed background image */}
      <div className={styles.bg} aria-hidden="true" />

      {/* Gradient overlay — dark at bottom for text legibility */}
      <div className={styles.overlay} aria-hidden="true" />

      {/* Content stack — positioned over the dark shadow-mountain area */}
      <div className={styles.content}>
        {/* Eyebrow label */}
        <p className={styles.eyebrow} aria-label="Built on Somnia × DreamDEX">
          SOMNIA × DREAMDEX
        </p>

        {/* Primary headline */}
        <h1 className={styles.headline}>
          <span className={styles.headlineLine}>Up or Down.</span>
          <span className={styles.headlineLine}>That&apos;s It.</span>
        </h1>

        {/* Subheadline */}
        <p className={styles.subheadline}>
          The fastest way to trade crypto direction — powered by DreamDEX Event
          Contracts. Gasless trading, transparent settlement, real receipts.
        </p>

        {/* Wake-line signature motif */}
        <div className={styles.wakeLineWrapper} aria-hidden="true">
          <svg
            className={styles.wakeLine}
            width="180"
            height="2"
            viewBox="0 0 180 2"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line
              x1="0"
              y1="1"
              x2="180"
              y2="1"
              stroke="var(--color-rust)"
              strokeWidth="2"
              strokeLinecap="round"
              className={styles.wakeLineStroke}
            />
          </svg>
        </div>

        {/* CTA button */}
        <a
          href="/app"
          className={styles.cta}
          id="enter-app-cta"
          role="button"
          aria-label="Enter the Pulse trading app"
        >
          <span>Enter App</span>
          <svg
            className={styles.ctaArrow}
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M3.75 9H14.25M14.25 9L9.75 4.5M14.25 9L9.75 13.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>
    </main>
  );
}
