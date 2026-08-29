'use client';

import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useReducedMotionSafe, MOTION_SLOW, EASE_OUT } from '@/lib/motion';

interface AnimatedCounterProps {
  value: number;
  className?: string;
}

export default function AnimatedCounter({ value, className }: AnimatedCounterProps) {
  const reducedMotion = useReducedMotionSafe();
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayValue(value);
      return;
    }

    const controls = animate(count, value, {
      duration: MOTION_SLOW,
      ease: EASE_OUT,
      onUpdate: (latest) => setDisplayValue(Math.round(latest)),
    });

    return () => controls.stop();
  }, [value, count, reducedMotion]);

  if (reducedMotion) {
    return <span className={className}>{value}</span>;
  }

  return (
    <motion.span className={className}>
      {displayValue}
    </motion.span>
  );
}
