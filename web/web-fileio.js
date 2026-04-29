// Browser file I/O: Open / Save / New
// Injects three toolbar buttons and wires up keyboard shortcuts.
// Called once from web-controller.js after $(document).ready().

var STORAGE_KEY_V1 = 'inky-web-autosave';
var STORAGE_KEY_V2 = 'inky-web-project';
var FILENAME_KEY   = 'inky-web-filename';

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

// opts:
//   setFiles(filesMap, mainFilename) — load a set of files into the project
//   getFilename()                    — get current main filename
//   setFilename(name)                — update displayed main filename
//   getAllFiles()                    — { relPath: content } for all open files
function init(opts) {

    injectToolbarButtons();

    // Open button
    document.getElementById('web-open-btn').addEventListener('click', function() {
        document.getElementById('web-file-input').click();
    });

    document.getElementById('web-file-input').addEventListener('change', function(e) {
        var files = Array.from(e.target.files);
        if (!files.length) return;
        readFiles(files, function(filesMap, mainFilename) {
            opts.setFilename(mainFilename);
            opts.setFiles(filesMap, mainFilename);
            saveToLocalStorage(mainFilename, filesMap);
        });
        e.target.value = '';
    });

    // Save / Download button — downloads every open file
    document.getElementById('web-save-btn').addEventListener('click', function() {
        downloadAllFiles(opts.getAllFiles());
    });

    // New button
    document.getElementById('web-new-btn').addEventListener('click', function() {
        if (!window.confirm('Start a new story? Unsaved changes will be lost.')) return;
        var name    = 'Untitled.ink';
        var content = 'Once upon a time...\n\n'
            + ' * There were two choices.\n'
            + ' * There were four lines of content.\n\n'
            + '- They lived happily ever after.\n'
            + '    -> END\n';
        var map = {};
        map[name] = content;
        opts.setFilename(name);
        opts.setFiles(map, name);
        saveToLocalStorage(name, map);
    });

    // Ctrl+S / Cmd+S → download all
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            downloadAllFiles(opts.getAllFiles());
        }
    });

    // Drag-and-drop one or more .ink files
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    document.addEventListener('drop', function(e) {
        e.preventDefault();
        var files = Array.from(e.dataTransfer.files).filter(function(f) {
            return /\.(ink|txt)$/i.test(f.name);
        });
        if (!files.length) return;
        readFiles(files, function(filesMap, mainFilename) {
            opts.setFilename(mainFilename);
            opts.setFiles(filesMap, mainFilename);
            saveToLocalStorage(mainFilename, filesMap);
        });
    });
}

// Called by web-controller on every editor change
function autosave(mainFilename, allFiles) {
    saveToLocalStorage(mainFilename, allFiles);
}

// Returns { mainFilename, files } if a session was saved, else null
function loadFromLocalStorage() {
    try {
        // V2 format: JSON project blob
        var v2 = localStorage.getItem(STORAGE_KEY_V2);
        if (v2) {
            var project = JSON.parse(v2);
            if (project && project.files && project.mainFilename)
                return project;
        }
        // V1 fallback: single file
        var content  = localStorage.getItem(STORAGE_KEY_V1);
        var filename = localStorage.getItem(FILENAME_KEY) || 'Untitled.ink';
        if (content) {
            var files = {};
            files[filename] = content;
            return { mainFilename: filename, files: files };
        }
    } catch(e) {}
    return null;
}

// ----------------------------------------------------------------
// Internals
// ----------------------------------------------------------------

// Read an array of File objects and call back with { relPath: content } and mainFilename
function readFiles(fileList, callback) {
    var remaining = fileList.length;
    var filesMap = {};

    fileList.forEach(function(file) {
        var reader = new FileReader();
        reader.onload = function(ev) {
            var text = ev.target.result.replace(/^\uFEFF/, ''); // strip BOM
            filesMap[file.name] = text;
            remaining--;
            if (remaining === 0) {
                var mainFilename = pickMainFile(filesMap);
                callback(filesMap, mainFilename);
            }
        };
        reader.readAsText(file, 'utf-8');
    });
}

// Heuristic: find the file that INCLUDEs one of the others; fall back to first
function pickMainFile(filesMap) {
    var names = Object.keys(filesMap);
    if (names.length === 1) return names[0];

    for (var i = 0; i < names.length; i++) {
        var name    = names[i];
        var content = filesMap[name];
        var referencesOther = names.some(function(other) {
            return other !== name && content.indexOf('INCLUDE ' + other) !== -1;
        });
        if (referencesOther) return name;
    }
    return names[0];
}

function saveToLocalStorage(mainFilename, filesMap) {
    try {
        var project = { mainFilename: mainFilename, files: filesMap };
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(project));
    } catch(e) {}
}

function downloadAllFiles(filesMap) {
    var entries = Object.entries(filesMap);
    entries.forEach(function(entry, i) {
        var relPath = entry[0];
        var content = entry[1];
        var basename = relPath.split('/').pop().split('\\').pop();
        setTimeout(function() { triggerDownload(basename, content); }, i * 120);
    });
}

function triggerDownload(filename, content) {
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function makeButton(id, title, iconClass) {
    var btn  = document.createElement('div');
    btn.className = 'button web-btn';
    btn.id        = id;
    btn.title     = title;
    var icon = document.createElement('span');
    icon.className = 'icon ' + iconClass;
    btn.appendChild(icon);
    return btn;
}

function injectToolbarButtons() {

    // Hidden file input (appended to body, not toolbar)
    var input = document.createElement('input');
    input.type     = 'file';
    input.id       = 'web-file-input';
    input.accept   = '.ink,.txt';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    var newBtn  = makeButton('web-new-btn',  'New story',              'icon-doc-text');
    var openBtn = makeButton('web-open-btn', 'Open .ink file(s)',      'icon-folder');
    var saveBtn = makeButton('web-save-btn', 'Save / Download (.ink)', 'icon-download');

    var leftButtons = document.querySelector('#toolbar .buttons.left');
    if (leftButtons) {
        leftButtons.appendChild(newBtn);
        leftButtons.appendChild(openBtn);
        leftButtons.appendChild(saveBtn);
    }
}

exports.WebFileIO = {
    init:                 init,
    autosave:             autosave,
    loadFromLocalStorage: loadFromLocalStorage,
};
