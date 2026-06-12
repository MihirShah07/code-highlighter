import * as vscode from 'vscode';
import { HighlightManager } from './HighlightManager';
import { HighlightSidebarProvider } from './HighlightSidebarProvider';
import { HIGHLIGHT_COLORS, HighlightColor } from './types';

/**
 * Extension entry point.
 * Registers commands, event listeners, and the sidebar provider.
 */
export function activate(context: vscode.ExtensionContext) {
  // ─── Core Services ──────────────────────────────────────────
  const manager = new HighlightManager(context.workspaceState);
  const sidebarProvider = new HighlightSidebarProvider(context.extensionUri, manager);

  // Track the active tool (defaults to yellow)
  let activeTool = sidebarProvider.activeTool;

  // Listen for tool changes from the sidebar
  sidebarProvider.onToolChanged = (tool) => {
    activeTool = tool;
    // Show a brief status bar message
    const label = tool === 'eraser' ? '🧹 Eraser' : `🖍️ ${tool.charAt(0).toUpperCase() + tool.slice(1)}`;
    vscode.window.setStatusBarMessage(`Code Highlighter: ${label}`, 2000);
  };

  // ─── Register Sidebar ───────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      HighlightSidebarProvider.viewType,
      sidebarProvider
    )
  );

  // ─── Commands ───────────────────────────────────────────────

  /**
   * Ctrl+Shift+H — Instant highlight or erase
   * - If a color is active: highlights the selection with that color immediately
   * - If eraser is active: removes highlights overlapping with the selection/cursor
   */
  context.subscriptions.push(
    vscode.commands.registerCommand('code-highlighter.addHighlight', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      if (activeTool === 'eraser') {
        // Eraser mode: remove highlights at cursor/selection
        const selection = editor.selection;
        let removed: number;

        if (selection.isEmpty) {
          removed = await manager.removeHighlightsAtPosition(
            editor.document.uri,
            selection.active
          );
        } else {
          removed = await manager.removeHighlightsInRange(
            editor.document.uri,
            selection
          );
        }

        if (removed > 0) {
          manager.applyDecorations(editor);
          sidebarProvider.updateWebview();
          vscode.window.setStatusBarMessage(`Erased ${removed} highlight(s)`, 2000);
        } else {
          vscode.window.setStatusBarMessage('No highlights to erase here', 2000);
        }
        return;
      }

      // Color mode: highlight the selection instantly
      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showWarningMessage('Select some text to highlight');
        return;
      }

      const text = editor.document.getText(selection);
      await manager.addHighlight(editor.document.uri, selection, activeTool as HighlightColor, text);
      manager.applyDecorations(editor);
      sidebarProvider.updateWebview();
    })
  );

  // Remove Highlight at cursor (also available via right-click menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('code-highlighter.removeHighlight', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }

      const selection = editor.selection;
      let removed: number;

      if (selection.isEmpty) {
        removed = await manager.removeHighlightsAtPosition(
          editor.document.uri,
          selection.active
        );
      } else {
        removed = await manager.removeHighlightsInRange(
          editor.document.uri,
          selection
        );
      }

      if (removed > 0) {
        manager.applyDecorations(editor);
        sidebarProvider.updateWebview();
        vscode.window.showInformationMessage(`Removed ${removed} highlight(s)`);
      } else {
        vscode.window.showInformationMessage('No highlight at cursor position');
      }
    })
  );

  // Clear all highlights in the current file
  context.subscriptions.push(
    vscode.commands.registerCommand('code-highlighter.clearFileHighlights', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }

      await manager.clearFileHighlights(editor.document.uri);
      manager.applyDecorations(editor);
      sidebarProvider.updateWebview();
      vscode.window.showInformationMessage('Cleared all highlights in this file');
    })
  );

  // Clear all highlights in the workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('code-highlighter.clearAllHighlights', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Clear ALL highlights in the workspace?',
        { modal: true },
        'Clear All'
      );

      if (confirm === 'Clear All') {
        await manager.clearAllHighlights();
        manager.applyDecorationsToAll();
        sidebarProvider.updateWebview();
        vscode.window.showInformationMessage('Cleared all highlights');
      }
    })
  );

  // ─── Event Listeners ───────────────────────────────────────

  // Refresh decorations when switching editors
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        manager.applyDecorations(editor);
      }
      sidebarProvider.updateWebview();
    })
  );

  // Refresh decorations when editors become visible (e.g. split views)
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) {
        manager.applyDecorations(editor);
      }
    })
  );

  // Track document edits to adjust highlight ranges
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async event => {
      await manager.handleDocumentChange(event);
      // Re-apply decorations to the affected editor
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === event.document.uri.toString()) {
          manager.applyDecorations(editor);
        }
      }
      sidebarProvider.updateWebview();
    })
  );

  // Update sidebar when highlights change (e.g. from sidebar delete)
  context.subscriptions.push(
    manager.onDidChangeHighlights(() => {
      sidebarProvider.updateWebview();
    })
  );

  // ─── Restore on Activation ─────────────────────────────────
  // Apply decorations to all currently open editors
  manager.applyDecorationsToAll();

  // ─── Disposable ────────────────────────────────────────────
  context.subscriptions.push({ dispose: () => manager.dispose() });
}

export function deactivate() {
  // Cleanup handled by disposables
}
