import { describe, it, expect } from 'vitest';
import { formatEther } from 'viem';

describe('formatEther', () => {
  it('formats zero correctly', () => {
    expect(formatEther(0n)).toBe('0');
  });

  it('formats 1 ether correctly', () => {
    expect(formatEther(1000000000000000000n)).toBe('1');
  });

  it('formats fractional amounts', () => {
    expect(formatEther(1500000000000000000n)).toBe('1.5');
  });
});

describe('price formatting', () => {
  it('converts cents to display string', () => {
    const cents = 59;
    expect(`${cents}¢`).toBe('59¢');
  });

  it('complements YES to NO', () => {
    const yesCents = 64;
    const noCents = 100 - yesCents;
    expect(noCents).toBe(36);
  });
});
