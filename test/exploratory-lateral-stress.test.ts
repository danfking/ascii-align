import { describe, it, expect } from 'vitest';
import { fixAsciiAlign, checkAlignment } from '../src/fix.js';
import { detectRegions } from '../src/detect.js';

function assertSoundOutput(input: string, result: string, label: string) {
  expect(result, `${label}: no undefined`).not.toContain('undefined');
  expect(fixAsciiAlign(result), `${label}: idempotent`).toBe(result);
}

describe('lateral box stress tests', () => {
  it('1. four side-by-side boxes of equal height', () => {
    const input = [
      '+-----+ +-----+ +-----+ +-----+',
      '| aaa | | bbb | | ccc | | ddd |',
      '| aa  | | bb  | | cc  | | dd  |',
      '+-----+ +-----+ +-----+ +-----+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '4-equal-boxes');
    // Should detect 4 lateral regions
    const regions = detectRegions(input);
    const lateral = regions.filter(r => r.startCol !== undefined);
    expect(lateral.length).toBe(4);
    // Output should preserve all content
    expect(result).toContain('aaa');
    expect(result).toContain('ddd');
  });

  it('2. five lateral boxes with varying widths (3-char to 20-char content)', () => {
    const input = [
      '+-----+ +-------+ +---+ +------------------------+ +----------+',
      '| hi  | | hello | | x | | this is long content   | | medium   |',
      '+-----+ +-------+ +---+ +------------------------+ +----------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '5-varying-width');
    const regions = detectRegions(input);
    const lateral = regions.filter(r => r.startCol !== undefined);
    expect(lateral.length).toBe(5);
  });

  it('3. empty lateral boxes (border-only, no content lines)', () => {
    const input = [
      '+-----+ +-----+ +-----+',
      '+-----+ +-----+ +-----+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'empty-boxes');
  });

  it('4. single-content-line lateral boxes', () => {
    const input = [
      '+-------+ +--------+ +------+',
      '| alpha | | bravo  | | char |',
      '+-------+ +--------+ +------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'single-line-content');
    // All content should be preserved
    expect(result).toContain('alpha');
    expect(result).toContain('bravo');
    expect(result).toContain('char');
  });

  it('5. extreme height differential: 1 vs 10+ content lines', () => {
    const tallLines = [];
    for (let i = 0; i < 12; i++) {
      tallLines.push(`| line ${String(i).padEnd(2)} |`);
    }
    const input = [
      '+------+ +----------+',
      '| tiny | ' + tallLines[0],
      '+------+ ' + tallLines[1],
      '         ' + tallLines[2],
      '         ' + tallLines[3],
      '         ' + tallLines[4],
      '         ' + tallLines[5],
      '         ' + tallLines[6],
      '         ' + tallLines[7],
      '         ' + tallLines[8],
      '         ' + tallLines[9],
      '         ' + tallLines[10],
      '         ' + tallLines[11],
      '         +----------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'extreme-height-diff');
    expect(result).toContain('tiny');
    expect(result).toContain('line 11');
  });

  it('6. three boxes where middle is tallest (both sides end early)', () => {
    const input = [
      '+------+ +----------+ +------+',
      '| left | | middle   | | rght |',
      '+------+ | m line 2 | +------+',
      '         | m line 3 |',
      '         | m line 4 |',
      '         +----------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'middle-tallest');
    expect(result).toContain('left');
    expect(result).toContain('middle');
    expect(result).toContain('rght');
    expect(result).toContain('m line 4');
  });

  it('7. very large gap between lateral boxes (20+ spaces)', () => {
    const input = [
      '+------+                         +------+',
      '| box1 |                         | box2 |',
      '+------+                         +------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'large-gap');
    // The gap should be preserved (at least 20 spaces)
    const lines = result.split('\n');
    for (const line of lines) {
      const match = line.match(/(\+|[|])\s{10,}(\+|[|])/);
      expect(match, 'large gap preserved').toBeTruthy();
    }
  });

  it('8. zero-gap lateral boxes (immediately adjacent)', () => {
    const input = [
      '+-----++-----++-----+',
      '| aaa || bbb || ccc |',
      '+-----++-----++-----+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'zero-gap');
  });

  it('9. deeply nested lateral boxes within lateral boxes', () => {
    const input = [
      '+-------------------+ +-------------------+',
      '| Outer A           | | Outer B           |',
      '| +-----+ +-----+  | | +-----+ +-----+  |',
      '| | i-a | | i-b |  | | | i-c | | i-d |  |',
      '| +-----+ +-----+  | | +-----+ +-----+  |',
      '+-------------------+ +-------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'nested-lateral');
    // All inner box content should survive
    expect(result).toContain('i-a');
    expect(result).toContain('i-b');
    expect(result).toContain('i-c');
    expect(result).toContain('i-d');
    expect(result).toContain('Outer A');
    expect(result).toContain('Outer B');
  });

  it('10. lateral boxes with internal horizontal dividers (mid-borders)', () => {
    const input = [
      '+---------+ +---------+',
      '| header1 | | header2 |',
      '+---------+ +---------+',
      '| body 1  | | body 2  |',
      '| body 1b | | body 2b |',
      '+---------+ +---------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'mid-border');
    expect(result).toContain('header1');
    expect(result).toContain('header2');
    expect(result).toContain('body 1');
    expect(result).toContain('body 2b');
  });
});
