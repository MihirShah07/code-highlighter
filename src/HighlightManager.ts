import * as vscode from 'vscode';
import { Highlight, HighlightColor, HighlightStore } from './types';

/** Background color definitions for each highlight color */
const COLOR_DEFINITIONS: Record<HighlightColor, vscode.DecorationRenderOptions> = {
  yellow:  { backgroundColor: 'rgba(255, 235, 59, 0.35)', borderRadius: '2px' },
  green:   { backgroundColor: 'rgba(76, 175, 80, 0.35)',  borderRadius: '2px' },
  blue:    { backgroundColor: 'rgba(66, 165, 245, 0.35)', borderRadius: '2px' },
  pink:    { backgroundColor: 'rgba(236, 64, 122, 0.35)', borderRadius: '2px' },
  orange:  { backgroundColor: 'rgba(255, 152, 0, 0.35)',  borderRadius: '2px' },
  red:     { backgroundColor: 'rgba(244, 67, 54, 0.35)',  borderRadius: '2px' },
};

const STORAGE_KEY = 'codeHighlighter.highlights';

/**
 * Core highlight management class.
 * Handles adding, removing, persisting, and rendering highlights.
 */
export class HighlightManager {
  private store: HighlightStore = {};
  private decorationTypes: Map<HighlightColor, vscode.TextEditorDecorationType> = new Map();
  private _onDidChangeHighlights = new vscode.EventEmitter<void>();
  public readonly onDidChangeHighlights = this._onDidChangeHighlights.event;

  constructor(private workspaceState: vscode.Memento) {
    // Create one decoration type per color (reused across files)
    for (const [color, opts] of Object.entries(COLOR_DEFINITIONS)) {
      this.decorationTypes.set(
        color as HighlightColor,
        vscode.window.createTextEditorDecorationType(opts)
      );
    }

    // Load persisted highlights
    this.load();
  }

  // ─── Persistence ──────────────────────────────────────────────

  private load(): void {
    this.store = this.workspaceState.get<HighlightStore>(STORAGE_KEY, {});
  }

  private async save(): Promise<void> {
    await this.workspaceState.update(STORAGE_KEY, this.store);
  }

  // ─── CRUD Operations ─────────────────────────────────────────

  /**
   * Add a highlight for the given range and color.
   * Returns the created Highlight.
   */
  public async addHighlight(
    uri: vscode.Uri,
    range: vscode.Range,
    color: HighlightColor,
    text: string
  ): Promise<Highlight> {
    const id = this.generateId();
    const highlight: Highlight = {
      id,
      uri: uri.toString(),
      startLine: range.start.line,
      startChar: range.start.character,
      endLine: range.end.line,
      endChar: range.end.character,
      color,
      text: text.substring(0, 100), // Truncate preview to 100 chars
    };

    const key = uri.toString();
    if (!this.store[key]) {
      this.store[key] = [];
    }
    this.store[key].push(highlight);

    await this.save();
    this._onDidChangeHighlights.fire();
    return highlight;
  }

  /**
   * Remove a specific highlight by ID.
   */
  public async removeHighlight(id: string): Promise<void> {
    for (const key of Object.keys(this.store)) {
      const idx = this.store[key].findIndex(h => h.id === id);
      if (idx !== -1) {
        this.store[key].splice(idx, 1);
        if (this.store[key].length === 0) {
          delete this.store[key];
        }
        await this.save();
        this._onDidChangeHighlights.fire();
        return;
      }
    }
  }

  /**
   * Remove all highlights that overlap with a given position in a file.
   */
  public async removeHighlightsAtPosition(
    uri: vscode.Uri,
    position: vscode.Position
  ): Promise<number> {
    const key = uri.toString();
    const highlights = this.store[key];
    if (!highlights) { return 0; }

    const toRemove: string[] = [];
    for (const h of highlights) {
      const range = new vscode.Range(h.startLine, h.startChar, h.endLine, h.endChar);
      if (range.contains(position)) {
        toRemove.push(h.id);
      }
    }

    if (toRemove.length === 0) { return 0; }

    this.store[key] = highlights.filter(h => !toRemove.includes(h.id));
    if (this.store[key].length === 0) {
      delete this.store[key];
    }

    await this.save();
    this._onDidChangeHighlights.fire();
    return toRemove.length;
  }

  /**
   * Remove all highlights that overlap with a given range in a file.
   * Used by the eraser tool when the user has a selection.
   */
  public async removeHighlightsInRange(
    uri: vscode.Uri,
    range: vscode.Range
  ): Promise<number> {
    const key = uri.toString();
    const highlights = this.store[key];
    if (!highlights) { return 0; }

    const toRemove: string[] = [];
    for (const h of highlights) {
      const hRange = new vscode.Range(h.startLine, h.startChar, h.endLine, h.endChar);
      // Check if the highlight range intersects with the given range
      if (!(hRange.end.isBefore(range.start) || hRange.start.isAfter(range.end))) {
        toRemove.push(h.id);
      }
    }

    if (toRemove.length === 0) { return 0; }

    this.store[key] = highlights.filter(h => !toRemove.includes(h.id));
    if (this.store[key].length === 0) {
      delete this.store[key];
    }

    await this.save();
    this._onDidChangeHighlights.fire();
    return toRemove.length;
  }

  /**
   * Clear all highlights in a specific file.
   */
  public async clearFileHighlights(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    if (this.store[key]) {
      delete this.store[key];
      await this.save();
      this._onDidChangeHighlights.fire();
    }
  }

  /**
   * Clear every highlight in the workspace.
   */
  public async clearAllHighlights(): Promise<void> {
    this.store = {};
    await this.save();
    this._onDidChangeHighlights.fire();
  }

  // ─── Querying ─────────────────────────────────────────────────

  /**
   * Get all highlights, optionally filtered by file URI.
   */
  public getHighlights(uri?: vscode.Uri): Highlight[] {
    if (uri) {
      return this.store[uri.toString()] || [];
    }
    return Object.values(this.store).flat();
  }

  // ─── Decoration Rendering ─────────────────────────────────────

  /**
   * Apply decorations to the given text editor based on stored highlights.
   */
  public applyDecorations(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.toString();
    const highlights = this.store[uri] || [];

    // Group highlights by color
    const byColor = new Map<HighlightColor, vscode.Range[]>();
    for (const color of this.decorationTypes.keys()) {
      byColor.set(color, []);
    }

    for (const h of highlights) {
      const range = new vscode.Range(h.startLine, h.startChar, h.endLine, h.endChar);
      byColor.get(h.color)?.push(range);
    }

    // Set decorations per color
    for (const [color, decorationType] of this.decorationTypes) {
      editor.setDecorations(decorationType, byColor.get(color) || []);
    }
  }

  /**
   * Apply decorations to all currently visible editors.
   */
  public applyDecorationsToAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.applyDecorations(editor);
    }
  }

  // ─── Document Change Tracking ─────────────────────────────────

  /**
   * Handle text document changes by adjusting highlight ranges.
   * When lines are inserted or deleted, shifts all highlights
   * that come after the edit point.
   */
  public async handleDocumentChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
    const key = event.document.uri.toString();
    const highlights = this.store[key];
    if (!highlights || highlights.length === 0) { return; }

    let changed = false;

    for (const change of event.contentChanges) {
      const editStartLine = change.range.start.line;
      const editEndLine = change.range.end.line;
      const linesDeleted = editEndLine - editStartLine;
      const newLines = change.text.split('\n').length - 1;
      const lineDelta = newLines - linesDeleted;

      // Remove highlights that are fully contained within the deleted range,
      // and shift highlights that come after.
      const toRemove: string[] = [];

      for (const h of highlights) {
        // Highlight is entirely before the edit — no change needed
        if (h.endLine < editStartLine) {
          continue;
        }

        // Highlight starts after or at the end of the edit range — shift it
        if (h.startLine > editEndLine) {
          h.startLine += lineDelta;
          h.endLine += lineDelta;
          changed = true;
          continue;
        }

        // Highlight overlaps with the edit — mark for removal
        // (too complex to reliably adjust character offsets within edited ranges)
        if (linesDeleted > 0 && h.startLine >= editStartLine && h.endLine <= editEndLine) {
          toRemove.push(h.id);
          changed = true;
          continue;
        }

        // Highlight starts before edit but extends past it — adjust end
        if (h.startLine < editStartLine && h.endLine >= editStartLine) {
          h.endLine += lineDelta;
          changed = true;
          continue;
        }

        // Highlight starts within the edit range but extends past — adjust start
        if (h.startLine >= editStartLine && h.startLine <= editEndLine && h.endLine > editEndLine) {
          h.startLine = editStartLine + newLines;
          h.startChar = 0;
          h.endLine += lineDelta;
          changed = true;
        }
      }

      // Remove fully-deleted highlights
      if (toRemove.length > 0) {
        this.store[key] = highlights.filter(h => !toRemove.includes(h.id));
        if (this.store[key].length === 0) {
          delete this.store[key];
        }
      }
    }

    if (changed) {
      await this.save();
      this._onDidChangeHighlights.fire();
    }
  }

  // ─── Utilities ────────────────────────────────────────────────

  private generateId(): string {
    // Simple UUID v4 generation without external dependency
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Dispose all decoration types when the extension deactivates.
   */
  public dispose(): void {
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this._onDidChangeHighlights.dispose();
  }
}
