import { describe, it, expect } from 'vitest';
import { fixAsciiAlign, checkAlignment } from '../src/fix.js';
import { detectRegions } from '../src/detect.js';

function assertSoundOutput(input: string, result: string, label: string) {
  expect(result, `${label}: no undefined`).not.toContain('undefined');
  expect(fixAsciiAlign(result), `${label}: idempotent`).toBe(result);
}

describe('boundary and degenerate inputs', () => {
  it('1. minimal box (1-char content)', () => {
    const input = '+---+\n| x |\n+---+';
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'minimal box');
    expect(result).toContain('x');
    const lines = result.split('\n');
    const widths = lines.map(l => l.length);
    expect(new Set(widths).size).toBe(1);
  });

  it('2. box with empty content line (spaces only)', () => {
    const input = '+------+\n|      |\n| text |\n+------+';
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'empty content line');
    expect(result).toContain('text');
  });

  it('3. box with only borders (no content lines, just top+bottom)', () => {
    const input = '+------+\n+------+';
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'borders only');
  });

  it('4. very long content (200+ chars in a box)', () => {
    const longText = 'A'.repeat(210);
    const input = `+---+\n| ${longText} |\n+---+`;
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'long content');
    expect(result).toContain(longText);
    const lines = result.split('\n');
    const widths = lines.map(l => l.length);
    expect(new Set(widths).size).toBe(1);
  });

  it('5. maximum nesting depth (10 levels)', () => {
    let content = 'deepest';
    for (let i = 0; i < 10; i++) {
      const lines = content.split('\n');
      const maxWidth = Math.max(...lines.map(l => l.length));
      const border = '+' + '-'.repeat(maxWidth + 2) + '+';
      const padded = lines.map(l => '| ' + l.padEnd(maxWidth) + ' |');
      content = [border, ...padded, border].join('\n');
    }
    const result = fixAsciiAlign(content);
    assertSoundOutput(content, result, '10-level nesting');
    expect(result).toContain('deepest');
  });

  it('6. exceeding max depth (11+ levels)', () => {
    let content = 'deepest';
    for (let i = 0; i < 12; i++) {
      const lines = content.split('\n');
      const maxWidth = Math.max(...lines.map(l => l.length));
      const border = '+' + '-'.repeat(maxWidth + 2) + '+';
      const padded = lines.map(l => '| ' + l.padEnd(maxWidth) + ' |');
      content = [border, ...padded, border].join('\n');
    }
    // Should not throw even at 12 levels
    expect(() => fixAsciiAlign(content)).not.toThrow();
    const result = fixAsciiAlign(content);
    expect(result).not.toContain('undefined');
  });

  it('7. tab characters in box content', () => {
    const input = '+------+\n| a\tb |\n| cd   |\n+------+';
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'tabs in content');
    // Should not crash and content should be preserved
    expect(result).toContain('a');
    expect(result).toContain('b');
  });

  it('8. text before lateral boxes on the same lines (leading text)', () => {
    const input = [
      'Here: +---+ +---+',
      '      | A | | B |',
      '      +---+ +---+',
    ].join('\n');
    // Should not throw
    expect(() => fixAsciiAlign(input)).not.toThrow();
    const result = fixAsciiAlign(input);
    expect(result).not.toContain('undefined');
  });

  it('9. box where every content line has different indentation', () => {
    const input = '+------+\n| a |\n|  bb  |\n|   ccc   |\n+---+';
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'varied indentation');
    const lines = result.split('\n');
    const widths = lines.map(l => l.length);
    expect(new Set(widths).size).toBe(1);
  });

  it('10. malformed: top border with no bottom border', () => {
    const input = '+------+\n| hello |\n| world |';
    // Should not throw
    expect(() => fixAsciiAlign(input)).not.toThrow();
    const result = fixAsciiAlign(input);
    // No box detected, so input should pass through unchanged
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('11. malformed: mismatched vertical chars (| left, │ right)', () => {
    const input = '+------+\n| test │\n+------+';
    // Should not throw
    expect(() => fixAsciiAlign(input)).not.toThrow();
    const result = fixAsciiAlign(input);
    expect(result).not.toContain('undefined');
  });

  it('12. unicode combining characters in content', () => {
    // e + combining acute accent = é
    const input = '+------+\n| e\u0301    |\n| test |\n+------+';
    expect(() => fixAsciiAlign(input)).not.toThrow();
    const result = fixAsciiAlign(input);
    expect(result).not.toContain('undefined');
  });

  it('13. empty input', () => {
    const result = fixAsciiAlign('');
    expect(result).toBe('');
  });

  it('14. whitespace-only input', () => {
    const result = fixAsciiAlign('   \n  \n    ');
    expect(result).toBe('   \n  \n    ');
  });

  it('15. windows line endings (\\r\\n)', () => {
    const input = '+------+\r\n| test |\r\n+------+';
    expect(() => fixAsciiAlign(input)).not.toThrow();
    const result = fixAsciiAlign(input);
    expect(result).not.toContain('undefined');
  });

  it('16. minimal border (+++ — a 1-wide border)', () => {
    const input = '+++\n|x|\n+++';
    expect(() => fixAsciiAlign(input)).not.toThrow();
    const result = fixAsciiAlign(input);
    expect(result).not.toContain('undefined');
  });

  it('17. two boxes on consecutive lines (no gap between)', () => {
    const input = [
      '+------+',
      '| Box1 |',
      '+------+',
      '+------+',
      '| Box2 |',
      '+------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'consecutive boxes');
    expect(result).toContain('Box1');
    expect(result).toContain('Box2');
  });
});
