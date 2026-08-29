'use client';

import React, { useRef } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';
import styles from './Footer.module.css';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  STAGGER_DELAY,
  MOTION_SLOW,
  EASE_OUT,
} from '@/lib/motion';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
  /** True for anchor links that scroll to a section on this page */
  internal?: boolean;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

const COLUMNS: FooterColumn[] = [
  {
    heading: 'SOCIALS',
    links: [
      {
        label: 'Github',
        href: 'https://github.com',
        external: true,
      },
    ],
  },
  {
    heading: 'QUICK LINKS',
    links: [
      { label: 'Trade', href: '#trade-preview-panel', internal: true },
      { label: 'Markets', href: '#trade-preview-panel', internal: true },
      { label: 'Portfolio', href: '#trade-preview-panel', internal: true },
      { label: 'Receipt', href: '#trade-preview-panel', internal: true },
    ],
  },
  {
    heading: 'DOCUMENTS',
    links: [
      { label: 'How to Trade', href: '#' },
      { label: 'Why DreamDEX Event Contracts?', href: '#' },
      { label: 'SDK Feedback Report', href: '#' },
      { label: 'Technical Docs', href: '#' },
    ],
  },
  {
    heading: 'RESOURCES',
    links: [
      {
        label: 'Contract on Explorer',
        href: 'https://shannon-explorer.somnia.network',
        external: true,
      },
      {
        label: 'DreamDEX Docs',
        href: 'https://docs.dreamdex.io',
        external: true,
      },
      {
        label: 'Somnia Network',
        href: 'https://somnia.network',
        external: true,
      },
      {
        label: 'Somnia Docs',
        href: 'https://docs.somnia.network',
        external: true,
      },
    ],
  },
];

export default function Footer() {
  const reducedMotion = useReducedMotionSafe();
  const footerRef = useRef<HTMLElement>(null);

  // Parallax scroll tracking across the footer
  const { scrollYProgress } = useScroll({
    target: footerRef,
    offset: ['start end', 'end end'],
  });

  // Layer 1 (background water) drifts slower (~0.3x)
  // Layer 3 & 4 (wake & boat) drift with foreground speed (~0.6x)
  // Layer 2 (PULSE wordmark) remains static relative to section
  const bgYMotion = useTransform(scrollYProgress, [0, 1], ['-4%', '4%']);
  const fgYMotion = useTransform(scrollYProgress, [0, 1], ['6%', '-3%']);

  const bgY = reducedMotion ? 0 : bgYMotion;
  const fgY = reducedMotion ? 0 : fgYMotion;

  return (
    <footer className={styles.footer} ref={footerRef} role="contentinfo">
      {/* ──────────────────────────────────────────────────────────
          DEPTH-EFFECT SCENE: 4-LAYER OCCLUSION SANDWICH + BOBBING BOAT
          Layer 1 (z: 0):  footer-bg.png (deep blue lake water, shoreline)
          Layer 2 (z: 10): Semantic "PULSE" wordmark submerged in water
          Layer 3 (z: 20): footer-fg-wake.png (wake spray trail only)
          Layer 4 (z: 30): boat-icon.png (bobbing & rocking sailboat)
         ────────────────────────────────────────────────────────── */}
      <div className={styles.sceneLayers} aria-hidden="true">
        {/* Layer 1: Background Water Scene */}
        <motion.div
          className={styles.layerBg}
          style={{ y: bgY }}
        >
          <Image
            src="/footer-bg.png"
            alt=""
            fill
            sizes="100vw"
            className={styles.sceneImage}
            priority={false}
          />
        </motion.div>

        {/* Layer 2: Semantic PULSE Wordmark */}
        <div className={styles.layerText}>
          <span className={styles.depthWordmark}>PULSE</span>
        </div>

        {/* Layer 3: Foreground Wake Trail (Spray crossing over text) */}
        <motion.div
          className={styles.layerFg}
          style={{ y: fgY }}
          animate={
            reducedMotion
              ? { opacity: 1 }
              : {
                  opacity: [0.86, 1, 0.9, 1, 0.86],
                }
          }
          transition={
            reducedMotion
              ? { duration: 0 }
              : {
                  duration: 3.9,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }
          }
        >
          <Image
            src="/footer-fg-wake.png"
            alt=""
            fill
            sizes="100vw"
            className={styles.sceneImage}
            priority={false}
          />

          {/* Gentle water shimmer sweep overlay */}
          {!reducedMotion && <div className={styles.waterShimmerSweep} />}
        </motion.div>

        {/* Layer 4: Sailboat Cutout with Ambient Bobbing & Rocking */}
        <motion.div
          className={styles.layerBoatAnchor}
          style={{ y: fgY }}
        >
          <motion.div
            className={styles.boatWrapper}
            animate={
              reducedMotion
                ? { y: 0, rotate: 0 }
                : {
                    y: [-3.5, 3.5, -3.5],
                    rotate: [-1.4, 1.4, -1.4],
                  }
            }
            transition={
              reducedMotion
                ? { duration: 0 }
                : {
                    duration: 2.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }
            }
          >
            <Image
              src="/boat-icon.png"
              alt="Sailboat on the water"
              width={46}
              height={50}
              className={styles.boatImage}
              priority={false}
            />
          </motion.div>
        </motion.div>

        {/* Bottom subtle dark vignette to enhance glass card readability */}
        <div className={styles.bottomVignette} />
      </div>

      {/* Accessible screen-reader heading for navigation */}
      <h2 className={styles.srOnly}>Pulse Footer Navigation</h2>

      {/* ──────────────────────────────────────────────────────────
          LAYER 5 (z: 40): GLASSMORPHIC OVERLAID LINK GRID & STATUS BAR
         ────────────────────────────────────────────────────────── */}
      <div className={styles.overlaidContent}>
        {/* 4-column glassmorphism link grid — staggered whileInView */}
        <motion.div
          className={styles.glassGrid}
          variants={safeVariants(reducedMotion, {
            hidden: {},
            visible: { transition: { staggerChildren: STAGGER_DELAY } },
          })}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {COLUMNS.map((col) => (
            <motion.div
              key={col.heading}
              className={styles.glassColumn}
              variants={safeVariants(reducedMotion, {
                hidden: { opacity: 0, y: 12 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: safeTransition(reducedMotion, {
                    duration: MOTION_SLOW,
                    ease: EASE_OUT,
                  }),
                },
              })}
            >
              <p className={styles.columnHeading}>{col.heading}</p>
              <ul className={styles.linkList}>
                {col.links.map((link) => (
                  <li key={link.label} className={styles.linkItem}>
                    <a
                      href={link.href}
                      className={styles.link}
                      {...(link.external
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom status bar */}
        <div className={styles.bottomBar}>
          <span className={styles.bottomText}>
            Built on Somnia &middot; Powered by DreamDEX
          </span>
          <span className={styles.bottomText}>
            Shannon Testnet
          </span>
        </div>
      </div>
    </footer>
  );
}
