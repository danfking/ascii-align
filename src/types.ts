/** The style of box-drawing characters used */
export type BoxStyle = 'ascii' | 'light' | 'heavy' | 'double' | 'markdown';

/** A detected region of ASCII structure in the input text */
export interface Region {
  /** Index of the first line in the region */
  startLine: number;
  /** Index of the last line (inclusive) in the region */
  endLine: number;
  /** The type of structure detected */
  type: 'box' | 'table';
  /** The box-drawing style used */
  style: BoxStyle;
  /** Column where this box starts (undefined = full line) */
  startCol?: number;
  /** Column where this box ends, inclusive */
  endCol?: number;
}

/** Box-drawing character set for a given style */
export interface BoxChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  teeLeft: string;
  teeRight: string;
  teeDown: string;
  teeUp: string;
  cross: string;
}
