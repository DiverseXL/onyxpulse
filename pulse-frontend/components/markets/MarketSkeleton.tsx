'use client';

import React from 'react';
import styles from './MarketSkeleton.module.css';

export default function MarketSkeleton() {
  return (
    <div
      className={styles.skeletonGrid}
      aria-busy="true"
      aria-label="Loading event contract markets"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={styles.skeletonCard}>
          {/* Top row: badge + status */}
          <div className={styles.topRow}>
            <div className={styles.skeletonPill} />
            <div className={styles.skeletonStatus} />
          </div>

          {/* Question title */}
          <div className={styles.skeletonTitle} />
          <div className={styles.skeletonTitleShort} />

          {/* Price boxes */}
          <div className={styles.priceRow}>
            <div className={styles.skeletonPriceBox} />
            <div className={styles.skeletonPriceBox} />
          </div>

          {/* Bottom row: meta volume + countdown */}
          <div className={styles.bottomRow}>
            <div className={styles.skeletonMeta} />
            <div className={styles.skeletonMetaShort} />
          </div>
        </div>
      ))}
    </div>
  );
}
