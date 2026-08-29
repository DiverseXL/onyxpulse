'use client';

import { useEffect, useState } from 'react';
import type { Variants, Transition } from 'framer-motion';

/* ─────────────────────────────────────────────
   Motion Tokens — define once, reuse everywhere

   Fast:   150ms — hover/interaction feedback
   Medium: 300ms — tab switches, content transitions
   Slow:   500ms — section/panel entrances
   Stagger: 70ms — between sibling items
   Ease: [0.4, 0, 0.2, 1] — material-style ease-out
───────────────────────────────────────────── */

const EASE = [0.4, 0, 0.2, 1] as const;

export const MOTION_FAST = 0.15;
export const MOTION_MEDIUM = 0.3;
export const MOTION_SLOW = 0.5;
export const STAGGER_DELAY = 0.07;

export const EASE_OUT = EASE;

/* ── Shared transition presets ─────────────── */

export const transitionFast: Transition = {
  duration: MOTION_FAST,
  ease: EASE,
};

export const transitionMedium: Transition = {
  duration: MOTION_MEDIUM,
  ease: EASE,
};

export const transitionSlow: Transition = {
  duration: MOTION_SLOW,
  ease: EASE,
};

/* ── Shared variants ──────────────────────── */

/** Fade + slide up entrance (used by hero items, feature cards, footer) */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

/** Fade + slight scale entrance (used by receipt card) */
export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1 },
};

/** Panel spring entrance */
export const panelSpring: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 120,
      damping: 20,
      mass: 0.8,
    },
  },
};

/* ─────────────────────────────────────────────
   useReducedMotionSafe()

   Returns true when the user prefers reduced motion.
   Used to conditionally disable or simplify animations.
───────────────────────────────────────────── */

export function useReducedMotionSafe(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);

    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/**
 * Returns a transition that respects prefers-reduced-motion.
 * When reduced motion is preferred, duration is set to 0 (instant).
 */
export function safeTransition(
  reduced: boolean,
  base: Transition
): Transition {
  if (reduced) return { duration: 0 };
  return base;
}

/**
 * Returns variants that skip animation when reduced motion is preferred.
 * The "hidden" state becomes identical to "visible" (final state shown immediately).
 */
export function safeVariants(
  reduced: boolean,
  base: Variants
): Variants {
  if (reduced) {
    const visible = base.visible;
    return { hidden: visible, visible };
  }
  return base;
}
