import stringWidth from 'string-width';

/**
 * Replace tab characters with spaces aligned to tab stops.
 */
export function expandTabs(str: string, tabSize = 8): string {
  let result = '';
  let col = 0;
  for (const ch of str) {
    if (ch === '\t') {
      const spaces = tabSize - (col % tabSize);
      result += ' '.repeat(spaces);
      col += spaces;
    } else {
      result += ch;
      col += stringWidth(ch);
    }
  }
  return result;
}

/**
 * Get the visual display width of a string.
 * Handles CJK characters (width 2), emoji, ANSI escape codes, tabs, etc.
 */
export function visualWidth(str: string): number {
  return stringWidth(expandTabs(str));
}

/**
 * Pad a string on the right to reach a target visual width.
 * Unlike String.padEnd, this accounts for wide characters.
 */
export function visualPadEnd(str: string, targetWidth: number, fillChar: string = ' '): string {
  const currentWidth = visualWidth(str);
  if (currentWidth >= targetWidth) return str;
  return str + fillChar.repeat(targetWidth - currentWidth);
}

/**
 * Pad a string on the left to reach a target visual width.
 */
export function visualPadStart(str: string, targetWidth: number, fillChar: string = ' '): string {
  const currentWidth = visualWidth(str);
  if (currentWidth >= targetWidth) return str;
  return fillChar.repeat(targetWidth - currentWidth) + str;
}
