/**
 * Shared type definitions for the Code Highlighter extension.
 */

/** Available highlight colors */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'red';

/** A single highlight instance */
export interface Highlight {
  /** Unique identifier (UUID) */
  id: string;
  /** File URI string (e.g. file:///path/to/file.ts) */
  uri: string;
  /** Start line (0-indexed) */
  startLine: number;
  /** Start character offset (0-indexed) */
  startChar: number;
  /** End line (0-indexed) */
  endLine: number;
  /** End character offset (0-indexed) */
  endChar: number;
  /** Highlight color */
  color: HighlightColor;
  /** Preview text snippet of highlighted content */
  text: string;
}

/** Map from file URI → array of Highlight objects */
export type HighlightStore = Record<string, Highlight[]>;

/** All supported colors with display metadata */
export const HIGHLIGHT_COLORS: HighlightColor[] = [
  'yellow', 'green', 'blue', 'pink', 'orange', 'red'
];
