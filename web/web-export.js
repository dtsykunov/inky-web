// Export current project as a self-contained web player zip.
// The exported zip contains the ink.js runtime, the compiled story, and
// the standard Inky web-player template (index.html / main.js / style.css).

var JSZip    = require('jszip');
var Compiler = require('inkjs/compiler/Compiler').Compiler;
var CompilerOptions = require('inkjs/compiler/CompilerOptions').CompilerOptions;

// project   — InkProject.currentProject
// onError   — function(message) called if compilation or fetch fails
// onSuccess — function() called after download is triggered
function exportForWeb(project, onError, onSuccess) {

    // ---- 1. Compile --------------------------------------------------
    var fileMap = {};
    project.files.forEach(function(f) {
        fileMap[f.relativePath()] = f.getValue();
    });

    var story;
    try {
        var compiler = new Compiler(
            project.mainInk.getValue(),
            new CompilerOptions(
                project.mainInk.filename(),
                [],    // pluginNames
                false, // countAllVisits
                null,  // errorHandler (throws on error)
                {
                    ResolveInkFilename: function(fn) { return fn; },
                    LoadInkFileContents: function(fn) { return fileMap[fn] || ''; }
                }
            )
        );
        story = compiler.Compile();
    } catch(e) {
        onError('Compilation failed — fix errors before exporting.\n\n' + e.message);
        return;
    }

    // ---- 2. Story JSON -----------------------------------------------
    var storyJson = story.ToJson();

    // ---- 3. Story title (from # title: tag, else main filename) ------
    var title = project.mainInk.filename().replace(/\.ink$/i, '');
    try {
        var globalTags = story.globalTags;
        if (globalTags) {
            for (var i = 0; i < globalTags.length; i++) {
                var m = globalTags[i].match(/^title\s*:\s*(.+)$/i);
                if (m) { title = m[1].trim(); break; }
            }
        }
    } catch(e) {}

    // ---- 4. Filenames ------------------------------------------------
    var safeTitle  = title.replace(/[^a-z0-9_-]/gi, '_');
    var jsFilename = safeTitle + '.js';
    var zipName    = safeTitle + '.zip';

    // ---- 5. Fetch template files + build zip -------------------------
    Promise.all([
        fetch('export-template/index.html').then(function(r) { return r.text(); }),
        fetch('export-template/main.js').then(function(r)    { return r.text(); }),
        fetch('export-template/style.css').then(function(r)  { return r.text(); }),
        fetch('export-template/ink.js').then(function(r)     { return r.text(); }),
    ]).then(function(results) {
        var html   = results[0];
        var mainJs = results[1];
        var css    = results[2];
        var inkJs  = results[3];

        html = html
            .replace(/##STORY TITLE##/g, escapeHtml(title))
            .replace(/##JAVASCRIPT FILENAME##/g, jsFilename);

        var storyJsContent = 'var storyContent = ' + storyJson + ';\n';

        var zip    = new JSZip();
        var folder = zip.folder(safeTitle);
        folder.file('index.html', html);
        folder.file('main.js',    mainJs);
        folder.file('style.css',  css);
        folder.file('ink.js',     inkJs);
        folder.file(jsFilename,   storyJsContent);

        return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

    }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a   = document.createElement('a');
        a.href     = url;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        if (onSuccess) onSuccess();

    }).catch(function(err) {
        onError('Export failed: ' + err.message);
    });
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

exports.WebExport = { exportForWeb: exportForWeb };
