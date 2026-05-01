

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
        for (const error of errors) {
            if (error.filename === InkProject.currentProject.activeInkFile.relativePath())
                EditorView.addError(error);
            if (error.type === 'RUNTIME ERROR' || error.type === 'RUNTIME WARNING')
                PlayerView.addLineError(error, () => gotoIssue(error));
        }
        ToolbarView.updateIssueSummary(errors);
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
    themeClasses.forEach(t => $('.window').removeClass(t));
    if (newTheme && newTheme.toLowerCase() !== 'main')
        $('.window').addClass(newTheme);
    currentThemeName = newTheme || 'main';
    window.localStorage.setItem('theme', currentThemeName);
    LiveCompiler.setEdited();
}
updateTheme(currentThemeName);

// ----------------------------------------------------------------
// Boot
// ----------------------------------------------------------------

$(document).ready(() => {
    InkProject.startNew();
    NavView.setKnots(InkProject.currentProject.mainInk);
    ToolbarView.setBusySpinnerVisible(false);

    WebFileIO.init({
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
            // currentFilename updated by the newProject event handler above
            WebFileIO.autosave(currentFilename, getAllFilesContent());
        },
    });

    // Export-for-web button
    (function() {
        var btn  = document.createElement('div');
        btn.className = 'button web-btn';
        btn.id        = 'web-export-btn';
        btn.title     = 'Export as web player';
        var icon = document.createElement('span');
        icon.className = 'icon icon-export';
        btn.appendChild(icon);
        var leftButtons = document.querySelector('#toolbar .buttons.left');
        if (leftButtons) leftButtons.appendChild(btn);

        btn.addEventListener('click', function() {
            WebExport.exportForWeb(
                InkProject.currentProject,
                function(msg) { alert(msg); },
                null
            );
        });
    })();

    // Click the toolbar title to rename the active file inline
    (function() {
        var $title = $('h1.title');
        $title.attr('title', 'Click to rename');

        var $input = $('<input id="title-rename-input" type="text" spellcheck="false">')
            .insertAfter($title);

        function startRename() {
            var name = InkProject.currentProject.activeInkFile.filename();
            // Strip .ink for cleaner editing; other extensions are kept as-is
            var display = /\.ink$/i.test(name) ? name.slice(0, -4) : name;
            $title.hide();
            $input.val(display).show().focus().select();
        }

        function commitRename() {
            $input.hide();
            $title.show();
            var inkFile = InkProject.currentProject.activeInkFile;
            if (inkFile) renameInkFile(inkFile, $input.val());
        }

        $title.on('click', startRename);

        $input.on('keydown', function(e) {
            if (e.key === 'Enter')  { e.preventDefault(); commitRename(); }
            if (e.key === 'Escape') { $input.hide(); $title.show(); }
        });
        // Commit on blur unless the input was already hidden (Enter/Escape path)
        $input.on('blur', function() {
            if ($input.is(':visible')) commitRename();
        });
    })();

    // Double-click a file in the sidebar to rename it (same logic)
    $(document).on('dblclick', '#file-nav-wrapper .nav-group-item', function(e) {
        e.preventDefault();
        var fileId  = parseInt($(this).attr('data-file-id'));
        var inkFile = InkProject.currentProject.inkFileWithId(fileId);
        if (!inkFile) return;
        var newName = window.prompt('Rename file:', inkFile.filename());
        if (newName) renameInkFile(inkFile, newName);
    });

    // Ctrl+P → Go to Anything; Ctrl+. → Next Issue
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            electron.ipcRenderer.emit('goto-anything');
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '.') {
            e.preventDefault();
            if (allIssues.length === 0) return;
            currentIssueIdx = (currentIssueIdx + 1) % allIssues.length;
            gotoIssue(allIssues[currentIssueIdx]);
        }
    });

    // Go to Anything toolbar button (right side)
    (function() {
        var btn = document.createElement('div');
        btn.className = 'button web-btn';
        btn.id        = 'web-goto-btn';
        btn.title     = 'Go to anything (Ctrl+P)';
        var icon = document.createElement('span');
        icon.className = 'icon icon-search';
        btn.appendChild(icon);
        var rightButtons = document.querySelector('#toolbar .buttons.right');
        if (rightButtons) rightButtons.appendChild(btn);
        btn.addEventListener('click', function() {
            electron.ipcRenderer.emit('goto-anything');
        });
    })();

    // Next Issue toolbar button (right side)
    (function() {
        var btn = document.createElement('div');
        btn.className = 'button web-btn';
        btn.id        = 'web-next-issue-btn';
        btn.title     = 'Jump to next issue (Ctrl+.)';
        var icon = document.createElement('span');
        icon.className = 'icon icon-attention';
        btn.appendChild(icon);
        var rightButtons = document.querySelector('#toolbar .buttons.right');
        if (rightButtons) rightButtons.appendChild(btn);
        btn.addEventListener('click', function() {
            if (allIssues.length === 0) return;
            currentIssueIdx = (currentIssueIdx + 1) % allIssues.length;
            gotoIssue(allIssues[currentIssueIdx]);
        });
    })();

    // Theme-cycle toolbar button (right side)
    (function() {
        var themeOrder  = ['main', 'dark', 'contrast', 'focus'];
        var themeLabels = { main: 'Light', dark: 'Dark', contrast: 'Contrast', focus: 'Focus' };

        var btn = document.createElement('div');
        btn.className = 'button web-btn';
        btn.id        = 'web-theme-btn';
        var icon = document.createElement('span');
        icon.className = 'icon icon-palette';
        btn.appendChild(icon);
        var rightButtons = document.querySelector('#toolbar .buttons.right');
        if (rightButtons) rightButtons.appendChild(btn);

        function refreshTitle() {
            var next = themeOrder[(themeOrder.indexOf(currentThemeName) + 1) % themeOrder.length];
            btn.title = 'Theme: ' + themeLabels[currentThemeName] + ' → click for ' + themeLabels[next];
        }
        refreshTitle();

        btn.addEventListener('click', function() {
            var next = themeOrder[(themeOrder.indexOf(currentThemeName) + 1) % themeOrder.length];
            updateTheme(next);
            refreshTitle();
        });
    })();

    // Restore the last auto-saved session (if any)
    var saved = WebFileIO.loadFromLocalStorage();
    if (saved) {
        setAllFiles(saved.files, saved.mainFilename);
    }
});
