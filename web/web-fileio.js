// Browser file I/O: Open / Save / New
// Injects three toolbar buttons and wires up keyboard shortcuts.
// Called once from web-controller.js after $(document).ready().

var STORAGE_KEY = 'inky-web-autosave';
var FILENAME_KEY = 'inky-web-filename';

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

function init(getContent, setContent, getFilename, setFilename) {

    injectToolbarButtons();

    // Open button
    document.getElementById('web-open-btn').addEventListener('click', function() {
        document.getElementById('web-file-input').click();
    });

    document.getElementById('web-file-input').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            var text = ev.target.result.replace(/^\uFEFF/, ''); // strip BOM
            setFilename(file.name);
            setContent(text);
            saveToLocalStorage(file.name, text);
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = ''; // reset so the same file can be re-opened
    });

    // Save / Download button
    document.getElementById('web-save-btn').addEventListener('click', function() {
        triggerDownload(getFilename(), getContent());
    });

    // New button
    document.getElementById('web-new-btn').addEventListener('click', function() {
        if (!window.confirm('Start a new story? Unsaved changes will be lost.')) return;
        var defaultName    = 'Untitled.ink';
        var defaultContent = 'Once upon a time...\n\n'
            + ' * There were two choices.\n'
            + ' * There were four lines of content.\n\n'
            + '- They lived happily ever after.\n'
            + '    -> END\n';
        setFilename(defaultName);
        setContent(defaultContent);
        saveToLocalStorage(defaultName, defaultContent);
    });

    // Ctrl+S / Cmd+S → download
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            triggerDownload(getFilename(), getContent());
        }
    });
}

// Called by web-controller on every editor change
function autosave(filename, content) {
    saveToLocalStorage(filename, content);
}

// Returns { filename, content } if a previous session was saved, else null
function loadFromLocalStorage() {
    try {
        var content  = localStorage.getItem(STORAGE_KEY);
        var filename = localStorage.getItem(FILENAME_KEY) || 'Untitled.ink';
        if (content) return { filename: filename, content: content };
    } catch(e) {}
    return null;
}

// ----------------------------------------------------------------
// Internals
// ----------------------------------------------------------------

function saveToLocalStorage(filename, content) {
    try {
        localStorage.setItem(STORAGE_KEY,  content);
        localStorage.setItem(FILENAME_KEY, filename);
    } catch(e) {}
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
    var rightButtons = document.querySelector('#toolbar .buttons.right');
    if (!rightButtons) return;

    // Hidden file input (appended to body, not toolbar)
    var input = document.createElement('input');
    input.type    = 'file';
    input.id      = 'web-file-input';
    input.accept  = '.ink,.txt';
    input.style.display = 'none';
    document.body.appendChild(input);

    var newBtn  = makeButton('web-new-btn',  'New story',              'icon-doc-text');
    var openBtn = makeButton('web-open-btn', 'Open .ink file',         'icon-folder');
    var saveBtn = makeButton('web-save-btn', 'Save / Download (.ink)', 'icon-download');

    var wrap = document.createElement('div');
    wrap.appendChild(newBtn);
    wrap.appendChild(openBtn);
    wrap.appendChild(saveBtn);

    rightButtons.parentNode.insertBefore(wrap, rightButtons);
}

exports.WebFileIO = {
    init:                  init,
    autosave:              autosave,
    loadFromLocalStorage:  loadFromLocalStorage,
};
