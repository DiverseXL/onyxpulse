'use client';

import React, { useState, useCallback } from 'react';
import HeroV2 from './HeroV2';
import TradeShowcasePanel from './TradeShowcasePanel';
import WhyPulseSection from './WhyPulseSection';
import Footer from './Footer';

export type ActiveTab = 'trade' | 'markets' | 'portfolio' | 'receipt';

export default function PulseLanding() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('trade');

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
  }, []);

  return (
    <div className="pulse-landing-wrapper">
      {/* Background image — covers entire scrollable area (hero + panel overlap) */}
      <div className="pulse-landing-bg" aria-hidden="true" />
      <div className="pulse-landing-overlay" aria-hidden="true" />

      <HeroV2 activeTab={activeTab} onTabChange={handleTabChange} />
      <TradeShowcasePanel activeTab={activeTab} onTabChange={handleTabChange} />
      <WhyPulseSection />
      <Footer />
    </div>
  );
}
