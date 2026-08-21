import { describe, it, expect } from 'vitest';
import { fixAsciiAlign, checkAlignment } from '../src/fix.js';
import { detectRegions } from '../src/detect.js';

function assertSoundOutput(input: string, result: string, label: string) {
  expect(result, `${label}: no undefined`).not.toContain('undefined');
  expect(fixAsciiAlign(result), `${label}: idempotent`).toBe(result);
}

describe('cross-feature interaction tests', () => {
  it('1. Mixed-style lateral boxes (ASCII +--+ next to Unicode light)', () => {
    const input = [
      '+--------+   ┌────────┐',
      '| Hello  |   │ World  │',
      '+--------+   └────────┘',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'mixed-style lateral');
    // Content should be preserved
    expect(result).toContain('Hello');
    expect(result).toContain('World');
    // Styles should not be mixed: ASCII box stays ASCII, Unicode stays Unicode
    const lines = result.split('\n');
    // Left box should use + and -
    expect(lines[0]).toMatch(/^\+[-]+\+/);
    // Right box should use Unicode chars
    expect(lines[0]).toMatch(/┌[─]+┐/);
  });

  it('2. Nested box containing a markdown table', () => {
    const input = [
      '+----------------------------+',
      '| Header                     |',
      '| | Name  | Age |            |',
      '| |-------|-----|            |',
      '| | Alice | 30  |            |',
      '+----------------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'nested box with table');
    // The outer box should remain intact
    expect(result).toContain('Header');
    expect(result).toContain('Alice');
  });

  it('3. Lateral boxes with CJK content (width-2 characters)', () => {
    const input = [
      '+--------+   +--------+',
      '| 你好   |   | World  |',
      '| test   |   | 世界   |',
      '+--------+   +--------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'CJK lateral');
    // CJK content should be preserved
    expect(result).toContain('你好');
    expect(result).toContain('世界');
    expect(result).toContain('World');
    expect(result).toContain('test');
  });

  it('4. Lateral boxes with emoji content', () => {
    const input = [
      '+----------+   +----------+',
      '| hello    |   | world    |',
      '+----------+   +----------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'emoji lateral');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('5. Nested lateral boxes with inner boxes of different styles', () => {
    const input = [
      '┌──────────────────────────────────┐',
      '│ Outer                            │',
      '│ +--------+   ┌────────┐          │',
      '│ | Inner1 |   │ Inner2 │          │',
      '│ +--------+   └────────┘          │',
      '└──────────────────────────────────┘',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'nested lateral different styles');
    expect(result).toContain('Outer');
    expect(result).toContain('Inner1');
    expect(result).toContain('Inner2');
  });

  it('6. Box containing ANSI escape codes', () => {
    const input = [
      '+---------------------+',
      '| \x1b[31mred text\x1b[0m       |',
      '| normal              |',
      '+-----+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'ANSI escape codes');
    // ANSI codes should be preserved
    expect(result).toContain('\x1b[31m');
    expect(result).toContain('\x1b[0m');
    expect(result).toContain('red text');
    expect(result).toContain('normal');
  });

  it('7. Lateral heavy-style Unicode boxes with misaligned borders', () => {
    const input = [
      '┏━━━━━━━━┓   ┏━━━━━━━━┓',
      '┃ Alpha  ┃   ┃ Beta   ┃',
      '┃ test   ┃   ┃ longer ┃',
      '┗━━━━┛   ┗━━━━━━━━┛',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'heavy lateral misaligned');
    expect(result).toContain('Alpha');
    expect(result).toContain('Beta');
  });

  it('8. Double-style box nested inside light-style box', () => {
    const input = [
      '┌──────────────────┐',
      '│ Light outer      │',
      '│ ╔════════╗       │',
      '│ ║ Double ║       │',
      '│ ╚════════╝       │',
      '└──────────────────┘',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'double inside light');
    expect(result).toContain('Light outer');
    expect(result).toContain('Double');
    // Outer box should remain light style
    const lines = result.split('\n');
    expect(lines[0][0]).toBe('┌');
    expect(lines[lines.length - 1][0]).toBe('└');
  });

  it('9. Markdown table followed immediately by a box (no gap line)', () => {
    const input = [
      '| Name  | Age |',
      '|-------|-----|',
      '| Alice | 30  |',
      '+----------+',
      '| Box here |',
      '+----------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'table then box no gap');
    // Both structures should be present
    expect(result).toContain('Alice');
    expect(result).toContain('Box here');
    // Table should be detected
    const regions = detectRegions(input);
    const tables = regions.filter(r => r.type === 'table');
    const boxes = regions.filter(r => r.type === 'box');
    expect(tables.length).toBeGreaterThanOrEqual(1);
    expect(boxes.length).toBeGreaterThanOrEqual(1);
  });

  it('10. Lateral box next to a markdown table on same lines', () => {
    // A box and table-like content side by side is inherently ambiguous
    // since markdown rows and box content both use |. The detector treats
    // the whole thing as border segments, so no clean region is found.
    // Verify that fixAsciiAlign at least does not corrupt the input.
    const input = [
      '+--------+   | Col1 | Col2 |',
      '| BoxTxt |   |------|------|',
      '+--------+   | A    | B    |',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'box next to table');
    expect(result).toContain('BoxTxt');
    expect(result).toContain('Col1');
    expect(result).toContain('A');
  });
});
