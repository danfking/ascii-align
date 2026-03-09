import type { Region, BoxStyle, BoxChars } from './types.js';

/** Character sets for each box style */
export const BOX_CHARS: Record<Exclude<BoxStyle, 'markdown'>, BoxChars> = {
  ascii: {
    topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+',
    horizontal: '-', vertical: '|',
    teeLeft: '+', teeRight: '+', teeDown: '+', teeUp: '+', cross: '+',
  },
  light: {
    topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
    horizontal: '─', vertical: '│',
    teeLeft: '├', teeRight: '┤', teeDown: '┬', teeUp: '┴', cross: '┼',
  },
  heavy: {
    topLeft: '┏', topRight: '┓', bottomLeft: '┗', bottomRight: '┛',
    horizontal: '━', vertical: '┃',
    teeLeft: '┣', teeRight: '┫', teeDown: '┳', teeUp: '┻', cross: '╋',
  },
  double: {
    topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝',
    horizontal: '═', vertical: '║',
    teeLeft: '╠', teeRight: '╣', teeDown: '╦', teeUp: '╩', cross: '╬',
  },
};

// Sets of characters for quick membership tests
const HORIZONTAL_CHARS = new Set(['-', '─', '━', '═']);
export const VERTICAL_CHARS = new Set(['|', '│', '┃', '║']);
const CORNER_CHARS = new Set([
  '+', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',
  '┏', '┓', '┗', '┛', '┣', '┫', '┳', '┻', '╋',
  '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
]);

/** Check if a line is a horizontal border (corners + horizontal fill) */
export function isBorderLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;
  // Every non-space char must be a border char (corner or horizontal)
  for (const ch of trimmed) {
    if (ch === ' ') continue;
    if (!HORIZONTAL_CHARS.has(ch) && !CORNER_CHARS.has(ch)) return false;
  }
  // Must contain at least some horizontal chars
  return [...trimmed].some(ch => HORIZONTAL_CHARS.has(ch) || CORNER_CHARS.has(ch));
}

/** Check if a line is a content line with vertical delimiters on both sides */
export function isContentLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return VERTICAL_CHARS.has(first) && VERTICAL_CHARS.has(last);
}

/** Find contiguous border-character segments in a line, separated by non-border chars */
export function findBorderSegments(line: string): { start: number; end: number }[] {
  const segments: { start: number; end: number }[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch !== ' ' && (HORIZONTAL_CHARS.has(ch) || CORNER_CHARS.has(ch))) {
      const start = i;
      while (i < line.length && line[i] !== ' ' && (HORIZONTAL_CHARS.has(line[i]) || CORNER_CHARS.has(line[i]))) {
        i++;
      }
      const end = i - 1;
      // Must be at least 3 chars wide (corner + horizontal + corner)
      if (end - start >= 2) {
        segments.push({ start, end });
      }
    } else {
      i++;
    }
  }
  return segments;
}

/** Find a vertical char near a given position (within tolerance) */
function findVerticalNear(line: string, pos: number, tolerance: number): number {
  for (let d = 0; d <= tolerance; d++) {
    if (pos + d < line.length && VERTICAL_CHARS.has(line[pos + d])) return pos + d;
    if (d > 0 && pos - d >= 0 && VERTICAL_CHARS.has(line[pos - d])) return pos - d;
  }
  return -1;
}

/** Check if a column range of a line contains a border segment (all border chars) */
function isBorderSegmentAt(line: string, start: number, end: number): boolean {
  if (end >= line.length) return false;
  for (let i = start; i <= end; i++) {
    const ch = line[i];
    if (!HORIZONTAL_CHARS.has(ch) && !CORNER_CHARS.has(ch)) return false;
  }
  return true;
}

/**
 * Find a border segment near the expected column range (within tolerance).
 * Returns the actual {start, end} of the found segment, or null.
 * This handles misaligned boxes where the bottom border is shorter/longer than the top.
 */
function findBorderSegmentNear(line: string, expectedStart: number, expectedEnd: number, tolerance: number): { start: number; end: number } | null {
  const segments = findBorderSegments(line);
  for (const seg of segments) {
    if (Math.abs(seg.start - expectedStart) <= tolerance &&
        Math.abs(seg.end - expectedEnd) <= tolerance) {
      return seg;
    }
  }
  return null;
}

/** Check if a line has vertical delimiters near the expected segment edges (with tolerance) */
function isContentSegmentAt(line: string, start: number, end: number, tolerance: number = 2): boolean {
  return findVerticalNear(line, start, tolerance) >= 0 && findVerticalNear(line, end, tolerance) >= 0;
}

/** Check if a line is a markdown table separator (| --- | --- |) */
function isMarkdownSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\|[\s\-:]+(\|[\s\-:]+)*\|$/.test(trimmed);
}

/** Check if a line is a markdown table row (| content | content |) */
function isMarkdownRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  // Must have at least one interior pipe
  return trimmed.indexOf('|', 1) < trimmed.length - 1;
}

/** Detect the box style from a border or content line */
export function detectStyle(line: string): BoxStyle {
  if (line.includes('═') || line.includes('║') || line.includes('╔')) return 'double';
  if (line.includes('━') || line.includes('┃') || line.includes('┏')) return 'heavy';
  if (line.includes('─') || line.includes('│') || line.includes('┌')) return 'light';
  return 'ascii';
}

/**
 * Try to detect a lateral box at a specific column range, starting from a top border.
 * Returns the endLine if a valid box is found, or -1 if not.
 */
function detectLateralBox(
  lines: string[],
  topLine: number,
  start: number,
  end: number
): number {
  // Use a wider tolerance for border and content matching to handle misaligned boxes
  // where borders or content are shorter/longer than the top border
  const borderTolerance = Math.max(Math.ceil((end - start) * 0.5), 4);
  const contentTolerance = borderTolerance;
  let j = topLine + 1;
  let hasContent = false;

  while (j < lines.length) {
    const borderSeg = findBorderSegmentNear(lines[j], start, end, borderTolerance);
    if (borderSeg) {
      if (hasContent) {
        // Check for mid-border: is there more content below at same columns?
        let k = j + 1;
        let moreContent = false;
        while (k < lines.length && !findBorderSegmentNear(lines[k], start, end, borderTolerance)) {
          if (isContentSegmentAt(lines[k], start, end, contentTolerance)) {
            moreContent = true;
          } else {
            break;
          }
          k++;
        }
        if (moreContent && k < lines.length && findBorderSegmentNear(lines[k], start, end, borderTolerance)) {
          // Mid-border, keep scanning
          j = k;
          continue;
        }
        // Bottom border found
        return j;
      }
    } else if (isContentSegmentAt(lines[j], start, end, contentTolerance)) {
      hasContent = true;
    } else {
      break;
    }
    j++;
  }

  return -1; // No valid box found
}

/** Detect all ASCII box/table regions in the input text */
export function detectRegions(text: string): Region[] {
  const lines = text.split('\n');
  const regions: Region[] = [];
  const used = new Set<number>();

  // Pass 1: Detect boxes (border-delimited regions)
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    if (!isBorderLine(lines[i])) continue;

    const segments = findBorderSegments(lines[i]);

    if (segments.length > 1) {
      // Lateral detection: try each segment as an independent box
      const lateralRegions: Region[] = [];

      for (const seg of segments) {
        const style = detectStyle(lines[i].substring(seg.start, seg.end + 1));
        const endLine = detectLateralBox(lines, i, seg.start, seg.end);
        if (endLine > 0) {
          lateralRegions.push({
            startLine: i,
            endLine,
            type: 'box',
            style,
            startCol: seg.start,
            endCol: seg.end,
          });
        }
      }

      if (lateralRegions.length >= 2) {
        // Multiple lateral boxes found — emit them and mark lines used
        regions.push(...lateralRegions);
        for (const region of lateralRegions) {
          for (let k = region.startLine; k <= region.endLine; k++) {
            used.add(k);
          }
        }
        continue;
      }
      // If 0 or 1 lateral boxes found, fall through to single-box detection
    }

    // Single-box detection (existing logic)
    const style = detectStyle(lines[i]);
    let j = i + 1;
    let hasContent = false;
    while (j < lines.length) {
      if (isBorderLine(lines[j])) {
        if (hasContent) {
          // This could be a mid-border or bottom border
          // Check if there's more content after
          let k = j + 1;
          let moreContent = false;
          while (k < lines.length && !isBorderLine(lines[k])) {
            if (isContentLine(lines[k])) {
              moreContent = true;
            } else {
              break;
            }
            k++;
          }
          if (moreContent && k < lines.length && isBorderLine(lines[k])) {
            // Mid-border, keep scanning
            j = k;
            continue;
          }
          // Bottom border found
          break;
        }
      } else if (isContentLine(lines[j])) {
        hasContent = true;
      } else {
        break; // Non-box line, stop scanning
      }
      j++;
    }

    if (hasContent && j < lines.length && isBorderLine(lines[j])) {
      regions.push({ startLine: i, endLine: j, type: 'box', style });
      for (let k = i; k <= j; k++) used.add(k);
    }
  }

  // Pass 2: Detect markdown tables
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    if (!isMarkdownRow(lines[i])) continue;

    // Look for a separator line nearby (usually line i+1)
    let start = i;
    let end = i;
    let hasSeparator = false;

    // Scan forward for contiguous markdown table rows
    for (let j = i; j < lines.length; j++) {
      if (isMarkdownRow(lines[j]) || isMarkdownSeparator(lines[j])) {
        if (isMarkdownSeparator(lines[j])) hasSeparator = true;
        end = j;
      } else {
        break;
      }
    }

    if (hasSeparator && end > start) {
      regions.push({ startLine: start, endLine: end, type: 'table', style: 'markdown' });
      for (let k = start; k <= end; k++) used.add(k);
    }
  }

  // Sort by start line, then by start column
  regions.sort((a, b) => {
    if (a.startLine !== b.startLine) return a.startLine - b.startLine;
    return (a.startCol ?? 0) - (b.startCol ?? 0);
  });
  return regions;
}
