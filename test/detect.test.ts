import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectRegions, isBorderLine, isContentLine, detectStyle, findBorderSegments } from '../src/detect.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('isBorderLine', () => {
  it('detects ASCII borders', () => {
    expect(isBorderLine('+--------+')).toBe(true);
    expect(isBorderLine('+--+--+')).toBe(true);
  });

  it('detects Unicode borders', () => {
    expect(isBorderLine('┌──────┐')).toBe(true);
    expect(isBorderLine('└──────┘')).toBe(true);
    expect(isBorderLine('╔══════╗')).toBe(true);
  });

  it('rejects non-border lines', () => {
    expect(isBorderLine('| hello |')).toBe(false);
    expect(isBorderLine('just text')).toBe(false);
    expect(isBorderLine('')).toBe(false);
  });
});

describe('isContentLine', () => {
  it('detects content with vertical delimiters', () => {
    expect(isContentLine('| hello |')).toBe(true);
    expect(isContentLine('│ world │')).toBe(true);
    expect(isContentLine('║ test  ║')).toBe(true);
  });

  it('rejects lines without vertical delimiters', () => {
    expect(isContentLine('+----+')).toBe(false);
    expect(isContentLine('plain text')).toBe(false);
  });
});

describe('detectStyle', () => {
  it('detects ASCII style', () => {
    expect(detectStyle('+----+')).toBe('ascii');
    expect(detectStyle('| hi |')).toBe('ascii');
  });

  it('detects light Unicode style', () => {
    expect(detectStyle('┌────┐')).toBe('light');
    expect(detectStyle('│ hi │')).toBe('light');
  });

  it('detects double Unicode style', () => {
    expect(detectStyle('╔════╗')).toBe('double');
  });

  it('detects heavy Unicode style', () => {
    expect(detectStyle('┏━━━━┓')).toBe('heavy');
  });
});

describe('findBorderSegments', () => {
  it('returns one segment for a single border', () => {
    const segments = findBorderSegments('+--------+');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ start: 0, end: 9 });
  });

  it('returns multiple segments for lateral borders', () => {
    const segments = findBorderSegments('+------+  +------+');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ start: 0, end: 7 });
    expect(segments[1]).toEqual({ start: 10, end: 17 });
  });

  it('returns three segments for three lateral Unicode borders', () => {
    const segments = findBorderSegments('┌──────┐  ┌──────┐  ┌──────┐');
    expect(segments).toHaveLength(3);
  });

  it('ignores short runs (less than 3 chars)', () => {
    const segments = findBorderSegments('+-  +------+');
    expect(segments).toHaveLength(1);
    expect(segments[0].start).toBe(4);
  });

  it('handles indented borders', () => {
    const segments = findBorderSegments('  +------+  +------+');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ start: 2, end: 9 });
    expect(segments[1]).toEqual({ start: 12, end: 19 });
  });
});

describe('detectRegions', () => {
  it('detects an ASCII box', () => {
    const input = fixture('ascii-box-misaligned.txt');
    const regions = detectRegions(input);
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('box');
    expect(regions[0].style).toBe('ascii');
  });

  it('detects a Unicode box', () => {
    const input = fixture('unicode-box-misaligned.txt');
    const regions = detectRegions(input);
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('box');
    expect(regions[0].style).toBe('light');
  });

  it('detects a markdown table', () => {
    const input = fixture('markdown-table-misaligned.txt');
    const regions = detectRegions(input);
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('table');
    expect(regions[0].style).toBe('markdown');
  });

  it('detects multiple regions in mixed content', () => {
    const input = fixture('mixed-content.txt');
    const regions = detectRegions(input);
    expect(regions).toHaveLength(2);
    expect(regions[0].type).toBe('box');
    expect(regions[1].type).toBe('table');
  });

  it('returns empty for plain text', () => {
    const regions = detectRegions('Hello world\nNo boxes here\nJust text');
    expect(regions).toHaveLength(0);
  });

  it('detects two lateral ASCII boxes as separate regions', () => {
    const input = fixture('lateral-ascii-boxes.txt');
    const regions = detectRegions(input);
    expect(regions).toHaveLength(2);
    expect(regions[0].type).toBe('box');
    expect(regions[0].style).toBe('ascii');
    expect(regions[1].type).toBe('box');
    expect(regions[1].style).toBe('ascii');
    // Each should have column ranges
    expect(regions[0].startCol).toBeDefined();
    expect(regions[0].endCol).toBeDefined();
    expect(regions[1].startCol).toBeDefined();
    expect(regions[1].endCol).toBeDefined();
    // First box starts at column 0
    expect(regions[0].startCol).toBe(0);
    // Second box starts after the gap
    expect(regions[1].startCol).toBeGreaterThan(regions[0].endCol!);
  });

  it('detects three lateral Unicode boxes as separate regions', () => {
    const input = fixture('lateral-unicode-boxes.txt');
    const regions = detectRegions(input);
    expect(regions).toHaveLength(3);
    for (const r of regions) {
      expect(r.type).toBe('box');
      expect(r.style).toBe('light');
      expect(r.startCol).toBeDefined();
      expect(r.endCol).toBeDefined();
    }
    // Regions should be ordered by startCol
    expect(regions[0].startCol!).toBeLessThan(regions[1].startCol!);
    expect(regions[1].startCol!).toBeLessThan(regions[2].startCol!);
  });

  it('detects lateral boxes in DB schema (agent2-prompt1)', () => {
    const input = readFileSync(join(__dirname, 'generated', 'agent2-prompt1.txt'), 'utf-8');
    const regions = detectRegions(input);
    expect(regions).toHaveLength(3);
    for (const r of regions) {
      expect(r.type).toBe('box');
      expect(r.style).toBe('light');
      expect(r.startCol).toBeDefined();
      expect(r.endCol).toBeDefined();
    }
  });

  it('detects lateral boxes in class hierarchy (agent3-prompt3)', () => {
    const input = readFileSync(join(__dirname, 'generated', 'agent3-prompt3.txt'), 'utf-8');
    const regions = detectRegions(input);
    // Should detect: 1 single box (Animal), 2 lateral (Mammal+Bird), 3 lateral (Dog+Cat+Eagle)
    // = 6 total boxes
    expect(regions.length).toBeGreaterThanOrEqual(5);
    // The lateral boxes should have startCol defined
    const lateralRegions = regions.filter(r => r.startCol !== undefined);
    expect(lateralRegions.length).toBeGreaterThanOrEqual(4);
  });
});
