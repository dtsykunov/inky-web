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
// Files in web/ (not renderer) copied to dist/
copyFileSync(join(__dirname, 'index.html'), join(distDir, 'index.html'));
copyFileSync(join(__dirname, 'web.css'),    join(distDir, 'web.css'));

console.log('Assets copied.');

const shimDir = resolve(__dirname, 'shims');

// Plugin: redirect relative liveCompiler.js imports to our web version.
// inkProject.js does require('./liveCompiler.js') which we must intercept.
const replaceRelativeModules = {
    name: 'web-replacements',
    setup(build) {
        build.onResolve({ filter: /\/liveCompiler\.js$/ }, () => ({
            path: resolve(__dirname, 'web-liveCompiler.js'),
        }));
    },
};

const buildOptions = {
    entryPoints: [resolve(__dirname, 'web-controller.js')],
    bundle: true,
    outfile: join(distDir, 'bundle.js'),
    platform: 'browser',
    format: 'iife',
    plugins: [replaceRelativeModules],
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
    banner: {
        js: [
            // setImmediate is Node-only
            'if(typeof setImmediate==="undefined")window.setImmediate=function(fn,_a,_b){return setTimeout(fn,0);};',
            // scrollIntoViewIfNeeded is Chrome/Electron-only (used in navView.js)
            'if(!Element.prototype.scrollIntoViewIfNeeded)Element.prototype.scrollIntoViewIfNeeded=function(c){this.scrollIntoView({block:c===false?"end":"nearest"});};',
        ].join(''),
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
