'use client';

import React, { useState, useCallback } from 'react';
import HeroV2 from './HeroV2';
import TradeShowcasePanel from './TradeShowcasePanel';

export type ActiveTab = 'trade' | 'markets' | 'portfolio' | 'receipt';

export default function PulseLanding() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('trade');

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh' }}>
      <HeroV2 activeTab={activeTab} onTabChange={handleTabChange} />
      <TradeShowcasePanel activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
