import { describe, it, expect } from 'vitest';
import { visualWidth, expandTabs } from '../src/measure.js';

describe('expandTabs', () => {
  it('expands a single tab to 8 spaces', () => {
    expect(expandTabs('\t')).toBe('        ');
  });

  it('expands tab after characters to next tab stop', () => {
    expect(expandTabs('ab\t')).toBe('ab      ');
  });

  it('expands two tabs to 16 columns', () => {
    expect(expandTabs('\t\t')).toBe('                ');
  });

  it('expands tab between characters correctly', () => {
    // a=1 col, tab fills to col 8, b at col 8
    expect(expandTabs('a\tb')).toBe('a       b');
  });
});

describe('visualWidth with tabs', () => {
  it('counts a single tab as 8 columns', () => {
    expect(visualWidth('\t')).toBe(8);
  });

  it('counts tab after characters to next tab stop', () => {
    expect(visualWidth('ab\t')).toBe(8);
  });

  it('counts two tabs as 16 columns', () => {
    expect(visualWidth('\t\t')).toBe(16);
  });

  it('counts tab between characters correctly', () => {
    expect(visualWidth('a\tb')).toBe(9);
  });
});
