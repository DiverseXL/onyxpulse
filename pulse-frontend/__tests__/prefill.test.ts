import { describe, it, expect } from 'vitest';
import { parsePrefillParams } from '@/lib/prefill';

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('parsePrefillParams', () => {
  it('parses side + amount from a draft_trade_link URL', () => {
    expect(parsePrefillParams(params('prefillSide=yes&prefillAmount=12.5'))).toEqual({
      side: 'yes',
      amount: 12.5,
    });
    expect(parsePrefillParams(params('prefillSide=no&prefillAmount=25'))).toEqual({
      side: 'no',
      amount: 25,
    });
  });

  it('defaults the side to yes when only an amount is present', () => {
    expect(parsePrefillParams(params('prefillAmount=50'))).toEqual({
      side: 'yes',
      amount: 50,
    });
  });

  it('keeps amount null when only a side is present', () => {
    expect(parsePrefillParams(params('prefillSide=no'))).toEqual({
      side: 'no',
      amount: null,
    });
  });

  it('returns null when neither param is present', () => {
    expect(parsePrefillParams(params(''))).toBeNull();
    expect(parsePrefillParams(new URLSearchParams())).toBeNull();
  });

  it('rejects invalid sides', () => {
    expect(parsePrefillParams(params('prefillSide=long&prefillAmount=10'))).toEqual({
      side: 'yes',
      amount: 10,
    });
  });

  it('rejects malformed or out-of-range amounts', () => {
    expect(parsePrefillParams(params('prefillSide=yes&prefillAmount=0'))).toEqual({
      side: 'yes',
      amount: null,
    });
    expect(parsePrefillParams(params('prefillSide=yes&prefillAmount=-5'))).toEqual({
      side: 'yes',
      amount: null,
    });
    expect(parsePrefillParams(params('prefillSide=yes&prefillAmount=abc'))).toEqual({
      side: 'yes',
      amount: null,
    });
    expect(parsePrefillParams(params('prefillSide=yes&prefillAmount=999999999999'))).toEqual({
      side: 'yes',
      amount: null,
    });
    expect(parsePrefillParams(params('prefillSide=yes&prefillAmount=1.2345678'))).toEqual({
      side: 'yes',
      amount: null,
    });
  });
});