import type { Region, BoxStyle, BoxChars } from './types.js';
import { BOX_CHARS, detectRegions, detectStyle, isBorderLine, isMarkdownSeparator, VERTICAL_CHARS } from './detect.js';
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

const MAX_NESTING_DEPTH = 10;

/** Fix a box region: align all borders and content to the widest line */
function fixBox(lines: string[], region: Region, depth: number = 0): string[] {
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

  // Phase 2: Recursively fix inner content (nested boxes)
  if (depth < MAX_NESTING_DEPTH) {
    // Extract inner content from non-border lines
    const innerLines: string[] = [];
    const lineMapping: { resultIdx: number; isBorder: boolean }[] = [];
    for (let i = 0; i < result.length; i++) {
      const line = result[i];
      const stripped = line.substring(indent.length);
      const isBorder = isBorderLine(stripped);
      lineMapping.push({ resultIdx: i, isBorder });
      if (!isBorder) {
        // Strip the outer vertical chars (indent + vert + content + vert)
        // Content is between the first and last char after indent
        innerLines.push(stripped.slice(1, -1));
      }
    }

    if (innerLines.length > 0) {
      const innerText = innerLines.join('\n');
      const fixedInner = fixAsciiAlignRecursive(innerText, depth + 1);

      if (fixedInner !== innerText) {
        const fixedInnerLines = fixedInner.split('\n');

        // Re-measure: inner content may have grown
        const vert = chars.vertical;
        const newContentWidths: number[] = [];
        for (const fl of fixedInnerLines) {
          newContentWidths.push(visualWidth(fl));
        }
        // Also include border widths from current result
        for (const m of lineMapping) {
          if (m.isBorder) {
            newContentWidths.push(maxContentWidth);
          }
        }
        const newMaxWidth = Math.max(...newContentWidths, maxContentWidth);

        // Rebuild result with fixed inner content
        let innerIdx = 0;
        for (let i = 0; i < result.length; i++) {
          if (!lineMapping[i].isBorder) {
            const fixedLine = fixedInnerLines[innerIdx++];
            const padded = visualPadEnd(fixedLine, newMaxWidth);
            result[i] = indent + vert + padded + vert;
          } else if (newMaxWidth !== maxContentWidth) {
            // Rebuild border at new width
            const stripped = result[i].substring(indent.length);
            const firstChar = stripped[0];
            const lastChar = stripped[stripped.length - 1];
            result[i] = indent + firstChar + chars.horizontal.repeat(newMaxWidth) + lastChar;
          }
        }
      }
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

/**
 * Extract a lateral box's sub-lines from the original lines using per-line
 * border/content positions. Returns the sub-lines and per-line actual ranges.
 */
function extractLateralBox(
  lines: string[],
  region: Region
): { subLines: string[]; actualStart: number; lineEnds: number[] } {
  const { startCol: refStart, endCol: refEnd, startLine, endLine } = region;
  if (refStart === undefined || refEnd === undefined) {
    return { subLines: [], actualStart: refStart ?? 0, lineEnds: [] };
  }

  const boxWidth = refEnd - refStart;
  const tolerance = Math.max(Math.ceil(boxWidth * 0.5), 4);
  let actualStart = refStart;
  const lineEnds: number[] = [];

  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i] || '';
    let lineEnd = refEnd;

    const segments = findBorderSegmentsInFix(line);
    let foundBorder = false;
    for (const seg of segments) {
      if (Math.abs(seg.start - refStart) <= tolerance &&
          Math.abs(seg.end - refEnd) <= tolerance) {
        actualStart = Math.min(actualStart, seg.start);
        lineEnd = seg.end;
        foundBorder = true;
        break;
      }
    }
    if (!foundBorder) {
      const startPos = findVerticalNear(line, refStart, tolerance);
      const endPos = findVerticalNear(line, refEnd, tolerance);
      if (startPos >= 0) actualStart = Math.min(actualStart, startPos);
      if (endPos >= 0) lineEnd = endPos;
    }

    lineEnds.push(lineEnd);
  }

  // Extract sub-lines using per-line end positions
  const subLines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const lineEnd = lineEnds[i - startLine];
    const line = (lines[i] || '').padEnd(lineEnd + 1);
    subLines.push(line.substring(actualStart, lineEnd + 1));
  }

  return { subLines, actualStart, lineEnds };
}

/** Fix a group of lateral boxes on the same lines. Extracts all boxes,
 *  measures gaps from the ORIGINAL lines, fixes each box, then reassembles. */
function fixLateralBoxGroup(lines: string[], lateralRegions: Region[], depth: number = 0): void {
  if (lateralRegions.length === 0) return;

  // Sort left-to-right by startCol
  const sorted = [...lateralRegions].sort((a, b) => (a.startCol ?? 0) - (b.startCol ?? 0));
  const startLine = sorted[0].startLine;
  const endLine = sorted[0].endLine;

  // Save original lines for gap measurement
  const origLines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    origLines.push(lines[i] || '');
  }

  // Extract and fix each box independently from original lines
  const fixedBoxes: { actualStart: number; lineEnds: number[]; fixedSub: string[] }[] = [];
  for (const region of sorted) {
    const { subLines, actualStart, lineEnds } = extractLateralBox(lines, region);

    const fakeRegion: Region = {
      startLine: 0,
      endLine: subLines.length - 1,
      type: region.type,
      style: region.style,
    };
    const fixedSub = fixBox(subLines, fakeRegion, depth);
    fixedBoxes.push({ actualStart, lineEnds, fixedSub });
  }

  // Measure gaps between adjacent boxes from original lines
  const gaps: number[][] = []; // gaps[boxIdx][lineOffset] = gap width after box
  for (let boxIdx = 0; boxIdx < sorted.length - 1; boxIdx++) {
    const gapsForBox: number[] = [];
    for (let lineOffset = 0; lineOffset <= endLine - startLine; lineOffset++) {
      const origLine = origLines[lineOffset];
      const thisBoxEnd = fixedBoxes[boxIdx].lineEnds[lineOffset];

      // Measure gap: spaces between this box's end and next non-space char in original line
      let gapWidth = 0;
      for (let col = thisBoxEnd + 1; col < origLine.length; col++) {
        if (origLine[col] === ' ') {
          gapWidth++;
        } else {
          break;
        }
      }
      // Ensure at least 1 space gap
      gapsForBox.push(Math.max(gapWidth, 1));
    }
    gaps.push(gapsForBox);
  }

  // Reassemble lines: indent + box1 + gap1 + box2 + gap2 + ... + trailing
  for (let lineOffset = 0; lineOffset <= endLine - startLine; lineOffset++) {
    const lineIdx = startLine + lineOffset;
    const origLine = origLines[lineOffset];
    const indent = origLine.substring(0, fixedBoxes[0].actualStart);

    let result = indent;
    for (let boxIdx = 0; boxIdx < fixedBoxes.length; boxIdx++) {
      result += fixedBoxes[boxIdx].fixedSub[lineOffset];
      if (boxIdx < fixedBoxes.length - 1) {
        result += ' '.repeat(gaps[boxIdx][lineOffset]);
      }
    }

    // Append any trailing content after the last box in the original line
    const lastBoxEnd = fixedBoxes[fixedBoxes.length - 1].lineEnds[lineOffset];
    const trailing = origLine.substring(lastBoxEnd + 1);
    const trimmedTrailing = trailing.trimStart();
    if (trimmedTrailing.length > 0) {
      result += trailing;
    }

    lines[lineIdx] = result;
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
    const isSep = isMarkdownSeparator(line);
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

/** Fix all detected ASCII structures recursively */
function fixAsciiAlignRecursive(text: string, depth: number): string {
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

  // Group lateral boxes by startLine for joint processing
  const lateralGroups = new Map<number, Region[]>();
  const processedLateralLines = new Set<number>();

  for (const region of sortedRegions) {
    if (region.startCol !== undefined && region.endCol !== undefined) {
      const key = region.startLine;
      if (!lateralGroups.has(key)) lateralGroups.set(key, []);
      lateralGroups.get(key)!.push(region);
    }
  }

  for (const region of sortedRegions) {
    if (region.type === 'table' && region.style === 'markdown') {
      const fixedLines = fixMarkdownTable(lines, region);
      lines.splice(region.startLine, region.endLine - region.startLine + 1, ...fixedLines);
    } else if (region.startCol !== undefined && region.endCol !== undefined) {
      // Lateral box: process all boxes on this line as a group (once)
      if (!processedLateralLines.has(region.startLine)) {
        processedLateralLines.add(region.startLine);
        const group = lateralGroups.get(region.startLine) ?? [region];
        fixLateralBoxGroup(lines, group, depth);
      }
    } else {
      const fixedLines = fixBox(lines, region, depth);
      lines.splice(region.startLine, region.endLine - region.startLine + 1, ...fixedLines);
    }
  }

  return lines.join('\n');
}

/** Fix all detected ASCII structures in the input text */
export function fixAsciiAlign(text: string): string {
  return fixAsciiAlignRecursive(text, 0);
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
      // Check content lines bounded by vertical chars
      if (line.length >= 2 && (line.startsWith('|') || line.startsWith('│') || line.startsWith('║'))) {
        const inner = line.slice(1, -1);
        if (inner.length > 0 && (!inner.startsWith(' ') || !inner.endsWith(' '))) {
          issues.push(
            `Missing content padding at line ${i + 1}`
          );
          break; // One issue per region is enough
        }
      }
    }
  }

  if (issues.length === 0) return { aligned: true, issues: [] };
  return { aligned: false, issues };
}
