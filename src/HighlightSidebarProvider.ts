import * as vscode from 'vscode';
import { HighlightManager } from './HighlightManager';
import { Highlight, HighlightColor } from './types';

/** The active tool — either a color or the eraser */
export type ActiveTool = HighlightColor | 'eraser';

/**
 * Provides the webview content for the Highlights sidebar panel.
 * Features a toolbar with color selection, eraser, clear file, clear all,
 * and a scrollable list of highlights for the active file.
 */
export class HighlightSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'code-highlighter.sidebar';
  private _view?: vscode.WebviewView;
  private _activeTool: ActiveTool = 'yellow';

  /** Callback invoked when the user selects a tool in the sidebar */
  public onToolChanged?: (tool: ActiveTool) => void;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly highlightManager: HighlightManager
  ) {}

  public get activeTool(): ActiveTool {
    return this._activeTool;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'selectTool': {
          this._activeTool = message.tool as ActiveTool;
          this.onToolChanged?.(this._activeTool);
          this.updateWebview();
          break;
        }
        case 'navigate': {
          const highlight: Highlight = message.highlight;
          const uri = vscode.Uri.parse(highlight.uri);
          const range = new vscode.Range(
            highlight.startLine, highlight.startChar,
            highlight.endLine, highlight.endChar
          );
          const doc = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(doc);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.selection = new vscode.Selection(range.start, range.end);
          break;
        }
        case 'delete': {
          await this.highlightManager.removeHighlight(message.id);
          this.highlightManager.applyDecorationsToAll();
          break;
        }        case 'clearFile': {

          const activeUri = vscode.window.activeTextEditor?.document.uri;
          if (activeUri) {
            await this.highlightManager.clearFileHighlights(activeUri);
            this.highlightManager.applyDecorationsToAll();
          }
          break;
        }
        case 'clearAll': {
          const confirm = await vscode.window.showWarningMessage(
            'Clear ALL highlights across the entire workspace?',
            { modal: true },
            'Clear All'
          );
          if (confirm === 'Clear All') {
            await this.highlightManager.clearAllHighlights();
            this.highlightManager.applyDecorationsToAll();
            vscode.window.showInformationMessage('Cleared all highlights');
          }
          break;
        }
      }
    });

    this.updateWebview();
  }

  /**
   * Refresh the webview content with current highlight data.
   */
  public updateWebview(): void {
    if (!this._view) { return; }

    const activeEditor = vscode.window.activeTextEditor;
    const highlights = activeEditor
      ? this.highlightManager.getHighlights(activeEditor.document.uri)
      : [];
    const fileName = activeEditor
      ? activeEditor.document.fileName.split(/[\\/]/).pop() || 'Unknown'
      : null;
    const allCount = this.highlightManager.getHighlights().length;

    this._view.webview.html = this.getHtml(highlights, fileName, allCount);
  }

  private getHtml(highlights: Highlight[], fileName: string | null, allCount: number): string {
    const colors: { name: HighlightColor; hex: string; label: string }[] = [
      { name: 'yellow', hex: '#FFEB3B', label: 'Yellow' },
      { name: 'green',  hex: '#4CAF50', label: 'Green' },
      { name: 'blue',   hex: '#42A5F5', label: 'Blue' },
      { name: 'pink',   hex: '#EC407A', label: 'Pink' },
      { name: 'orange', hex: '#FF9800', label: 'Orange' },
      { name: 'red',    hex: '#F44336', label: 'Red' },
    ];

    const colorButtons = colors.map(c => {
      const isActive = this._activeTool === c.name;
      return `<button class="color-btn ${isActive ? 'active' : ''}" data-tool="${c.name}" title="${c.label}" style="--btn-color: ${c.hex};">
        <span class="color-dot" style="background: ${c.hex};"></span>
      </button>`;
    }).join('\n');

    const isEraser = this._activeTool === 'eraser';

    const highlightItems = highlights.map(h => {
      const escapedText = this.escapeHtml(h.text);
      const swatch = colors.find(c => c.name === h.color)?.hex || '#888';
      return `
        <div class="highlight-item" data-id="${h.id}">
          <div class="highlight-header">
            <span class="color-swatch" style="background: ${swatch};"></span>
            <span class="line-info">
              <span class="line-range">L${h.startLine + 1}${h.endLine !== h.startLine ? '–' + (h.endLine + 1) : ''}</span>
            </span>
            <button class="delete-btn" title="Remove highlight" data-id="${h.id}">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="highlight-text" title="${escapedText}">${escapedText}</div>
        </div>`;
    }).join('\n');

    const emptyState = highlights.length === 0
      ? `<div class="empty-state">
           <div class="empty-icon">
             <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
               <rect x="8" y="10" width="20" height="22" rx="2" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
               <line x1="12" y1="16" x2="24" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
               <line x1="12" y1="20" x2="22" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
               <line x1="12" y1="24" x2="20" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
               <rect x="10" y="15" width="14" height="4" rx="1" fill="#FFEB3B" opacity="0.35"/>
             </svg>
           </div>
           <p class="empty-title">No highlights in this file</p>
           <p class="empty-desc">Select text and press <kbd>Ctrl+Alt+H</kbd><br/>to highlight with the active color</p>
         </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      overflow-x: hidden;
    }

    /* ─── Toolbar ─────────────────────────────── */

    .toolbar {
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      position: sticky;
      top: 0;
      background: var(--vscode-sideBar-background);
      z-index: 10;
    }

    .toolbar-section {
      margin-bottom: 8px;
    }

    .toolbar-section:last-child {
      margin-bottom: 0;
    }

    .toolbar-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      opacity: 0.5;
      margin-bottom: 6px;
      font-weight: 600;
    }

    .color-palette {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .color-btn {
      width: 30px;
      height: 30px;
      border: 2px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vscode-editor-background);
      transition: all 0.15s ease;
      position: relative;
    }

    .color-btn:hover {
      border-color: var(--btn-color);
      transform: scale(1.1);
    }

    .color-btn.active {
      border-color: var(--btn-color);
      background: color-mix(in srgb, var(--btn-color) 15%, var(--vscode-editor-background));
      box-shadow: 0 0 8px color-mix(in srgb, var(--btn-color) 30%, transparent);
    }

    .color-btn.active::after {
      content: '';
      position: absolute;
      bottom: -4px;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--btn-color);
    }

    .color-dot {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      transition: transform 0.15s;
    }

    .color-btn.active .color-dot {
      transform: scale(1.15);
    }

    .tool-row {
      display: flex;
      gap: 4px;
    }

    .tool-btn {
      flex: 1;
      padding: 6px 8px;
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      border-radius: 5px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .tool-btn:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }

    .tool-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    .tool-btn.danger:hover {
      background: rgba(244, 67, 54, 0.15);
      border-color: rgba(244, 67, 54, 0.5);
      color: #F44336;
    }

    .tool-btn svg {
      flex-shrink: 0;
    }

    /* ─── File Header ────────────────────────── */

    .content {
      padding: 10px 12px;
    }

    .file-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 10px;
      background: var(--vscode-editor-background);
      border-radius: 6px;
      margin-bottom: 8px;
      font-weight: 600;
      font-size: 12px;
    }

    .file-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .highlight-count {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 7px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      min-width: 18px;
      text-align: center;
    }

    /* ─── Highlight Items ────────────────────── */

    .highlight-item {
      background: var(--vscode-editor-background);
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid transparent;
    }

    .highlight-item:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
      transform: translateX(2px);
    }

    .highlight-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 3px;
    }

    .color-swatch {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    .line-info {
      flex: 1;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .line-range {
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      opacity: 0.8;
    }

    .delete-btn {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      opacity: 0;
      cursor: pointer;
      padding: 3px;
      border-radius: 3px;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .highlight-item:hover .delete-btn {
      opacity: 0.5;
    }

    .delete-btn:hover {
      opacity: 1 !important;
      background: rgba(244, 67, 54, 0.2);
      color: #F44336;
    }

    .highlight-text {
      font-size: 11px;
      opacity: 0.5;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding-left: 18px;
      font-family: var(--vscode-editor-font-family, monospace);
    }

    /* ─── Empty State ────────────────────────── */

    .empty-state {
      text-align: center;
      padding: 30px 16px;
      opacity: 0.6;
    }

    .empty-icon {
      margin-bottom: 10px;
    }

    .empty-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .empty-desc {
      font-size: 11px;
      line-height: 1.6;
    }

    kbd {
      background: var(--vscode-keybindingLabel-background, rgba(128,128,128,0.15));
      border: 1px solid var(--vscode-keybindingLabel-border, rgba(128,128,128,0.3));
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 11px;
      font-family: inherit;
    }

    /* ─── Status Indicator ───────────────────── */

    .status-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      font-size: 10px;
      opacity: 0.5;
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
      margin-top: 8px;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <!-- ─── Toolbar ─────────────────────────── -->
  <div class="toolbar">
    <div class="toolbar-section">
      <div class="toolbar-label">Color</div>
      <div class="color-palette">
        ${colorButtons}
      </div>
    </div>

    <div class="toolbar-section">
      <div class="toolbar-label">Tools</div>
      <div class="tool-row">
        <button class="tool-btn ${isEraser ? 'active' : ''}" id="eraserBtn" title="Eraser — select highlighted text and press Ctrl+Alt+H to erase">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8.5 2.5L14 8L9 13H5L2 10L8.5 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            <path d="M5 13L2 10L6.5 5.5L11 10L9 13" fill="currentColor" opacity="0.15"/>
            <line x1="3" y1="14" x2="14" y2="14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Eraser
        </button>
      </div>
    </div>

    <div class="toolbar-section">
      <div class="toolbar-label">Actions</div>
      <div class="tool-row">
        <button class="tool-btn" id="clearFileBtn" title="Clear all highlights in the current file">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="4" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <line x1="6" y1="7" x2="10" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <line x1="10" y1="7" x2="6" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Clear File
        </button>
        <button class="tool-btn danger" id="clearAllBtn" title="Clear ALL highlights in the workspace">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 5H12L11 14H5L4 5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            <line x1="2.5" y1="5" x2="13.5" y2="5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M6 5V3.5C6 3.2 6.2 3 6.5 3H9.5C9.8 3 10 3.2 10 3.5V5" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          Clear All
        </button>
      </div>
    </div>
  </div>

  <!-- ─── Highlight List ─────────────────── -->
  <div class="content">
    ${fileName ? `
    <div class="file-header">
      <span class="file-name">📄 ${this.escapeHtml(fileName)}</span>
      <span class="highlight-count">${highlights.length}</span>
    </div>` : ''}

    <div class="highlights-list">
      ${highlightItems}
      ${emptyState}
    </div>

    ${allCount > 0 ? `
    <div class="status-bar">
      <span class="status-dot" style="background: var(--vscode-charts-green, #4CAF50);"></span>
      <span>${allCount} highlight${allCount !== 1 ? 's' : ''} across workspace</span>
    </div>` : ''}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const highlights = ${JSON.stringify(highlights)};

    // ─── Color / Eraser selection ────────────────
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ command: 'selectTool', tool: btn.dataset.tool });
      });
    });

    document.getElementById('eraserBtn')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'selectTool', tool: 'eraser' });
    });

    // ─── Clear actions ──────────────────────────
    document.getElementById('clearFileBtn')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'clearFile' });
    });

    document.getElementById('clearAllBtn')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'clearAll' });
    });

    // ─── Navigate to highlight ──────────────────
    document.querySelectorAll('.highlight-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        const id = item.dataset.id;
        const highlight = highlights.find(h => h.id === id);
        if (highlight) {
          vscode.postMessage({ command: 'navigate', highlight });
        }
      });
    });

    // ─── Delete individual highlight ────────────
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ command: 'delete', id: btn.dataset.id });
      });
    });
  </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
