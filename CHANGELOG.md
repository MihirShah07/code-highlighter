# Changelog

All notable changes to the **Code Highlighter** extension will be documented in this file.

## [1.1.0] — 2025-06-11

### ✨ New Features

- **Toolbar sidebar** — color palette, eraser toggle, Clear File, and Clear All buttons in a sticky toolbar
- **Eraser tool** — select eraser in the toolbar, then `Ctrl+Alt+H` removes highlights at cursor/selection
- **Instant highlighting** — `Ctrl+Alt+H` now highlights immediately with the active color (no picker dialog)
- **Workspace-wide highlight count** shown in the sidebar status bar

### 🔧 Changes

- **Keybinding changed** from `Ctrl+Shift+H` → `Ctrl+Alt+H` to avoid conflict with VS Code's built-in Replace in Files
- Added marketplace metadata (icon, keywords, categories, gallery banner)
- Added LICENSE, CHANGELOG, and comprehensive README with screenshots
- Added `npm run package` and `npm run publish` scripts

## [1.0.0] — 2025-06-11

### 🎉 Initial Release

- **6 highlight colors** — Yellow, Green, Blue, Pink, Orange, Red
- **Sidebar toolbar** with color palette, eraser, Clear File, and Clear All
- **Keyboard shortcut** — `Ctrl+Alt+H` / `Cmd+Alt+H` for instant highlighting
- **Eraser tool** — remove highlights by selecting them and pressing the shortcut
- **Persistent highlights** — saved per workspace, survives VS Code restarts
- **Edit-aware** — highlights shift automatically when code is inserted or deleted
- **Right-click menu** — Highlight Selection and Remove Highlight at Cursor
- **Click-to-navigate** — click a highlight in the sidebar to jump to it in the editor
- **Activity Bar icon** — dedicated highlighter panel in the sidebar
