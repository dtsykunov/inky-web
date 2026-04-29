# Inky Web Edition — Implementation Plan

## Step 1: Build scaffold — editor renders in browser

- [ ] Create `web/package.json` with esbuild, inkjs, path-browserify as dependencies
- [ ] Create `web/shims/electron.js` — stub ipcRenderer (no-op on/send/invoke)
- [ ] Create `web/shims/path.js` — re-export path-browserify
- [ ] Create `web/build.mjs` — esbuild script with alias plugin (electron→shim, path→shim)
- [ ] Create `web/index.html` — adapted from app/renderer/index.html (no platform script, loads dist/bundle.js)
- [ ] Create `web/web-controller.js` — minimal stub: sets up EditorView with default story, no IPC
- [ ] Copy static assets into `web/dist/` as part of build (CSS, images, fonts, Ace)
- [ ] Verify: `cd web && npm install && npm run build` → open `web/dist/index.html` → editor renders, typing works

## Step 2: Story playback with inkjs compiler

- [ ] Create `web/web-inkFile.js` — InkFile replacement: holds content in Ace Document, no fs calls
- [ ] Create `web/web-inkProject.js` — InkProject replacement: single-file project in memory, no fs/chokidar
- [ ] Create `web/web-liveCompiler.js` — compiles with `inkjs/compiler` on debounced edit, drives PlayerView via same event API as original
- [ ] Wire web-liveCompiler into web-controller.js (replace LiveCompiler import)
- [ ] Wire web-inkProject into web-controller.js (replace InkProject import)
- [ ] Handle inkjs compiler errors → emit errorsAdded events → show in toolbar
- [ ] Stub out ExpressionWatchView (not available in web mode)
- [ ] Verify: edit ink → story plays in right pane; introduce error → shows in toolbar; rewind/step-back work

## Step 3: File I/O — open, save, auto-persist

- [ ] Add Open button to toolbar (hidden `<input type="file" accept=".ink">`)
- [ ] Implement file open: read File object → set as project content → recompile
- [ ] Add Save/Download button: Blob + URL.createObjectURL → downloads .ink file
- [ ] Implement Ctrl+S keyboard shortcut → triggers download
- [ ] Auto-save to localStorage on every edit
- [ ] Restore from localStorage on page load (with "resume" banner)
- [ ] Add New button: clears editor to default story, clears localStorage
- [ ] Verify: open a .ink file → edit → Ctrl+S downloads it; reload page → content restored

## Step 4: GitHub Pages deployment

- [ ] Add `web/.nojekyll` to disable Jekyll processing
- [ ] Add `web/dist/` to `.gitignore`
- [ ] Create `.github/workflows/deploy-web.yml` — build and deploy `web/dist/` to gh-pages branch
- [ ] Verify: push to master → Actions builds → site live at GitHub Pages URL
