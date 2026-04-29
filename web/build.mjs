import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rendererDir = resolve(__dirname, '../app/renderer');
const distDir = resolve(__dirname, 'dist');
const watch = process.argv.includes('--watch');

// Ensure dist/ exists
mkdirSync(distDir, { recursive: true });

// Copy static assets from app/renderer/ into dist/
const dirs = ['acesrc', 'photon', 'ink-icons', 'img'];
for (const d of dirs) {
    cpSync(join(rendererDir, d), join(distDir, d), { recursive: true, force: true });
}
const files = ['main.css', 'inkTheme.css', 'dark.css', 'contrast.css', 'focus.css'];
for (const f of files) {
    copyFileSync(join(rendererDir, f), join(distDir, f));
}
// index.html lives in web/ (not renderer), copy it to dist/
copyFileSync(join(__dirname, 'index.html'), join(distDir, 'index.html'));

console.log('Assets copied.');

const shimDir = resolve(__dirname, 'shims');

const buildOptions = {
    entryPoints: [resolve(__dirname, 'web-controller.js')],
    bundle: true,
    outfile: join(distDir, 'bundle.js'),
    platform: 'browser',
    format: 'iife',
    // ace is loaded as a plain <script> tag — treat as external global
    external: [],
    alias: {
        'electron':  join(shimDir, 'electron.js'),
        'path':      join(shimDir, 'path.js'),
        'fs':        join(shimDir, 'fs.js'),
        'chokidar':  join(shimDir, 'chokidar.js'),
        'mkdirp':    join(shimDir, 'mkdirp.js'),
        'assert':    join(shimDir, 'assert.js'),
        'buffer':    join(shimDir, 'buffer.js'),
    },
    // Look for npm packages in web/node_modules (e.g. lodash, inkjs)
    nodePaths: [resolve(__dirname, 'node_modules')],
    define: {
        'process.platform': '"web"',
        'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'info',
};

if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes… (Ctrl+C to stop)');
} else {
    await esbuild.build(buildOptions);
    console.log('Build complete → dist/');
}
