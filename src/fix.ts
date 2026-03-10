import type { Region, BoxStyle, BoxChars } from './types.js';
import { BOX_CHARS, detectRegions, detectStyle, isBorderLine, VERTICAL_CHARS } from './detect.js';
import { visualWidth, visualPadEnd } from './measure.js';

/** Get the box character set for a given style */
function getBoxChars(style: BoxStyle): BoxChars {
  if (style === 'markdown') return BOX_CHARS.ascii; // fallback, not used for markdown
  return BOX_CHARS[style];
}

// Sets for classifying corner/tee characters by position
const TOP_LEFT_CHARS = new Set(['+', '┌', '┏', '╔']);
const TOP_RIGHT_CHARS = new Set(['+', '┐', '┓', '╗']);
const BOTTOM_LEFT_CHARS = new Set(['+', '└', '┗', '╚']);
const BOTTOM_RIGHT_CHARS = new Set(['+', '┘', '┛', '╝']);
const TEE_LEFT_CHARS = new Set(['+', '├', '┣', '╠']);
const TEE_RIGHT_CHARS = new Set(['+', '┤', '┫', '╣']);
const TEE_DOWN_CHARS = new Set(['+', '┬', '┳', '╦']);
const TEE_UP_CHARS = new Set(['+', '┴', '┻', '╩']);
const CROSS_CHARS = new Set(['+', '┼', '╋', '╬']);

/**
 * Map a corner/tee character to the correct character for the detected style.
 * Uses position in the region (top/bottom/mid) to disambiguate '+' which
 * maps to all corners in ASCII style.
 */
function mapCornerToStyle(ch: string, chars: BoxChars, side: 'left' | 'right', position: 'top' | 'bottom' | 'mid'): string {
  // For non-ASCII chars, classify by character identity
  if (TOP_LEFT_CHARS.has(ch) && !BOTTOM_LEFT_CHARS.has(ch) && side === 'left') return chars.topLeft;
  if (TOP_RIGHT_CHARS.has(ch) && !BOTTOM_RIGHT_CHARS.has(ch) && side === 'right') return chars.topRight;
  if (BOTTOM_LEFT_CHARS.has(ch) && !TOP_LEFT_CHARS.has(ch) && side === 'left') return chars.bottomLeft;
  if (BOTTOM_RIGHT_CHARS.has(ch) && !TOP_RIGHT_CHARS.has(ch) && side === 'right') return chars.bottomRight;
  if (TEE_LEFT_CHARS.has(ch) && ch !== '+' && side === 'left') return chars.teeLeft;
  if (TEE_RIGHT_CHARS.has(ch) && ch !== '+' && side === 'right') return chars.teeRight;
  if (TEE_DOWN_CHARS.has(ch) && ch !== '+') return chars.teeDown;
  if (TEE_UP_CHARS.has(ch) && ch !== '+') return chars.teeUp;
  if (CROSS_CHARS.has(ch) && ch !== '+') return chars.cross;

  // For '+' (ASCII) or ambiguous chars, use positional info
  if (position === 'top') return side === 'left' ? chars.topLeft : chars.topRight;
  if (position === 'bottom') return side === 'left' ? chars.bottomLeft : chars.bottomRight;
  // Mid-border: use tee chars
  return side === 'left' ? chars.teeLeft : chars.teeRight;
}

/** Extract the leading whitespace (indentation) from a line */
function getIndent(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : '';
}

/** Fix a box region: align all borders and content to the widest line */
function fixBox(lines: string[], region: Region): string[] {
  const { startLine, endLine, style } = region;
  const chars = getBoxChars(style);
  const regionLines = lines.slice(startLine, endLine + 1);
  const indent = getIndent(regionLines[0]);

  // Collect content widths (the stuff between the vertical bars)
  const contentWidths: number[] = [];
  for (const line of regionLines) {
    if (isBorderLine(line)) continue;
    const trimmed = line.trim();
    // Strip outer vertical chars and measure inner content
    const inner = trimmed.slice(1, -1);
    contentWidths.push(visualWidth(inner));
  }

  // Also check border widths to find the intended width
  for (const line of regionLines) {
    if (!isBorderLine(line)) continue;
    const trimmed = line.trim();
    // Border width is the full width minus the two corner chars
    contentWidths.push(trimmed.length - 2);
  }

  const maxContentWidth = Math.max(...contentWidths, 0);

  // Rebuild each line
  const result: string[] = [];
  let borderIndex = 0;
  const totalBorders = regionLines.filter(l => isBorderLine(l)).length;
  for (const line of regionLines) {
    if (isBorderLine(line)) {
      const trimmed = line.trim();
      const firstChar = trimmed[0];
      const lastChar = trimmed[trimmed.length - 1];

      // Determine position: first border = top, last = bottom, others = mid
      const position: 'top' | 'bottom' | 'mid' =
        borderIndex === 0 ? 'top' : borderIndex === totalBorders - 1 ? 'bottom' : 'mid';
      borderIndex++;

      // Map corner/tee characters to the detected style to handle mixed-style boxes
      const left = mapCornerToStyle(firstChar, chars, 'left', position);
      const right = mapCornerToStyle(lastChar, chars, 'right', position);

      // Build the border: left + horizontal fill + right
      result.push(indent + left + chars.horizontal.repeat(maxContentWidth) + right);
    } else {
      const trimmed = line.trim();
      const vert = chars.vertical;
      // Extract content between first and last vertical char
      const inner = trimmed.slice(1, -1);
      // Pad content to target width
      const padded = visualPadEnd(inner, maxContentWidth);
      result.push(indent + vert + padded + vert);
    }
  }

  return result;
}

/** Find the nearest vertical char to a given position */
function findVerticalNear(line: string, pos: number, tolerance: number): number {
  for (let d = 0; d <= tolerance; d++) {
    if (pos + d < line.length && VERTICAL_CHARS.has(line[pos + d])) return pos + d;
    if (d > 0 && pos - d >= 0 && VERTICAL_CHARS.has(line[pos - d])) return pos - d;
  }
  return -1;
}

const FIX_HORIZONTAL = new Set(['-', '─', '━', '═']);
const FIX_CORNER = new Set([
  '+', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',
  '┏', '┓', '┗', '┛', '┣', '┫', '┳', '┻', '╋',
  '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
]);

/** Check if a column range of a line contains a border segment (all border chars) */
function isBorderSegmentAtFix(line: string, start: number, end: number): boolean {
  if (end >= line.length) return false;
  for (let i = start; i <= end; i++) {
    const ch = line[i];
    if (!FIX_HORIZONTAL.has(ch) && !FIX_CORNER.has(ch)) return false;
  }
  return true;
}

/** Find contiguous border segments in a line (mirrors detect.ts findBorderSegments) */
function findBorderSegmentsInFix(line: string): { start: number; end: number }[] {
  const segments: { start: number; end: number }[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch !== ' ' && (FIX_HORIZONTAL.has(ch) || FIX_CORNER.has(ch))) {
      const start = i;
      while (i < line.length && line[i] !== ' ' && (FIX_HORIZONTAL.has(line[i]) || FIX_CORNER.has(line[i]))) {
        i++;
      }
      const end = i - 1;
      if (end - start >= 2) {
        segments.push({ start, end });
      }
    } else {
      i++;
    }
  }
  return segments;
}

/** Fix a lateral box: find actual column range, extract, fix, splice back */
function fixLateralBox(lines: string[], region: Region, maxEnd?: number): void {
  const { startCol: refStart, endCol: refEnd, startLine, endLine } = region;
  if (refStart === undefined || refEnd === undefined) return;

  // Find the actual column range by scanning all lines for border segments and
  // content vertical chars. Use wide tolerance since content/borders may be
  // significantly wider or narrower than the reference range.
  const boxWidth = refEnd - refStart;
  const tolerance = Math.max(Math.ceil(boxWidth * 0.5), 4);
  let actualStart = refStart;
  let actualEnd = refEnd;

  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i] || '';

    // For border lines, find actual border segment positions
    if (isBorderSegmentAtFix(line, refStart, refEnd)) {
      // Exact match — use as-is
    } else {
      // Check for border segments near expected range (misaligned borders)
      const segments = findBorderSegmentsInFix(line);
      let foundBorder = false;
      for (const seg of segments) {
        if (Math.abs(seg.start - refStart) <= tolerance &&
            Math.abs(seg.end - refEnd) <= tolerance) {
          actualStart = Math.min(actualStart, seg.start);
          actualEnd = Math.max(actualEnd, seg.end);
          foundBorder = true;
          break;
        }
      }
      if (!foundBorder) {
        // For content lines, find actual vertical positions with wide tolerance
        const startPos = findVerticalNear(line, refStart, tolerance);
        const endPos = findVerticalNear(line, refEnd, tolerance);
        if (startPos >= 0) actualStart = Math.min(actualStart, startPos);
        if (endPos >= 0) actualEnd = Math.max(actualEnd, endPos);
      }
    }
  }

  // Clamp actualEnd to maxEnd to prevent overlapping into adjacent boxes
  if (maxEnd !== undefined) {
    actualEnd = Math.min(actualEnd, maxEnd);
  }

  // Measure the gap (spaces) between this box's end and the next content on each line
  const originalGaps: number[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const after = (lines[i] || '').substring(actualEnd + 1);
    originalGaps.push(after.length - after.trimStart().length);
  }

  // Extract sub-strings for this box using the actual range
  const subLines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const line = (lines[i] || '').padEnd(actualEnd + 1);
    subLines.push(line.substring(actualStart, actualEnd + 1));
  }

  // Fix the sub-box using existing logic
  const fakeRegion: Region = {
    startLine: 0,
    endLine: subLines.length - 1,
    type: region.type,
    style: region.style,
  };
  const fixedSub = fixBox(subLines, fakeRegion);

  // Splice fixed sub-strings back into original lines, restoring original gaps
  for (let i = 0; i < fixedSub.length; i++) {
    const lineIdx = startLine + i;
    const line = (lines[lineIdx] || '').padEnd(actualEnd + 1);
    const before = line.substring(0, actualStart);
    const afterContent = line.substring(actualEnd + 1).trimStart();
    const gap = ' '.repeat(originalGaps[i] || 0);
    lines[lineIdx] = before + fixedSub[i] + gap + afterContent;
  }
}

/** Fix a markdown table: align all columns */
function fixMarkdownTable(lines: string[], region: Region): string[] {
  const { startLine, endLine } = region;
  const regionLines = lines.slice(startLine, endLine + 1);
  const indent = getIndent(regionLines[0]);

  // Parse all rows into cells
  const parsedRows: { cells: string[]; isSeparator: boolean; isCompact: boolean }[] = [];
  for (const line of regionLines) {
    const trimmed = line.trim();
    const isSep = /^\|[\s\-:]+(\|[\s\-:]+)*\|$/.test(trimmed);
    // Detect compact format: first char after '|' is not a space (e.g. |---|---|)
    const isCompact = isSep && trimmed.length > 1 && trimmed[1] !== ' ';
    // Split by | and drop the empty first/last elements
    const parts = trimmed.split('|');
    const cells = parts.slice(1, -1).map(c => c.trim());
    parsedRows.push({ cells, isSeparator: isSep, isCompact });
  }

  // Determine the number of columns and max width per column
  const numCols = Math.max(...parsedRows.map(r => r.cells.length));
  const colWidths: number[] = new Array(numCols).fill(0);
  for (const row of parsedRows) {
    if (row.isSeparator) continue;
    for (let i = 0; i < row.cells.length; i++) {
      colWidths[i] = Math.max(colWidths[i], visualWidth(row.cells[i]));
    }
  }
  // Ensure minimum width of 3 for separator dashes
  for (let i = 0; i < colWidths.length; i++) {
    colWidths[i] = Math.max(colWidths[i], 3);
  }

  // Rebuild each row
  const result: string[] = [];
  for (const row of parsedRows) {
    const cells: string[] = [];
    for (let i = 0; i < numCols; i++) {
      const cell = row.cells[i] ?? '';
      if (row.isSeparator) {
        // Detect alignment markers
        const trimCell = cell.trim();
        const leftColon = trimCell.startsWith(':');
        const rightColon = trimCell.endsWith(':');
        if (row.isCompact) {
          // Compact: dashes fill colWidths[i] + 2 (to account for missing spaces)
          const totalWidth = colWidths[i] + 2;
          const dashCount = totalWidth - (leftColon ? 1 : 0) - (rightColon ? 1 : 0);
          cells.push(
            (leftColon ? ':' : '') +
            '-'.repeat(dashCount) +
            (rightColon ? ':' : '')
          );
        } else {
          const dashCount = colWidths[i] - (leftColon ? 1 : 0) - (rightColon ? 1 : 0);
          cells.push(
            (leftColon ? ':' : '') +
            '-'.repeat(dashCount) +
            (rightColon ? ':' : '')
          );
        }
      } else {
        cells.push(visualPadEnd(cell, colWidths[i]));
      }
    }
    if (row.isSeparator && row.isCompact) {
      result.push(indent + '|' + cells.join('|') + '|');
    } else {
      result.push(indent + '| ' + cells.join(' | ') + ' |');
    }
  }

  return result;
}

/** Fix all detected ASCII structures in the input text */
export function fixAsciiAlign(text: string): string {
  const lines = text.split('\n');
  const regions = detectRegions(text);

  if (regions.length === 0) return text;

  // Process regions in reverse order so line indices stay valid.
  // For same-line regions (lateral boxes), process right-to-left (highest startCol first)
  // so column shifts from earlier fixes don't invalidate positions to the left.
  const sortedRegions = [...regions].sort((a, b) => {
    if (a.startLine !== b.startLine) return b.startLine - a.startLine;
    return (b.startCol ?? 0) - (a.startCol ?? 0);
  });

  for (const region of sortedRegions) {
    if (region.type === 'table' && region.style === 'markdown') {
      const fixedLines = fixMarkdownTable(lines, region);
      lines.splice(region.startLine, region.endLine - region.startLine + 1, ...fixedLines);
    } else if (region.startCol !== undefined && region.endCol !== undefined) {
      // Lateral box: compute maxEnd from nearest box to the right on the same line
      let lateralMaxEnd: number | undefined;
      for (const other of sortedRegions) {
        if (other === region) continue;
        if (other.startLine !== region.startLine) continue;
        if (other.startCol === undefined) continue;
        if (other.startCol > region.endCol!) {
          // This box is to the right — limit expansion to just before it
          const boundary = other.startCol - 1;
          if (lateralMaxEnd === undefined || boundary < lateralMaxEnd) {
            lateralMaxEnd = boundary;
          }
        }
      }
      fixLateralBox(lines, region, lateralMaxEnd);
    } else {
      const fixedLines = fixBox(lines, region);
      lines.splice(region.startLine, region.endLine - region.startLine + 1, ...fixedLines);
    }
  }

  return lines.join('\n');
}

/** Check if any ASCII structures in the text are misaligned */
export function checkAlignment(text: string): { aligned: boolean; issues: string[] } {
  const fixed = fixAsciiAlign(text);
  const origLines = text.split('\n');
  const fixedLines = fixed.split('\n');
  const issues: string[] = [];

  const regions = detectRegions(text);
  for (const region of regions) {
    let hasIssue = false;
    for (let i = region.startLine; i <= region.endLine && i < origLines.length && i < fixedLines.length; i++) {
      if (origLines[i] !== fixedLines[i]) {
        hasIssue = true;
        break;
      }
    }
    if (hasIssue) {
      const colInfo = region.startCol !== undefined
        ? ` (columns ${region.startCol + 1}-${(region.endCol ?? 0) + 1})`
        : '';
      issues.push(
        `Misaligned ${region.type} at lines ${region.startLine + 1}-${region.endLine + 1}${colInfo}`
      );
    }
  }

  // Check box content lines for missing padding (at least 1 space on each side)
  for (const region of regions) {
    if (region.type !== 'box') continue;
    for (let i = region.startLine; i <= region.endLine && i < origLines.length; i++) {
      const line = origLines[i].trim();
      if (isBorderLine(line)) continue;
      if (line.length >= 2 && (line.startsWith('|') || line.startsWith('│') || line.startsWith('║'))) {
        const inner = line.slice(1, -1);
        if (inner.length > 0 && (!inner.startsWith(' ') || !inner.endsWith(' '))) {
          issues.push(
            `Missing content padding at line ${i + 1}`
          );
          break;
        }
      }
    }
  }

  if (issues.length === 0) return { aligned: true, issues: [] };
  return { aligned: false, issues };
}
