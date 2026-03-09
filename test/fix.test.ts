import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixAsciiAlign, checkAlignment } from '../src/fix.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('fixAsciiAlign', () => {
  it('fixes misaligned ASCII box', () => {
    const input = fixture('ascii-box-misaligned.txt');
    const expected = fixture('ascii-box-aligned.txt');
    expect(fixAsciiAlign(input)).toBe(expected);
  });

  it('fixes misaligned Unicode box', () => {
    const input = fixture('unicode-box-misaligned.txt');
    const expected = fixture('unicode-box-aligned.txt');
    expect(fixAsciiAlign(input)).toBe(expected);
  });

  it('fixes misaligned markdown table', () => {
    const input = fixture('markdown-table-misaligned.txt');
    const expected = fixture('markdown-table-aligned.txt');
    expect(fixAsciiAlign(input)).toBe(expected);
  });

  it('preserves already-aligned content', () => {
    const aligned = fixture('ascii-box-aligned.txt');
    expect(fixAsciiAlign(aligned)).toBe(aligned);
  });

  it('passes through plain text unchanged', () => {
    const text = 'Hello world\nNo boxes here\nJust text';
    expect(fixAsciiAlign(text)).toBe(text);
  });

  it('fixes mixed content with multiple regions', () => {
    const input = fixture('mixed-content.txt');
    const result = fixAsciiAlign(input);
    // Verify the prose is unchanged
    expect(result).toContain('Here is some explanation text:');
    expect(result).toContain('The end.');
    // Verify the box is aligned
    const lines = result.split('\n');
    const boxLines = lines.filter(l => l.startsWith('+') || l.startsWith('|'));
    // All box borders should be the same width
    const borderLines = boxLines.filter(l => l.startsWith('+'));
    const borderWidths = borderLines.map(l => l.trim().length);
    expect(new Set(borderWidths).size).toBe(1);
  });

  it('handles indented boxes', () => {
    const input = '  +------+\n  | hi |\n  | longer text |\n  +--+';
    const result = fixAsciiAlign(input);
    const lines = result.split('\n');
    // All lines should preserve the 2-space indent
    for (const line of lines) {
      expect(line.startsWith('  ')).toBe(true);
    }
    // All lines should have the same total width
    const widths = lines.map(l => l.length);
    expect(new Set(widths).size).toBe(1);
  });

  it('preserves lateral ASCII boxes without merging', () => {
    const input = fixture('lateral-ascii-boxes.txt');
    const result = fixAsciiAlign(input);
    // Should not merge the two boxes — gap between them should be preserved
    const lines = result.split('\n');
    // Each line should contain two separate boxes (two sets of | or +)
    for (const line of lines) {
      const trimmed = line.trim();
      // Count border/vertical chars — should have at least 4 (2 per box)
      const verticals = [...trimmed].filter(ch => ch === '|' || ch === '+').length;
      expect(verticals).toBeGreaterThanOrEqual(4);
    }
  });

  it('preserves lateral Unicode boxes without merging', () => {
    const input = fixture('lateral-unicode-boxes.txt');
    const result = fixAsciiAlign(input);
    // Three boxes should remain separate
    const lines = result.split('\n');
    for (const line of lines) {
      // Count vertical/corner chars — should have at least 6 (2 per box × 3 boxes)
      const boxChars = [...line].filter(ch =>
        ch === '│' || ch === '┌' || ch === '┐' || ch === '└' || ch === '┘'
      ).length;
      expect(boxChars).toBeGreaterThanOrEqual(6);
    }
  });

  it('preserves DB schema lateral boxes (agent2-prompt1)', () => {
    const input = readFileSync(join(__dirname, 'generated', 'agent2-prompt1.txt'), 'utf-8');
    const result = fixAsciiAlign(input);
    // Should preserve the 3 separate tables, not merge them
    const lines = result.split('\n');
    // The first line should still have 3 separate box corners
    const firstLine = lines[0];
    const topLeftCount = [...firstLine].filter(ch => ch === '┌').length;
    expect(topLeftCount).toBe(3);
    // Connectors between boxes should be preserved
    expect(result).toContain('───');
  });

  it('preserves class hierarchy lateral boxes (agent3-prompt3)', () => {
    const input = readFileSync(join(__dirname, 'generated', 'agent3-prompt3.txt'), 'utf-8');
    const result = fixAsciiAlign(input);
    // The inheritance arrows should be preserved
    expect(result).toContain('▼');
    // The top Animal box should still exist
    expect(result).toContain('Animal');
    // Lateral boxes should not be merged
    expect(result).toContain('Mammal');
    expect(result).toContain('Bird');
    expect(result).toContain('Dog');
    expect(result).toContain('Cat');
    expect(result).toContain('Eagle');
  });
});

describe('checkAlignment', () => {
  it('returns aligned for properly aligned content', () => {
    const aligned = fixture('ascii-box-aligned.txt');
    const result = checkAlignment(aligned);
    expect(result.aligned).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns misaligned with issues for bad content', () => {
    const misaligned = fixture('ascii-box-misaligned.txt');
    const result = checkAlignment(misaligned);
    expect(result.aligned).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toContain('Misaligned box');
  });

  it('returns aligned for plain text', () => {
    const result = checkAlignment('Hello world');
    expect(result.aligned).toBe(true);
  });
});
