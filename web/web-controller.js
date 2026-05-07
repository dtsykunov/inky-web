

// jQuery must be set as a global before any other module loads
const $ = window.jQuery = require('../app/renderer/jquery-2.2.3.min.js');

const electron = require('electron');

require('../app/renderer/util.js');
require('../app/renderer/split.js');
require('../app/renderer/contextmenu.js');

const EditorView          = require('../app/renderer/editorView.js').EditorView;
const PlayerView          = require('../app/renderer/playerView.js').PlayerView;
const ToolbarView         = require('../app/renderer/toolbarView.js').ToolbarView;
const NavView             = require('../app/renderer/navView.js').NavView;
const ExpressionWatchView = require('../app/renderer/expressionWatchView').ExpressionWatchView;
const InkProject          = require('../app/renderer/inkProject.js').InkProject;
const NavHistory          = require('../app/renderer/navHistory.js').NavHistory;
const GotoAnything        = require('../app/renderer/goto.js').GotoAnything;
const i18n                = require('../app/renderer/i18n.js');

const LiveCompiler = require('./web-liveCompiler.js').WebLiveCompiler;
const WebFileIO    = require('./web-fileio.js').WebFileIO;
const WebExport    = require('./web-export.js').WebExport;
const WebSnippets  = require('./web-snippets.js').snippets;

// Main filename shown in the toolbar and used for downloads/localStorage
var currentFilename = 'Untitled.ink';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

// Returns { relPath: content } for every open file in the project
function getAllFilesContent() {
    var project = InkProject.currentProject;
    if (!project) return {};
    var map = {};
    project.files.forEach(function(f) {
        map[f.relativePath()] = f.getValue();
    });
    return map;
}

// Load a set of files into the current project.
// filesMap: { relPath: content }
// mainFilename: key of the main file in filesMap
function setAllFiles(filesMap, mainFilename) {
    var project = InkProject.currentProject;

    // Update main file identity
    currentFilename = mainFilename;
    ToolbarView.setTitle(mainFilename);
    project.mainInk.relPath = mainFilename;

    // Set main content (suppress include-file auto-creation from old INCLUDE lines)
    project.mainInk.setValue(filesMap[mainFilename] || '');

    // Remove all existing include files so we start clean
    project.files.length = 0;
    project.files.push(project.mainInk);

    // Add each include file as a brand-new InkFile (no disk access)
    Object.keys(filesMap).forEach(function(relPath) {
        if (relPath === mainFilename) return;
        var inkFile = project.createInkFile(relPath, /*isBrandNew=*/true);
        inkFile.setValue(filesMap[relPath] || '');
    });

    LiveCompiler.setEdited();
    NavView.setFiles(project.mainInk, project.files);
    NavView.setKnots(project.mainInk);

    // Auto-show the sidebar when there are include files
    if (project.files.length > 1) NavView.show();
}

// ----------------------------------------------------------------
// InkProject events
// ----------------------------------------------------------------

InkProject.setEvents({
    newProject: (project) => {
        EditorView.focus();
        LiveCompiler.setProject(project);
        const filename = project.activeInkFile.filename();
        currentFilename = filename;
        ToolbarView.setTitle(filename);
        NavView.setMainInkFilename(filename);
        NavView.setFiles(project.mainInk, project.files);
        NavHistory.reset();
        NavHistory.addStep();
    },
    didSave: () => {
        const activeInk = InkProject.currentProject.activeInkFile;
        ToolbarView.setTitle(activeInk.filename());
        NavView.setMainInkFilename(InkProject.currentProject.mainInk.filename());
        NavView.highlightRelativePath(activeInk.relativePath());
    },
    didSwitchToInkFile: (inkFile) => {
        const filename = inkFile.filename();
        ToolbarView.setTitle(filename);
        NavView.highlightRelativePath(inkFile.relativePath());
        NavView.setKnots(inkFile);
        const fileIssues = LiveCompiler.getIssuesForFilename(inkFile.relativePath());
        setImmediate(() => EditorView.setErrors(fileIssues));
        NavView.updateCurrentKnot(inkFile, EditorView.getCurrentCursorPos());
        NavHistory.addStep();
    }
});

// ----------------------------------------------------------------
// NavHistory events
// ----------------------------------------------------------------

NavHistory.setEvents({
    goto: (location) => {
        InkProject.currentProject.showInkFile(location.filePath);
        EditorView.gotoLine(location.position.row + 1);
    }
});

// ----------------------------------------------------------------
// LiveCompiler events
// ----------------------------------------------------------------

var allIssues = [];
var currentIssueIdx = -1;

function gotoIssue(issue) {
    InkProject.currentProject.showInkFile(issue.filename);
    EditorView.gotoLine(issue.lineNumber);
    NavHistory.addStep();
}

LiveCompiler.setEvents({
    resetting: () => {
        allIssues = [];
        currentIssueIdx = -1;
        EditorView.clearErrors();
        ToolbarView.clearIssueSummary();
    },
    compileComplete: (sessionId) => {
        PlayerView.prepareForNewPlaythrough(sessionId);
        EditorView.clearErrors();
        ToolbarView.clearIssueSummary();
    },
    selectIssue: gotoIssue,
    textAdded:   (text) => PlayerView.addTextSection(text),
    tagsAdded:   (tags) => PlayerView.addTags(tags),
    choiceAdded: (choice, isLatestTurn) => {
        if (isLatestTurn)
            PlayerView.addChoice(choice, () => LiveCompiler.choose(choice));
    },
    errorsAdded: (errors) => {
        allIssues = allIssues.concat(errors);
        EditorView.clearErrors();
        for (const error of allIssues) {
            if (error.filename === InkProject.currentProject.activeInkFile.relativePath())
                EditorView.addError(error);
        }
        for (const error of errors) {
            if (error.type === 'RUNTIME ERROR' || error.type === 'RUNTIME WARNING')
                PlayerView.addLineError(error, () => gotoIssue(error));
        }
        ToolbarView.updateIssueSummary(allIssues);
    },
    playerPrompt: (_replaying, doneCallback) => {
        PlayerView.contentReady();
        doneCallback();
    },
    replayComplete: (sessionId) => PlayerView.showSessionView(sessionId),
    storyCompleted: () => PlayerView.addTerminatingMessage(i18n._('End of story'), 'end'),
    exitDueToError: () => {},
    unexpectedError: (error) => {
        PlayerView.addTerminatingMessage(i18n._('Ink compiler had an unexpected error ☹'), 'error');
        PlayerView.addLongMessage(error, 'error');
    },
    compilerBusyChanged: (busy) => ToolbarView.setBusySpinnerVisible(busy),
});

// ----------------------------------------------------------------
// EditorView events
// ----------------------------------------------------------------

EditorView.setEvents({
    change: () => {
        LiveCompiler.setEdited();
        NavView.setKnots(InkProject.currentProject.activeInkFile);
        WebFileIO.autosave(currentFilename, getAllFilesContent());
    },
    jumpToSymbol: (symbolName, contextPos) => {
        const found = InkProject.currentProject.findSymbol(symbolName, contextPos);
        if (found) {
            InkProject.currentProject.showInkFile(found.inkFile);
            EditorView.gotoLine(found.row + 1, found.column);
            NavHistory.addStep();
        }
    },
    jumpToInclude: (includePath) => {
        InkProject.currentProject.showInkFile(includePath);
        NavHistory.addStep();
    },
    navigate: () => NavHistory.addStep(),
    changedLine: (pos) => {
        if (InkProject.currentProject && InkProject.currentProject.activeInkFile)
            NavView.updateCurrentKnot(InkProject.currentProject.activeInkFile, pos);
    }
});

// ----------------------------------------------------------------
// PlayerView events
// ----------------------------------------------------------------

PlayerView.setEvents({
    jumpToSource: () => {}
});

// ----------------------------------------------------------------
// ExpressionWatchView events
// ----------------------------------------------------------------

ExpressionWatchView.setEvents({
    change: () => {
        LiveCompiler.setEdited();
        $('#player .scrollContainer').css('top', ExpressionWatchView.totalHeight() + 'px');
    }
});

// ----------------------------------------------------------------
// ToolbarView events
// ----------------------------------------------------------------

ToolbarView.setEvents({
    toggleSidebar: (id, buttonId) => NavView.toggle(id, buttonId),
    navigateBack:  () => NavHistory.back(),
    navigateForward: () => NavHistory.forward(),
    selectIssue: gotoIssue,
    stepBack: () => {
        PlayerView.previewStepBack();
        LiveCompiler.stepBack();
    },
    rewind:      () => LiveCompiler.rewind(),
    didSetTitle: () => {}
});

// ----------------------------------------------------------------
// NavView events
// ----------------------------------------------------------------

const path = require('path');

// Rename inkFile to newName, updating INCLUDE references and persisting.
function renameInkFile(inkFile, newName) {
    newName = newName.trim();
    if (!newName) return;
    if (!path.extname(newName)) newName += '.ink';
    if (newName === inkFile.filename()) return;

    var oldName    = inkFile.filename();
    var dir        = path.dirname(inkFile.relativePath());
    inkFile.relPath = (dir === '.' ? newName : dir + '/' + newName);

    // Update INCLUDE lines in sibling files that referenced the old name
    var escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    InkProject.currentProject.files.forEach(function(f) {
        if (f === inkFile) return;
        var content = f.getValue();
        var updated = content.replace(
            new RegExp('(INCLUDE\\s+)' + escaped, 'g'), '$1' + newName
        );
        if (updated !== content) f.setValue(updated);
    });

    if (inkFile === InkProject.currentProject.mainInk) currentFilename = newName;
    if (inkFile === InkProject.currentProject.activeInkFile) ToolbarView.setTitle(newName);

    LiveCompiler.setEdited();
    NavView.setFiles(InkProject.currentProject.mainInk, InkProject.currentProject.files);
    WebFileIO.autosave(currentFilename, getAllFilesContent());
}

NavView.setEvents({
    clickFileId: (fileId) => {
        const inkFile = InkProject.currentProject.inkFileWithId(fileId);
        InkProject.currentProject.showInkFile(inkFile);
        NavHistory.addStep();
    },
    addInclude: (filename, addToMainInk) => {
        if (path.extname(filename) !== '.ink') filename += '.ink';
        const newFile = InkProject.currentProject.addNewInclude(filename, addToMainInk);
        if (newFile) {
            InkProject.currentProject.showInkFile(newFile);
            NavHistory.addStep();
            return true;
        }
        return false;
    },
    jumpToRow: (row) => EditorView.gotoLine(row + 1)
});

// ----------------------------------------------------------------
// GotoAnything events
// ----------------------------------------------------------------

GotoAnything.setEvents({
    gotoFile: (file, row) => {
        InkProject.currentProject.showInkFile(file);
        if (typeof row !== 'undefined') EditorView.gotoLine(row + 1);
        NavHistory.addStep();
    },
    lookupRuntimePath: (_p, resultHandler) => resultHandler(null)
});

// ----------------------------------------------------------------
// Theme (persisted in localStorage)
// ----------------------------------------------------------------

var currentThemeName = window.localStorage.getItem('theme') || 'main';

function updateTheme(newTheme) {
    const themeClasses = ['dark', 'contrast', 'focus'];
    themeClasses.forEach(t => { $('.window').removeClass(t); document.body.classList.remove(t); });
    if (newTheme && newTheme.toLowerCase() !== 'main') {
        $('.window').addClass(newTheme);
        document.body.classList.add(newTheme);   // needed for dropdowns/modals appended to body
    }
    currentThemeName = newTheme || 'main';
    window.localStorage.setItem('theme', currentThemeName);
    LiveCompiler.setEdited();
}
updateTheme(currentThemeName);

// ----------------------------------------------------------------
// View settings (persisted in localStorage)
// ----------------------------------------------------------------

var autoComplete = localStorage.getItem('autocomplete') !== 'false';
var animation    = localStorage.getItem('animation')    !== 'false';
var tagsVisible  = localStorage.getItem('tags')         !== 'false';

// ----------------------------------------------------------------
// Boot
// ----------------------------------------------------------------

$(document).ready(() => {
    InkProject.startNew();
    NavView.setKnots(InkProject.currentProject.mainInk);
    ToolbarView.setBusySpinnerVisible(false);

    var fileActions = WebFileIO.init({
        setFiles:    setAllFiles,
        getFilename: () => currentFilename,
        setFilename: (name) => {
            currentFilename = name;
            ToolbarView.setTitle(name);
        },
        getAllFiles:  getAllFilesContent,
        isDirty: () => {
            var files = getAllFilesContent();
            return Object.values(files).some(function(c) { return c.trim().length > 0; });
        },
        newProject: () => {
            InkProject.startNew();
            WebFileIO.autosave(currentFilename, getAllFilesContent());
        },
    });

    // Zoom — scales both editor and player panes (not menubar/toolbar)
    var zoomSizes = [10, 11, 12, 13, 14, 16, 18, 20, 24];
    var zoomIdx   = Math.max(0, Math.min(zoomSizes.length - 1,
        parseInt(localStorage.getItem('zoom-idx') || '4', 10)));
    function applyZoom() {
        var px = zoomSizes[zoomIdx] + 'px';
        ace.edit('editor').setFontSize(px);
        document.getElementById('player').style.fontSize = px;
        localStorage.setItem('zoom-idx', zoomIdx);
    }
    applyZoom();

    // Apply persisted view settings
    EditorView.setAutoCompleteDisabled(!autoComplete);
    PlayerView.setAnimationEnabled(animation);
    if (!tagsVisible) $('#main').addClass('hideTags');

    // Double-click a file in the sidebar to rename it inline
    $(document).on('dblclick', '#file-nav-wrapper .nav-group-item', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var $item   = $(this);
        var fileId  = parseInt($item.attr('data-file-id'));
        var inkFile = InkProject.currentProject.inkFileWithId(fileId);
        if (!inkFile) return;

        var $filename = $item.find('.filename');
        var display = inkFile.filename().replace(/\.ink$/i, '');

        var $input = $('<input class="nav-rename-input" type="text" spellcheck="false">');
        $input.val(display);
        $filename.hide();
        $input.insertAfter($filename);
        $input.focus().select();

        var done = false;
        function commit() {
            if (done) return; done = true;
            $input.remove(); $filename.show();
            var val = $input.val().trim();
            if (val) renameInkFile(inkFile, val);
        }
        function cancel() {
            if (done) return; done = true;
            $input.remove(); $filename.show();
        }
        $input.on('keydown', function(e) {
            if (e.key === 'Enter')  { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        $input.on('blur', commit);
        $input.on('click mousedown', function(e) { e.stopPropagation(); });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        var mod = e.ctrlKey || e.metaKey;
        if (mod && !e.shiftKey && e.key === 'p') {
            e.preventDefault();
            electron.ipcRenderer.emit('goto-anything');
        }
        if (mod && !e.shiftKey && e.key === '.') {
            e.preventDefault();
            if (allIssues.length === 0) return;
            currentIssueIdx = (currentIssueIdx + 1) % allIssues.length;
            gotoIssue(allIssues[currentIssueIdx]);
        }
        if (mod && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            WebExport.exportJson(InkProject.currentProject, function(msg) { alert(msg); });
        }
        if (mod && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            showStatsModal();
        }
        if (e.key === 'F1') {
            e.preventDefault();
            showShortcutsModal();
        }
        if (mod && !e.shiftKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                zoomIdx = Math.min(zoomIdx + 1, zoomSizes.length - 1);
                applyZoom();
            } else if (e.key === '-') {
                e.preventDefault();
                zoomIdx = Math.max(zoomIdx - 1, 0);
                applyZoom();
            } else if (e.key === '0') {
                e.preventDefault();
                zoomIdx = 4;
                applyZoom();
            }
        }
    });

    // Go to Anything button (right toolbar)
    (function() {
        var btn = document.createElement('div');
        btn.className = 'button web-btn';
        btn.id        = 'web-goto-btn';
        btn.title     = 'Go to anything (Ctrl+P)';
        var icon = document.createElement('span');
        icon.className = 'icon icon-search';
        btn.appendChild(icon);
        var right = document.querySelector('#toolbar .buttons.right');
        if (right) right.appendChild(btn);
        btn.addEventListener('click', function() { electron.ipcRenderer.emit('goto-anything'); });
    })();

    // Next Issue button (right toolbar)
    (function() {
        var btn = document.createElement('div');
        btn.className = 'button web-btn';
        btn.id        = 'web-next-issue-btn';
        btn.title     = 'Jump to next issue (Ctrl+.)';
        var icon = document.createElement('span');
        icon.className = 'icon icon-attention';
        btn.appendChild(icon);
        var right = document.querySelector('#toolbar .buttons.right');
        if (right) right.appendChild(btn);
        btn.addEventListener('click', function() {
            if (allIssues.length === 0) return;
            currentIssueIdx = (currentIssueIdx + 1) % allIssues.length;
            gotoIssue(allIssues[currentIssueIdx]);
        });
    })();

    // ---- Modal helpers ---------------------------------------------------
    function buildModal(title, rows) {
        var overlay = document.createElement('div');
        overlay.className = 'web-modal';
        var box = document.createElement('div');
        box.className = 'web-modal-box';
        var h3 = document.createElement('h3');
        h3.textContent = title;
        box.appendChild(h3);
        var table = document.createElement('table');
        rows.forEach(function(row) {
            var tr = document.createElement('tr');
            if (row[1] === null) {
                var th = document.createElement('th');
                th.colSpan = 2;
                th.textContent = row[0];
                tr.appendChild(th);
            } else {
                var tdKey = document.createElement('td');
                tdKey.textContent = row[0];
                var tdVal = document.createElement('td');
                tdVal.textContent = row[1];
                tr.appendChild(tdKey);
                tr.appendChild(tdVal);
            }
            table.appendChild(tr);
        });
        box.appendChild(table);
        var closeBtn = document.createElement('button');
        closeBtn.className = 'web-modal-close';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', function() { overlay.remove(); });
        box.appendChild(closeBtn);
        overlay.appendChild(box);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
        });
        return overlay;
    }

    function computeStats() {
        var project = InkProject.currentProject;
        var words = 0, knots = 0, stitches = 0, choices = 0, gathers = 0, todos = 0;
        project.files.forEach(function(f) {
            f.getValue().split('\n').forEach(function(line) {
                var t = line.trim();
                if (/^===/.test(t))        { knots++;    return; }
                if (/^=\s+\w/.test(t))     { stitches++; return; }
                if (/^[*+]/.test(t))       { choices++; }
                if (/^-(\s|$)/.test(t))    { gathers++; }
                if (/\bTODO\s*:/i.test(t)) { todos++; }
                if (!/^(~|VAR\b|CONST\b|LIST\b|INCLUDE\b|===|=\s|\/\/)/.test(t)) {
                    var w = t.replace(/\{[^}]*\}/g, ' ').replace(/\[.*?\]/g, ' ')
                             .replace(/^[*+>-]+\s*/, '').replace(/#.*$/, '')
                             .trim().split(/\s+/).filter(function(s) { return s.length > 0; });
                    words += w.length;
                }
            });
        });
        return { words: words, knots: knots, stitches: stitches, choices: choices, gathers: gathers, todos: todos };
    }

    function showStatsModal() {
        var st = computeStats();
        var modal = buildModal('Story Statistics', [
            ['Words', st.words], ['Knots', st.knots], ['Stitches', st.stitches],
            ['Choices', st.choices], ['Gathers', st.gathers], ['TODOs', st.todos],
        ]);
        var note = document.createElement('p');
        note.className = 'web-modal-note';
        note.textContent = 'Counts are approximate (source-level parsing).';
        modal.querySelector('.web-modal-box').insertBefore(note, modal.querySelector('.web-modal-close'));
        document.body.appendChild(modal);
        modal.classList.remove('hidden');
    }

    function showShortcutsModal() {
        var modal = buildModal('Keyboard Shortcuts', [
            ['Navigation', null],
            ['Ctrl+P', 'Go to anything'],
            ['Alt+Click', 'Jump to definition'],
            ['Ctrl+.', 'Next issue'],
            ['Editing', null],
            ['Ctrl+S', 'Save / download'],
            ['Ctrl+Shift+S', 'Export story.json'],
            ['Ctrl+Shift+C', 'Story statistics'],
            ['Ctrl+F', 'Find'],
            ['Ctrl+H', 'Find & replace'],
            ['Ctrl+= / Ctrl+−', 'Zoom in / out'],
            ['Ctrl+0', 'Reset zoom'],
            ['Files', null],
            ['Click title', 'Rename active file'],
            ['Dbl-click sidebar', 'Rename file'],
        ]);
        document.body.appendChild(modal);
        modal.classList.remove('hidden');
    }

    // ---- Menu bar --------------------------------------------------------
    (function() {
        var bar = document.createElement('div');
        bar.id = 'web-menubar';
        var win = document.querySelector('.window');
        win.insertBefore(bar, win.firstChild);

        var activeItem     = null;
        var activeDropdown = null;
        var currentSub     = null;
        var currentSubTrig = null;

        function closeSub() {
            if (currentSub) { currentSub.remove(); currentSub = null; currentSubTrig = null; }
        }

        function closeAll() {
            closeSub();
            if (activeDropdown) { activeDropdown.remove(); activeDropdown = null; }
            if (activeItem)     { activeItem.classList.remove('active'); activeItem = null; }
        }

        document.addEventListener('click', closeAll);
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeAll(); });

        function openMenu(item, buildFn) {
            if (activeItem === item) { closeAll(); return; }
            closeAll();
            activeItem = item;
            item.classList.add('active');
            var dd = document.createElement('div');
            dd.className = 'web-dropdown';
            activeDropdown = dd;
            buildFn(dd);
            document.body.appendChild(dd);
            var r = item.getBoundingClientRect();
            dd.style.left  = r.left + 'px';
            dd.style.top   = r.bottom + 'px';
            dd.style.right = 'auto';
        }

        function mkItem(label, shortcut, onClick) {
            var el = document.createElement('div');
            el.className = 'web-dropdown-item';
            if (shortcut) {
                el.style.display = 'flex';
                el.style.justifyContent = 'space-between';
                el.style.gap = '24px';
                var ls = document.createElement('span');
                ls.textContent = label;
                var ss = document.createElement('span');
                ss.className = 'web-dropdown-shortcut';
                ss.textContent = shortcut;
                el.appendChild(ls);
                el.appendChild(ss);
            } else {
                el.textContent = label;
            }
            el.addEventListener('mouseenter', closeSub);
            if (onClick) el.addEventListener('click', function(e) { e.stopPropagation(); closeAll(); onClick(); });
            return el;
        }

        function mkSep() {
            var el = document.createElement('div');
            el.className = 'web-dropdown-sep';
            return el;
        }

        function mkLabel(text) {
            var el = document.createElement('div');
            el.className = 'web-dropdown-category';
            el.textContent = text;
            return el;
        }

        function mkToggle(label, getVal, setVal) {
            var row = document.createElement('label');
            row.className = 'web-dropdown-toggle';
            var check = document.createElement('input');
            check.type = 'checkbox';
            check.checked = getVal();
            var span = document.createElement('span');
            span.textContent = label;
            row.appendChild(check);
            row.appendChild(span);
            row.addEventListener('click', function(e) { e.stopPropagation(); });
            row.addEventListener('mouseenter', closeSub);
            check.addEventListener('change', function() { setVal(check.checked); });
            return row;
        }

        function mkRadio(label, name, checked, onChange) {
            var row = document.createElement('label');
            row.className = 'web-dropdown-toggle';
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = name;
            radio.checked = checked;
            radio.addEventListener('change', function() { if (radio.checked) { closeAll(); onChange(); } });
            var span = document.createElement('span');
            span.textContent = label;
            row.appendChild(radio);
            row.appendChild(span);
            row.addEventListener('click', function(e) { e.stopPropagation(); });
            row.addEventListener('mouseenter', closeSub);
            return row;
        }

        function mkSubmenuTrigger(label, buildSubFn) {
            var el = document.createElement('div');
            el.className = 'web-dropdown-item web-dropdown-has-sub';
            el.textContent = label;
            el.addEventListener('mouseenter', function() {
                if (currentSubTrig === el) return;
                closeSub();
                currentSubTrig = el;
                var sub = document.createElement('div');
                sub.className = 'web-dropdown web-dropdown-sub';
                buildSubFn(sub);
                document.body.appendChild(sub);
                currentSub = sub;
                var r = el.getBoundingClientRect();
                sub.style.left  = r.right + 'px';
                sub.style.top   = r.top + 'px';
                sub.style.right = 'auto';
                var sr = sub.getBoundingClientRect();
                if (sr.right > window.innerWidth) {
                    sub.style.left = Math.max(0, r.left - sr.width) + 'px';
                }
                if (sr.bottom > window.innerHeight) {
                    sub.style.top = Math.max(0, window.innerHeight - sr.height) + 'px';
                }
            });
            return el;
        }

        function buildFileMenu(dd) {
            dd.appendChild(mkItem('New', null, function() { fileActions.doNew(); }));
            dd.appendChild(mkItem('Open…', 'Ctrl+O', function() { fileActions.doOpen(); }));
            dd.appendChild(mkItem('Save / Download', 'Ctrl+S', function() { fileActions.doSave(); }));
            dd.appendChild(mkSep());
            dd.appendChild(mkItem('Export to JSON…', 'Ctrl+Shift+S', function() {
                WebExport.exportJson(InkProject.currentProject, function(msg) { alert(msg); });
            }));
            dd.appendChild(mkItem('Export for web…', null, function() {
                WebExport.exportForWeb(InkProject.currentProject, function(msg) { alert(msg); }, null);
            }));
        }

        function buildEditMenu(dd) {
            dd.appendChild(mkItem('Find…', 'Ctrl+F', function() { ace.edit('editor').execCommand('find'); }));
            dd.appendChild(mkItem('Find & Replace…', 'Ctrl+H', function() { ace.edit('editor').execCommand('replace'); }));
        }

        function buildViewMenu(dd) {
            dd.appendChild(mkLabel('Theme'));
            var themeLabels = { main: 'Light', dark: 'Dark', contrast: 'Contrast', focus: 'Focus' };
            ['main', 'dark', 'contrast', 'focus'].forEach(function(t) {
                dd.appendChild(mkRadio(themeLabels[t], 'web-theme-r', currentThemeName === t, function() { updateTheme(t); }));
            });
            dd.appendChild(mkSep());
            dd.appendChild(mkLabel('Options'));
            dd.appendChild(mkToggle('Autocomplete', function() { return autoComplete; }, function(v) {
                autoComplete = v; EditorView.setAutoCompleteDisabled(!v); localStorage.setItem('autocomplete', v);
            }));
            dd.appendChild(mkToggle('Play view animation', function() { return animation; }, function(v) {
                animation = v; PlayerView.setAnimationEnabled(v); localStorage.setItem('animation', v);
            }));
        }

        function buildStoryMenu(dd) {
            dd.appendChild(mkItem('Go to anything…', 'Ctrl+P', function() { electron.ipcRenderer.emit('goto-anything'); }));
            dd.appendChild(mkItem('Next Issue', 'Ctrl+.', function() {
                if (allIssues.length === 0) return;
                currentIssueIdx = (currentIssueIdx + 1) % allIssues.length;
                gotoIssue(allIssues[currentIssueIdx]);
            }));
            dd.appendChild(mkSep());
            dd.appendChild(mkToggle('Show tags', function() { return tagsVisible; }, function(v) {
                tagsVisible = v;
                if (v) $('#main').removeClass('hideTags'); else $('#main').addClass('hideTags');
                localStorage.setItem('tags', v);
            }));
            dd.appendChild(mkSep());
            dd.appendChild(mkItem('Story statistics…', 'Ctrl+Shift+C', function() { showStatsModal(); }));
        }

        function buildInkMenu(dd) {
            WebSnippets.forEach(function(cat) {
                if (cat.separator) { dd.appendChild(mkSep()); return; }
                if (!cat.categoryName || !cat.snippets) return;
                dd.appendChild(mkSubmenuTrigger(cat.categoryName, function(sub) {
                    cat.snippets.forEach(function(sn) {
                        if (sn.separator) { sub.appendChild(mkSep()); return; }
                        // Plain item — no mouseenter→closeSub, which would kill the sub itself
                        var el = document.createElement('div');
                        el.className = 'web-dropdown-item';
                        el.textContent = sn.name;
                        el.addEventListener('click', function(e) {
                            e.stopPropagation(); closeAll();
                            ace.edit('editor').insert(sn.ink);
                            ace.edit('editor').focus();
                        });
                        sub.appendChild(el);
                    });
                }));
            });
        }

        function buildHelpMenu(dd) {
            dd.appendChild(mkItem('Keyboard shortcuts…', 'F1', function() { showShortcutsModal(); }));
        }

        [
            { label: 'File',  build: buildFileMenu  },
            { label: 'Edit',  build: buildEditMenu  },
            { label: 'View',  build: buildViewMenu  },
            { label: 'Story', build: buildStoryMenu },
            { label: 'Ink',   build: buildInkMenu   },
            { label: 'Help',  build: buildHelpMenu  },
        ].forEach(function(m) {
            var item = document.createElement('div');
            item.className = 'web-menubar-item';
            item.textContent = m.label;
            bar.appendChild(item);
            item.addEventListener('click', function(e) { e.stopPropagation(); openMenu(item, m.build); });
            item.addEventListener('mouseenter', function() { if (activeItem && activeItem !== item) openMenu(item, m.build); });
        });
    })();

    // Restore the last auto-saved session (if any)
    var saved = WebFileIO.loadFromLocalStorage();
    if (saved) {
        setAllFiles(saved.files, saved.mainFilename);
    }
});
