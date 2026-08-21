import { describe, it, expect } from 'vitest';
import { fixAsciiAlign, checkAlignment } from '../src/fix.js';
import { detectRegions } from '../src/detect.js';

function assertSoundOutput(input: string, result: string, label: string) {
  expect(result, `${label}: no undefined`).not.toContain('undefined');
  expect(fixAsciiAlign(result), `${label}: idempotent`).toBe(result);
}

describe('Regression edge cases for #22 (nested lateral different heights)', () => {
  it('1. 3 nested lateral groups at different depths', () => {
    const input = [
      '+----------------------------------------------------------+',
      '| Outer                                                    |',
      '| +------------------------+ +------------------------+   |',
      '| | Mid-A                  | | Mid-B                  |   |',
      '| | +--------+ +--------+ | | +--------+ +--------+  |   |',
      '| | | deep-1 | | deep-2 | | | | deep-3 | | deep-4 |  |   |',
      '| | +--------+ +--------+ | | +--------+ +--------+  |   |',
      '| +------------------------+ +------------------------+   |',
      '+----------------------------------------------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '3 nested lateral groups');
    expect(result).toContain('deep-1');
    expect(result).toContain('deep-4');
  });

  it('2. 5-line height difference between inner boxes', () => {
    const input = [
      '+----------+ +----------+',
      '| Tall     | | Short    |',
      '| line2    | +----------+',
      '| line3    |',
      '| line4    |',
      '| line5    |',
      '| line6    |',
      '+----------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '5-line height diff');
    expect(result).toContain('Tall');
    expect(result).toContain('Short');
  });

  it('3. 3 boxes where middle ends first', () => {
    const input = [
      '+------+ +------+ +------+',
      '| Left | | Mid  | | Rght |',
      '| l2   | +------+ | r2   |',
      '| l3   |          | r3   |',
      '+------+          +------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '3 boxes middle ends first');
    expect(result).toContain('Left');
    expect(result).toContain('Mid');
    expect(result).toContain('Rght');
  });

  it('4. 3 boxes each ending at different lines', () => {
    const input = [
      '+------+ +------+ +------+',
      '| AAA  | | BBB  | | CCC  |',
      '| a2   | | b2   | +------+',
      '| a3   | +------+',
      '+------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '3 boxes staggered ends');
    expect(result).toContain('AAA');
    expect(result).toContain('BBB');
    expect(result).toContain('CCC');
  });
});

describe('Regression edge cases for #26 (gap collapse on inner border rows)', () => {
  it('5. 2 stacked inner boxes per lateral box (4 inner border rows)', () => {
    const input = [
      '+-------------------+ +-------------------+',
      '| Box A             | | Box B             |',
      '| +---------------+ | | +---------------+ |',
      '| | inner-A1      | | | | inner-B1      | |',
      '| +---------------+ | | +---------------+ |',
      '| +---------------+ | | +---------------+ |',
      '| | inner-A2      | | | | inner-B2      | |',
      '| +---------------+ | | +---------------+ |',
      '+-------------------+ +-------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '2 stacked inner boxes');
    // Gap between lateral boxes should be preserved on all lines
    const lines = result.split('\n');
    for (const line of lines) {
      const match = line.match(/[|+]\s+[|+]/g);
      if (match) {
        // Inter-box gap should be consistent (1 space)
        const gapBetweenBoxes = match.find(m => {
          const spaces = m.length - 2;
          return spaces >= 1;
        });
        expect(gapBetweenBoxes).toBeDefined();
      }
    }
  });

  it('6. Inner boxes of different sizes in each lateral box', () => {
    const input = [
      '+-------------------+ +-------------------+',
      '| Box A             | | Box B             |',
      '| +---------------+ | | +-----------+     |',
      '| | wide-inner-A  | | | | small-B   |     |',
      '| +---------------+ | | +-----------+     |',
      '+-------------------+ +-------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'different inner sizes');
    expect(result).toContain('wide-inner-A');
    expect(result).toContain('small-B');
  });

  it('7. Gap of exactly 2 spaces with nested inner borders', () => {
    const input = [
      '+-------------+  +-------------+',
      '| Box A       |  | Box B       |',
      '| +---------+ |  | +---------+ |',
      '| | inner   | |  | | inner   | |',
      '| +---------+ |  | +---------+ |',
      '+-------------+  +-------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '2-space gap with inner borders');
    // Every line should preserve the 2-space gap
    const lines = result.split('\n');
    for (const line of lines) {
      // Between the two lateral boxes there should be 2 spaces
      expect(line).toMatch(/[|+]\s{2}[|+]/);
    }
  });

  it('8. Inner border spanning nearly full width of outer box', () => {
    const input = [
      '+-----------------------+ +-----------------------+',
      '| Box A                 | | Box B                 |',
      '| +-------------------+ | | +-------------------+ |',
      '| | nearly-full-width | | | | nearly-full-width | |',
      '| +-------------------+ | | +-------------------+ |',
      '+-----------------------+ +-----------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'nearly full-width inner border');
    expect(result).toContain('nearly-full-width');
  });
});

describe('Regression edge cases for #27 (bottom border erased)', () => {
  it('9. 3 lateral boxes, leftmost and rightmost end early', () => {
    const input = [
      '+--------+ +------------------+ +--------+',
      '| Left   | | Middle           | | Right  |',
      '+--------+ | more-mid-content | +--------+',
      '           | even-more        |',
      '           +------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '3 boxes outer two end early');
    // Left and right bottom borders must be preserved on line 2
    const lines = result.split('\n');
    expect(lines[2]).toContain('+--------+');
  });

  it('10. Shorter box ends, taller has additional nested content below', () => {
    const input = [
      '+---------------------------+   +-----------------------------------------------+',
      '| Short Plane               |   | Tall Node                                     |',
      '| +-----------------------+ |   | +-------------------------------------------+ |',
      '| | inner-short           | |   | | inner-tall-1                              | |',
      '| +-----------------------+ |   | +-------------------------------------------+ |',
      '+---------------------------+   |                                               |',
      '                                | +-------------------------------------------+ |',
      '                                | | inner-tall-2                              | |',
      '                                | +-------------------------------------------+ |',
      '                                | +-------------------------------------------+ |',
      '                                | | inner-tall-3                              | |',
      '                                | +-------------------------------------------+ |',
      '                                +-----------------------------------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'shorter ends with more nested below');
    const lines = result.split('\n');
    // Short Plane bottom border must be preserved on line 5
    expect(lines[5]).toContain('+---------------------------+');
    expect(result).toContain('inner-tall-3');
  });

  it('11. Short box combined with trailing text on same line', () => {
    const input = [
      '+--------+ +--------+',
      '| Short  | | Tall   |',
      '+--------+ | t2     |',
      '           | t3     |',
      '           +--------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'short box with trailing');
    const lines = result.split('\n');
    // Line 2 should still have the short box bottom border
    expect(lines[2]).toMatch(/\+[-]+\+/);
  });
});

describe('Regression edge cases for #28 (extraction off-by-one)', () => {
  it('12. 3 lateral boxes with mixed column offsets', () => {
    const input = [
      '+---------------+ +---------------+ +---------------+',
      '| Box-A content | | Box-B content | | Box-C content |',
      '| more-A        | | more-B        | | more-C        |',
      '+---------------+ +---------------+ +---------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, '3 boxes mixed offsets');
    const lines = result.split('\n');
    // Should have exactly 3 boxes separated by single spaces on border lines
    expect(lines[0]).toMatch(/\+[-]+\+ \+[-]+\+ \+[-]+\+/);
    // Content lines should have exactly 6 pipes
    for (const line of lines) {
      if (line.includes('content')) {
        const pipeCount = [...line].filter(ch => ch === '|').length;
        expect(pipeCount).toBe(6);
      }
    }
  });

  it('13. Content | offset by 2 columns from border +', () => {
    const input = [
      '+-------------------------+ +-------------------------+',
      '| Service-A               | | Service-B               |',
      '| (internal routing)      | | (external access)       |',
      '+-------------------------+ +-------------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'content offset from border');
    const lines = result.split('\n');
    // Border lines should match and be consistent
    expect(lines[0]).toMatch(/\+[-]+\+ \+[-]+\+/);
    expect(lines[3]).toMatch(/\+[-]+\+ \+[-]+\+/);
    // Should be idempotent (already checked in assertSoundOutput)
  });

  it('14. Off-by-one combined with height difference', () => {
    const input = [
      '+-------------------------+ +-------------------------+',
      '| ClusterIP Service       | | NodePort Service        |',
      '| (internal routing)      | | (external access)       |',
      '+-------------------------+ | (extra line)            |',
      '                            +-------------------------+',
    ].join('\n');
    const result = fixAsciiAlign(input);
    assertSoundOutput(input, result, 'off-by-one + height diff');
    expect(result).toContain('ClusterIP');
    expect(result).toContain('NodePort');
    expect(result).toContain('extra line');
  });
});
