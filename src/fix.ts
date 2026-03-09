import type { Region, BoxStyle, BoxChars } from './types.js';
import { BOX_CHARS, detectRegions, detectStyle, isBorderLine, VERTICAL_CHARS } from './detect.js';
import { visualWidth, visualPadEnd } from './measure.js';

/** Get the box character set for a given style */
function getBoxChars(style: BoxStyle): BoxChars {
  if (style === 'markdown') return BOX_CHARS.ascii; // fallback, not used for markdown
  return BOX_CHARS[style];
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
  for (const line of regionLines) {
    if (isBorderLine(line)) {
      const trimmed = line.trim();
      // Detect which corners/tees are present
      const firstChar = trimmed[0];
      const lastChar = trimmed[trimmed.length - 1];

      // Determine the left and right characters to use
      let left = firstChar;
      let right = lastChar;

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

/** Check if a column range of a line contains a border segment (all border chars) */
function isBorderSegmentAtFix(line: string, start: number, end: number): boolean {
  const HORIZONTAL = new Set(['-', '─', '━', '═']);
  const CORNER = new Set([
    '+', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',
    '┏', '┓', '┗', '┛', '┣', '┫', '┳', '┻', '╋',
    '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
  ]);
  if (end >= line.length) return false;
  for (let i = start; i <= end; i++) {
    const ch = line[i];
    if (!HORIZONTAL.has(ch) && !CORNER.has(ch)) return false;
  }
  return true;
}

/** Fix a lateral box: find actual column range, extract, fix, splice back */
function fixLateralBox(lines: string[], region: Region): void {
  const { startCol: refStart, endCol: refEnd, startLine, endLine } = region;
  if (refStart === undefined || refEnd === undefined) return;

  // Find the actual column range by scanning all content lines for vertical chars
  // near the expected border positions. Content may be wider than the border.
  let actualStart = refStart;
  let actualEnd = refEnd;

  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i] || '';
    // Skip border lines — they're at exact positions
    if (isBorderSegmentAtFix(line, refStart, refEnd)) continue;

    // For content lines, find actual vertical positions
    const startPos = findVerticalNear(line, refStart, 2);
    const endPos = findVerticalNear(line, refEnd, 2);
    if (startPos >= 0) actualStart = Math.min(actualStart, startPos);
    if (endPos >= 0) actualEnd = Math.max(actualEnd, endPos);
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

  // Splice fixed sub-strings back into original lines
  for (let i = 0; i < fixedSub.length; i++) {
    const lineIdx = startLine + i;
    const line = (lines[lineIdx] || '').padEnd(actualEnd + 1);
    const before = line.substring(0, actualStart);
    const after = line.substring(actualEnd + 1);
    lines[lineIdx] = before + fixedSub[i] + after;
  }
}

/** Fix a markdown table: align all columns */
function fixMarkdownTable(lines: string[], region: Region): string[] {
  const { startLine, endLine } = region;
  const regionLines = lines.slice(startLine, endLine + 1);
  const indent = getIndent(regionLines[0]);

  // Parse all rows into cells
  const parsedRows: { cells: string[]; isSeparator: boolean }[] = [];
  for (const line of regionLines) {
    const trimmed = line.trim();
    const isSep = /^\|[\s\-:]+(\|[\s\-:]+)*\|$/.test(trimmed);
    // Split by | and drop the empty first/last elements
    const parts = trimmed.split('|');
    const cells = parts.slice(1, -1).map(c => c.trim());
    parsedRows.push({ cells, isSeparator: isSep });
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
        const dashCount = colWidths[i] - (leftColon ? 1 : 0) - (rightColon ? 1 : 0);
        cells.push(
          (leftColon ? ':' : '') +
          '-'.repeat(dashCount) +
          (rightColon ? ':' : '')
        );
      } else {
        cells.push(visualPadEnd(cell, colWidths[i]));
      }
    }
    result.push(indent + '| ' + cells.join(' | ') + ' |');
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
      // Lateral box: fix in-place within column range
      fixLateralBox(lines, region);
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
  if (fixed === text) return { aligned: true, issues: [] };

  // Compute diff info
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

  return { aligned: false, issues };
}
