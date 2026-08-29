'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Zap, ShieldCheck, Wallet } from 'lucide-react';
import styles from './WhyPulseSection.module.css';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  STAGGER_DELAY,
  MOTION_SLOW,
  EASE_OUT,
} from '@/lib/motion';

interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: <Zap size={20} aria-hidden="true" />,
    title: 'Somnia-Native Speed',
    body: 'Sub-second finality and low fees on Somnia\'s high-performance L1. No rollup complexity required \u2014 orders confirm fast because the base chain is fast.',
  },
  {
    icon: <ShieldCheck size={20} aria-hidden="true" />,
    title: 'Provable Settlement',
    body: 'Every market resolves through DreamDEX\'s on-chain oracle \u2014 never an admin decision. Every payout is independently verifiable: check the settlement transaction and oracle reference yourself, no trust required.',
  },
  {
    icon: <Wallet size={20} aria-hidden="true" />,
    title: 'Gasless Trading',
    body: 'Trade without holding STT. Pulse sponsors gas through smart wallet infrastructure \u2014 connect with email or social login and trade immediately, no token top-up needed.',
  },
];

export default function WhyPulseSection() {
  const reducedMotion = useReducedMotionSafe();

  const gridContainerVariants = safeVariants(reducedMotion, {
    hidden: {},
    visible: { transition: { staggerChildren: STAGGER_DELAY } },
  });
  const cardItemVariants = safeVariants(reducedMotion, {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: safeTransition(reducedMotion, {
        duration: MOTION_SLOW,
        ease: EASE_OUT,
      }),
    },
  });

  return (
    <section className={styles.section} aria-labelledby="why-pulse-heading">
      {/* Section eyebrow */}
      <motion.span
        className={styles.eyebrow}
        id="why-pulse-heading"
        variants={safeVariants(reducedMotion, fadeSlideUp)}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        transition={safeTransition(reducedMotion, {
          duration: MOTION_SLOW,
          ease: EASE_OUT,
        })}
      >
        WHY PULSE
      </motion.span>

      {/* 3-column feature grid — staggered whileInView */}
      <motion.div
        className={styles.grid}
        variants={gridContainerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
      >
        {FEATURES.map((feature) => (
          <motion.article
            key={feature.title}
            className={styles.card}
            variants={cardItemVariants}
          >
            <div className={styles.cardIcon} aria-hidden="true">
              {feature.icon}
            </div>
            <h3 className={styles.cardTitle}>{feature.title}</h3>
            <p className={styles.cardBody}>{feature.body}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}
