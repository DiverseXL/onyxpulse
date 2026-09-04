/**
 * Amount validation tests.
 *
 * Covers every rejected input case for the /market/[id] trade amount field:
 * negative, zero, NaN, scientific notation, over-precision, and balance warning.
 */
import { describe, it, expect } from 'vitest';
import { validateAmount } from '@/lib/validateAmount';

describe('validateAmount', () => {
  const defaultOpts = { allowZero: false, decimals: 6, fieldLabel: 'Amount' };

  // ── Valid inputs ──────────────────────────────────────────────────────────

  describe('valid inputs', () => {
    it('accepts positive integer', () => {
      const result = validateAmount('100', defaultOpts);
      expect(result.valid).toBe(true);
      expect(result.error).toBe('');
    });

    it('accepts positive decimal within precision', () => {
      const result = validateAmount('10.5', defaultOpts);
      expect(result.valid).toBe(true);
    });

    it('accepts maximum precision (6 decimals for USDC)', () => {
      const result = validateAmount('10.123456', defaultOpts);
      expect(result.valid).toBe(true);
    });
  });

  // ── Negative numbers ─────────────────────────────────────────────────────

  describe('negative numbers', () => {
    it('rejects negative integer', () => {
      const result = validateAmount('-100', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be negative');
    });

    it('rejects negative decimal', () => {
      const result = validateAmount('-0.5', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be negative');
    });
  });

  // ── Zero ─────────────────────────────────────────────────────────────────

  describe('zero', () => {
    it('rejects zero when allowZero is false', () => {
      const result = validateAmount('0', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than zero');
    });

    it('accepts zero when allowZero is true', () => {
      const result = validateAmount('0', { ...defaultOpts, allowZero: true });
      expect(result.valid).toBe(true);
    });

    it('rejects "0.0" when allowZero is false', () => {
      const result = validateAmount('0.0', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than zero');
    });
  });

  // ── NaN / non-numeric ───────────────────────────────────────────────────

  describe('NaN / non-numeric', () => {
    it('rejects empty string', () => {
      const result = validateAmount('', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('rejects non-numeric text', () => {
      const result = validateAmount('abc', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid number');
    });

    it('rejects mixed text and numbers', () => {
      const result = validateAmount('10abc', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid number');
    });

    it('rejects "NaN"', () => {
      const result = validateAmount('NaN', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid number');
    });

    it('rejects "Infinity"', () => {
      const result = validateAmount('Infinity', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid number');
    });
  });

  // ── Scientific notation ──────────────────────────────────────────────────

  describe('scientific notation', () => {
    it('rejects "1e10"', () => {
      const result = validateAmount('1e10', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('scientific notation');
    });

    it('rejects "5E-3"', () => {
      const result = validateAmount('5E-3', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('scientific notation');
    });

    it('rejects "1.5e+2"', () => {
      const result = validateAmount('1.5e+2', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('scientific notation');
    });
  });

  // ── Over-precision ───────────────────────────────────────────────────────

  describe('over-precision', () => {
    it('rejects 7 decimal places with decimals=6', () => {
      const result = validateAmount('10.1234567', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('decimal places');
    });

    it('rejects 18 decimal places with decimals=6', () => {
      const result = validateAmount('0.000000000000000001', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('decimal places');
    });

    it('accepts exactly 6 decimal places with decimals=6', () => {
      const result = validateAmount('10.123456', defaultOpts);
      expect(result.valid).toBe(true);
    });
  });

  // ── Balance warning ──────────────────────────────────────────────────────

  describe('balance warning', () => {
    it('warns when amount exceeds 10x balance', () => {
      const result = validateAmount('1000', {
        ...defaultOpts,
        walletBalance: 50,
      });
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('larger than your available balance');
    });

    it('does not warn when amount is within balance', () => {
      const result = validateAmount('10', {
        ...defaultOpts,
        walletBalance: 100,
      });
      expect(result.valid).toBe(true);
      expect(result.warning).toBe('');
    });

    it('does not warn when walletBalance is not provided', () => {
      const result = validateAmount('1000000', defaultOpts);
      expect(result.valid).toBe(true);
      expect(result.warning).toBe('');
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('rejects whitespace-only input', () => {
      const result = validateAmount('   ', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('rejects input with leading/trailing spaces that are non-numeric', () => {
      const result = validateAmount('  abc  ', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid number');
    });

    it('rejects multiple decimal points', () => {
      const result = validateAmount('10.5.3', defaultOpts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid number');
    });
  });
});
