![](resources/icon-small.jpg)

# Inky Web — Online ink Story Editor

**[Try it now → https://dtsykunov.github.io/inky-web/](https://dtsykunov.github.io/inky-web/)**

**Inky Web** is a free, browser-based editor for [ink](http://www.inklestudios.com/ink) — inkle's open-source scripting language for interactive fiction and narrative games. Write, preview, and download your ink stories entirely in the browser. No installation required.

This is a fork of the official [inkle/inky](https://github.com/inkle/inky) desktop editor, rebuilt to run fully client-side as a web app. Your work is auto-saved to browser storage and never leaves your device.

![](resources/screenshot.gif)

## Features

- **Live story preview** — the play pane updates as you type and replays your choices automatically after every recompile
- **Syntax highlighting** for ink markup
- **As-you-type error and warning highlighting** — errors are underlined in the editor the moment you make them
- **Issue browser** — lists errors, warnings, and TODOs with one-click jump to the exact line
- **Jump to definition** — alt-click any divert target (e.g. `-> theKnot`) to navigate to its definition
- **Multi-file project support** — `INCLUDE` directives are parsed automatically; add new include files from the sidebar
- **Open / Save / New** — open any `.ink` file from your computer; save (download) at any time or with Ctrl+S / Cmd+S
- **Drag-and-drop** — drag a `.ink` file onto the window to open it instantly
- **Auto-save** — your story is continuously saved to `localStorage` and restored on your next visit
- **Works offline** — once loaded, the editor requires no network connection
- **Free and open source** — MIT licensed, runs entirely in your browser

## Getting started

1. Open **[https://dtsykunov.github.io/inky-web/](https://dtsykunov.github.io/inky-web/)** in any modern browser
2. A sample story loads automatically — start editing right away
3. Open your own `.ink` file with the folder button, or drag it onto the window
4. The right pane plays your story live; click choices to advance
5. Download your finished story with the save button or Ctrl+S / Cmd+S

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+S / Cmd+S | Save (download) current file |
| Alt+click | Jump to divert / knot definition |
| Ctrl+P / Cmd+P | Go to anything (file, knot, line) |

## What is ink?

**ink** is a narrative scripting language created by [inkle](https://www.inklestudios.com/) and used in games like [80 Days](https://www.inklestudios.com/80days), [Overboard!](https://www.inklestudios.com/overboard/), and [Heaven's Vault](https://www.inklestudios.com/heavensvault/). It is open source, free to use, and has runtimes for Unity, web (inkjs), and more.

- [ink language reference](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md)
- [inkjs — run ink in the browser or Node](https://github.com/y-lohse/inkjs)
- [ink Unity integration](https://assetstore.unity.com/packages/tools/integration/ink-unity-integration-60055)

## Project settings file

To add custom ink snippets for your project, create a JSON file with the same name as your main ink file and a `.settings.json` extension (e.g. `my_story.settings.json`):

```json
{
    "customInkSnippets": [
        {
            "name": "My Snippets",
            "submenu": [
                { "name": "Camera wide", "ink": ">>> CAMERA: Wide" },
                { "separator": true },
                { "name": "Walk", "ink": ">>> WALK: Location" }
            ]
        }
    ],
    "instructionPrefix": ">>>"
}
```

- `customInkSnippets` — adds project-specific snippets to the Ink menu (supports submenus and separators)
- `instructionPrefix` — highlights lines that start with this prefix in both the editor and the player pane

## Building locally

```bash
git clone https://github.com/dtsykunov/inky-web.git
cd inky-web/web
npm install
node build.mjs          # builds to web/dist/
# open web/dist/index.html in a browser
node build.mjs --watch  # rebuilds on file changes
```

Node.js 18+ is required.

## Implementation

Inky Web is built on:

- [Electron](https://www.electronjs.org/) renderer code from the original Inky (reused as-is)
- [Ace](https://ace.c9.io/) code editor
- [inkjs](https://github.com/y-lohse/inkjs) for in-browser ink compilation and story playback
- [esbuild](https://esbuild.github.io/) for bundling
- [GitHub Pages](https://pages.github.com/) for hosting

Node built-ins (`fs`, `path`, `electron`, etc.) are shimmed so the original renderer modules run unchanged in the browser.

## Contributing

This fork focuses on the web build. For issues with the core ink editor experience, please also check the [upstream inkle/inky issues](https://github.com/inkle/inky/issues).

To keep up to date with ink news, [sign up for the inkle mailing list](https://www.inklestudios.com/ink#signup) or follow [@inkleStudios](https://twitter.com/inkleStudios).

## License

**Inky** and **ink** are released under the MIT License. Attribution is appreciated but not required.

### The MIT License (MIT)
Copyright (c) 2016 inkle Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

*Inky is named after a black cat based in Cambridge, UK.*
