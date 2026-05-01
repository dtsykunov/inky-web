# Inky Web — Implementation Notes

This document describes the internal architecture of the web build: which parts of the original Inky desktop editor are reused unchanged, which were reimplemented for the browser, and which features were deliberately omitted.

---

## Architecture Overview

The web build is a thin browser wrapper around the original Electron renderer code. Rather than rewriting the editor from scratch, the approach is to shim the three external dependencies that Electron code relies on — `electron` IPC, `fs`, and file-watchers — so that the existing renderer modules run unchanged in a browser bundle.

```
┌─────────────────────────────────────────────────────┐
│                 Browser (index.html)                │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │         web-controller.js (entry point)      │  │
│  │  • Menu bar, keyboard shortcuts              │  │
│  │  • Wires all views together via events       │  │
│  │  • File state management                     │  │
│  │  • Preferences persisted to localStorage     │  │
│  └────────────────┬─────────────────────────────┘  │
│                   │                                 │
│       ┌───────────┼────────────┐                   │
│       ▼           ▼            ▼                   │
│  ┌─────────┐ ┌──────────┐ ┌────────┐              │
│  │ORIGINAL │ │   WEB-   │ │ SHIMS  │              │
│  │RENDERER │ │SPECIFIC  │ │        │              │
│  ├─────────┤ ├──────────┤ ├────────┤              │
│  │EditorV. │ │LiveComp. │ │electro │              │
│  │PlayerV. │ │FileIO    │ │fs      │              │
│  │NavView  │ │Export    │ │path    │              │
│  │Toolbar  │ │Snippets  │ │chokidar│              │
│  │GotoAny. │ │          │ │mkdirp  │              │
│  │InkProj. │ │          │ │assert  │              │
│  │NavHist. │ │          │ │buffer  │              │
│  └─────────┘ └──────────┘ └────────┘              │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  npm dependencies                            │  │
│  │  inkjs · Ace · jQuery · JSZip · esbuild      │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  localStorage                                │  │
│  │  inky-web-project · theme · zoom · prefs     │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Original Code Reused Unchanged

These modules from `app/renderer/` are bundled and executed in the browser without modification. They work because their only external dependencies are shimmed.

| Module | Role |
|---|---|
| `editorView.js` | Ace editor integration, syntax highlighting, error markers, jump-to-definition |
| `playerView.js` | Story playback UI, choices, text animation, tags, session management |
| `navView.js` | File browser sidebar, knot/stitch browser, "Add new include" button |
| `toolbarView.js` | Toolbar buttons, issue summary, rewind / step-back |
| `goto.js` | Go-to-anything dialog (Ctrl+P), fuzzy file/knot/line search |
| `inkProject.js` | In-memory project structure, file collections, include resolution |
| `navHistory.js` | Navigation history, back/forward buttons |
| `inkFile.js` | Individual file representation |
| `inkCompleter.js` | Ace autocomplete for ink keywords |
| `split.js` | Draggable split pane between editor and player |
| `contextmenu.js` | Right-click context menu in the editor |
| `i18n.js` | Locale/string lookup |
| `util.js` | Shared utilities |

The original CSS (`main.css`, `dark.css`, `contrast.css`, `focus.css`, `inkTheme.css`) is also copied to `dist/` and loaded unchanged. `web.css` adds web-specific overrides on top.

---

## Node / Electron Dependencies — Shims

Because the renderer code uses Node built-ins and Electron APIs, a set of no-op or minimal shims lives in `web/shims/`. esbuild resolves module names to these files at bundle time.

| Shim | Original module | Strategy |
|---|---|---|
| `electron.js` | `electron` | Full event-emitter implementation — `ipcRenderer.on/once/emit/removeListener`. Needed so `goto.js` can listen for `goto-anything` and the menu can fire it. |
| `path.js` | `path` | Delegates to `path-browserify` npm package. |
| `fs.js` | `fs` | All methods are stubs that call their error callbacks. Real I/O is in `web-fileio.js`. |
| `chokidar.js` | `chokidar` | Returns a dummy watcher (`on()`, `close()`). File watching has no meaning in the browser. |
| `mkdirp.js` | `mkdirp` | No-op. Creating directories on disk is not applicable. |
| `assert.js` | `assert` | `console.warn` on failure rather than throwing, to prevent crashes from assertions in library code. |
| `buffer.js` | `buffer` | Delegates to the `buffer` npm package, used internally by inkjs. |

A custom esbuild plugin intercepts `require('./liveCompiler.js')` inside `inkProject.js` and redirects it to `web-liveCompiler.js`, replacing the Electron-specific inklecate compiler with an in-browser inkjs implementation.

---

## Features Reimplemented with Alternative Approaches

### Ink Compilation

**Original:** spawns `inklecate` (C# executable) via Electron IPC, receives JSON story output.

**Web:** uses [inkjs](https://github.com/y-lohse/inkjs) entirely in-browser. `web-liveCompiler.js` wraps the inkjs `Compiler` class and provides the same event-based API the rest of the app expects (`compileComplete`, `errorsAdded`, `textAdded`, `choiceAdded`, etc.).

One subtlety: inkjs throws `"Compilation failed."` for syntax errors after populating `compiler.errors`, rather than passing errors through the normal channel. The catch block in `web-liveCompiler.js` reads `compiler.errors` / `compiler.warnings` / `compiler.authorMessages` explicitly to surface structured issues via `errorsAdded`.

The replay-on-recompile loop (storing the sequence of chosen indices and replaying them after each recompile) is implemented in `web-liveCompiler.js` rather than the original's approach.

**Trade-off:** inkjs is accurate but lacks inklecate's source maps and runtime path information. Watch expressions and expression evaluation (`evaluateExpression`) are therefore not available.

### File I/O

**Original:** native OS file dialogs and `fs` APIs via Electron.

**Web (`web-fileio.js`):**
- **Open** — `<input type="file">` element triggered programmatically; supports multi-file selection and drag-and-drop.
- **Save** — `Blob` + `URL.createObjectURL` + a synthetic `<a download>` click. Multi-file projects are zipped with JSZip.
- **New** — clears in-memory state; no disk write needed.
- **Auto-save** — every editor change calls `autosave()`, which serialises the full project to `localStorage` under the key `inky-web-project` (V2 format). On page load, `loadFromLocalStorage()` restores the last session. A V1 fallback (single file, separate key) is supported for backward compatibility.
- `init()` returns `{ doNew, doOpen, doSave }` action functions consumed by the File menu; no toolbar buttons are injected.

### Menu Bar

**Original:** native Electron menus (`app/main-process/appmenus.js`) with IPC callbacks.

**Web:** a custom HTML menu bar built entirely in `web-controller.js` (the `// ---- Menu bar` IIFE). It mirrors the original menu structure:

| Menu | Contents |
|---|---|
| **File** | New, Open…, Save/Download, Export to JSON…, Export for web… |
| **Edit** | Find…, Find & Replace… |
| **View** | Theme (radio: Light/Dark/Contrast/Focus), Autocomplete, Play view animation |
| **Story** | Go to anything…, Next Issue, Show tags toggle, Story statistics… |
| **Ink** | All built-in snippet categories as hover submenus |
| **Help** | Keyboard shortcuts… |

Submenus use `mouseenter`-driven positioning with viewport-edge detection. Theme classes are applied to both `.window` and `document.body` so that dropdowns and modals (appended to `<body>` outside `.window`) inherit dark/contrast/focus styles correctly.

### Theme System

**Original:** persisted in an Electron preferences file, applied via IPC.

**Web:** stored in `localStorage` under the key `theme`. `updateTheme()` toggles CSS classes on both `.window` and `document.body`. Theme CSS files are unchanged originals.

### Zoom

**Original:** `webContents.setZoomFactor()` scales the entire Electron window.

**Web:** `ace.edit('editor').setFontSize(px)` for the editor pane and `document.getElementById('player').style.fontSize = px` for the player pane. The menubar and toolbar use fixed `font-size` values in CSS and are unaffected. Zoom index is persisted to `localStorage`.

### Export as Web Player

**Original:** spawns inklecate for compilation, uses Electron's file-save dialog.

**Web (`web-export.js`):** compiles with inkjs, fetches the player template files from `export-template/` (copied to `dist/` by `build.mjs`), assembles the zip with JSZip, and triggers a browser download. Entirely client-side.

`exportJson()` similarly compiles with inkjs and triggers a download of the raw story JSON.

### Ink Snippets

**Original:** loaded from `app/main-process/ink/longer-ink-snippets/*.ink` files at runtime by the Electron main process.

**Web:** `build.mjs` reads those same `.ink` files at build time and writes them as JSON into `web-snippets-generated.js`. `web-snippets.js` imports that generated file and exports the full categorised snippet array used by the Ink menu.

### Preferences

**Original:** `settings.json` file on disk.

**Web:** `localStorage` keys:
- `theme` — active theme name
- `autocomplete` — `"true"` / `"false"`
- `animation` — `"true"` / `"false"`
- `tags` — `"true"` / `"false"`
- `zoom-idx` — integer index into zoom steps array

### File Rename

**Original:** OS file rename dialog / sidebar inline edit (platform-dependent).

**Web:** double-clicking a filename in the file sidebar activates an inline `<input>` that replaces the filename text. Enter or blur commits; Escape cancels. `INCLUDE` references in all sibling files are updated automatically by `renameInkFile()` in `web-controller.js`.

---

## Omitted Features

| Feature | Why omitted |
|---|---|
| **Watch expressions / expression evaluation** | Requires inklecate's runtime debugger and source-map information. inkjs does not expose this. |
| **Open Recent** | Would need a persistent file-path list. Browser security prevents storing file-system paths; the auto-restore from localStorage fills most of the same need. |
| **Export story.js only** (Ctrl+Alt+S) | Low demand; the JSON export covers the same use case. |
| **Window menu** (Minimize, Close, Developer) | Browser window management belongs to the OS/browser, not the app. |
| **Full-screen toggle in menu** | F11 / browser-native full-screen works without app involvement. |
| **About dialog** | No version number or update mechanism is meaningful in a web deployment. |
| **Show Documentation** (Help menu) | A static link would go stale; users can reach docs from the ink GitHub repo directly. |
| **Multi-window / multi-project** | Browser tabs provide this naturally. |
| **Undo / Redo in Edit menu** | Ace provides Ctrl+Z / Ctrl+Shift+Z natively; duplicating it in a menu adds no value. |
| **Ctrl+Alt+N New Included Ink File** | Replaced by the sidebar "+" button which provides the same workflow with a visible UI. |

---

## File Structure

```
web/
├── build.mjs                   # esbuild build script + asset pipeline
├── index.html                  # HTML shell (loaded by browser)
├── web.css                     # Web-specific CSS overrides
├── web-controller.js           # Entry point — wires all views, menu bar, preferences
├── web-fileio.js               # Browser file I/O (open/save/drag-drop/localStorage)
├── web-liveCompiler.js         # In-browser ink compiler (wraps inkjs)
├── web-export.js               # Export as web player zip / export JSON
├── web-snippets.js             # Ink snippets definitions (references generated file)
├── web-snippets-generated.js   # Auto-generated by build.mjs (gitignored)
├── favicon-32.png              # 32×32 favicon (generated from resources/Icon1024.png)
├── favicon-180.png             # 180×180 Apple touch icon
├── shims/
│   ├── electron.js             # ipcRenderer event emitter
│   ├── fs.js                   # No-op file system stubs
│   ├── path.js                 # Delegates to path-browserify
│   ├── chokidar.js             # No-op file watcher
│   ├── mkdirp.js               # No-op
│   ├── assert.js               # console.warn instead of throw
│   └── buffer.js               # Delegates to buffer npm package
├── node_modules/               # inkjs, JSZip, esbuild, path-browserify, buffer
└── dist/                       # Build output (gitignored)
    ├── bundle.js               # Bundled application
    ├── index.html
    ├── web.css
    ├── main.css / dark.css / contrast.css / focus.css / inkTheme.css
    ├── acesrc/                 # Ace editor + extensions
    ├── photon/                 # UI framework CSS
    ├── ink-icons/              # Custom icon font
    ├── img/                    # Issue icons
    ├── favicon-32.png
    ├── favicon-180.png
    └── export-template/        # Player template fetched at runtime during export
        ├── index.html
        ├── main.js
        ├── style.css
        └── ink.js
```

---

## Build System

`build.mjs` is an [esbuild](https://esbuild.github.io/) script that:

1. **Copies static assets** — Ace editor, Photon CSS, icon font, theme CSS files, favicons into `dist/`.
2. **Copies player template** — `app/export-for-web-template/` + `inkjs/dist/ink.js` into `dist/export-template/`, where they are fetched at runtime when the user exports a story.
3. **Generates snippets** — reads 24 longer `.ink` snippet files from `app/main-process/ink/longer-ink-snippets/` and writes their content as a JSON object into `web-snippets-generated.js`.
4. **Bundles** — runs esbuild with:
   - Module aliases pointing Node built-ins to shims in `web/shims/`
   - A custom plugin that redirects `require('./liveCompiler.js')` → `web-liveCompiler.js`
   - A banner that polyfills `setImmediate` and `scrollIntoViewIfNeeded` (used by Ace / navView)
   - `platform: 'browser'`, `format: 'iife'`

Run `node build.mjs --watch` during development for incremental rebuilds.
