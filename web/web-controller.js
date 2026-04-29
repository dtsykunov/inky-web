

// jQuery must be set as a global before any other module loads
const $ = window.jQuery = require('../app/renderer/jquery-2.2.3.min.js');

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

// Web-specific replacement for liveCompiler (no inklecate, uses inkjs directly)
const LiveCompiler = require('./web-liveCompiler.js').WebLiveCompiler;

// ----------------------------------------------------------------
// InkProject events
// ----------------------------------------------------------------

InkProject.setEvents({
    newProject: (project) => {
        EditorView.focus();
        LiveCompiler.setProject(project);
        const filename = project.activeInkFile.filename();
        ToolbarView.setTitle(filename);
        NavView.setMainInkFilename(filename);
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
// Helpers
// ----------------------------------------------------------------

function gotoIssue(issue) {
    InkProject.currentProject.showInkFile(issue.filename);
    EditorView.gotoLine(issue.lineNumber);
    NavHistory.addStep();
}

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

LiveCompiler.setEvents({
    resetting: () => {},
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
        for (const error of errors) {
            if (error.filename === InkProject.currentProject.activeInkFile.relativePath())
                EditorView.addError(error);
            if (error.type === 'RUNTIME ERROR' || error.type === 'RUNTIME WARNING')
                PlayerView.addLineError(error, () => gotoIssue(error));
        }
        ToolbarView.updateIssueSummary(errors);
    },
    playerPrompt: (_replaying, doneCallback) => {
        // Expression watch not supported in web mode — skip straight to done
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
    jumpToSource: () => {} // needs inklecate source maps — not available in web
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

const path = require('path'); // aliased to path-browserify by esbuild

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

function updateTheme(newTheme) {
    const themes = ['dark', 'contrast', 'focus'];
    themes.forEach(t => $('.window').removeClass(t));
    if (newTheme && newTheme.toLowerCase() !== 'main')
        $('.window').addClass(newTheme);
    LiveCompiler.setEdited();
}
updateTheme(window.localStorage.getItem('theme'));

// ----------------------------------------------------------------
// Boot
// ----------------------------------------------------------------

$(document).ready(() => {
    InkProject.startNew();
    NavView.setKnots(InkProject.currentProject.mainInk);
    ToolbarView.setBusySpinnerVisible(false);
});
