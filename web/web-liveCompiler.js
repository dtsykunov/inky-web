var { Compiler }       = require('inkjs/compiler/Compiler');
var { CompilerOptions } = require('inkjs/compiler/CompilerOptions');

var events = {};
var project = null;
var story = null;

var choiceSequence  = [];   // choices the user has made so far (replayed on recompile)
var currentTurnIdx  = -1;
var replaying       = false;

var sessionCounter  = 0;
var currentSessionId = null;

var lastEditorChange = null;
var reloadPending    = false;

var issues = [];

// ----------------------------------------------------------------
// Public API (same surface as the original LiveCompiler)
// ----------------------------------------------------------------

function setProject(p) {
    project = p;
    reloadPending = true;
}

function setEdited() {
    lastEditorChange = Date.now();
}

function setEvents(e) {
    events = e;
}

function resetIssues() {
    issues = [];
}

function setIssues(newIssues) {
    issues = newIssues || [];
    events.errorsAdded && events.errorsAdded(issues);
}

function addIssues(newIssues) {
    issues = issues.concat(newIssues || []);
    events.errorsAdded && events.errorsAdded(newIssues || []);
}

function getIssues() { return issues; }

function getIssuesForFilename(filename) {
    return issues.filter(function(issue) { return issue.filename === filename; });
}

function choose(choiceObj) {
    if (!story) return;
    choiceSequence.push(choiceObj.number);
    currentTurnIdx++;
    try {
        story.ChooseChoiceIndex(choiceObj.number);
        runTurn();
    } catch(e) {
        events.unexpectedError && events.unexpectedError(e.message || String(e));
    }
}

function rewind() {
    choiceSequence = [];
    currentTurnIdx = -1;
    reloadAndPlay();
}

function stepBack() {
    if (choiceSequence.length > 0)
        choiceSequence.splice(-1, 1);
    reloadAndPlay();
}

// Stubs for features that need inklecate source maps
function getLocationInSource(_offset, cb) { cb && cb(null); }
function getRuntimePathInSource(_path, cb) { cb && cb(null); }
function evaluateExpression(_expr, cb) { cb && cb(null, 'not available in web mode'); }
function getStats(cb) { cb && cb({}); }
function exportJson(_compat, cb) { cb && cb('Export not available in web mode'); }

// ----------------------------------------------------------------
// Compile + play loop
// ----------------------------------------------------------------

function reloadAndPlay() {
    if (!project || !project.ready) {
        reloadPending = true;
        events.compilerBusyChanged && events.compilerBusyChanged(true);
        return;
    }

    lastEditorChange = null;
    reloadPending    = false;
    replaying        = true;
    currentTurnIdx   = 0;

    sessionCounter++;
    currentSessionId = 'web_' + sessionCounter;

    events.resetting && events.resetting(currentSessionId);
    resetIssues();
    events.compilerBusyChanged && events.compilerBusyChanged(true);

    // Build file map so INCLUDE statements can be resolved
    var fileMap = {};
    project.files.forEach(function(f) { fileMap[f.relativePath()] = f.getValue(); });

    var compiler;
    var mainFilename = project.mainInk.filename();
    try {
        compiler = new Compiler(
            project.mainInk.getValue(),
            new CompilerOptions(
                mainFilename,
                [],          // pluginNames
                false,       // countAllVisits
                null,        // errorHandler (we use compiler.errors after Compile())
                {
                    ResolveInkFilename: function(fn) { return fn; },
                    LoadInkFileContents: function(fn) { return fileMap[fn] || ''; }
                }
            )
        );
        story = compiler.Compile();
    } catch(e) {
        // inkjs throws "Compilation failed." after collecting errors in compiler.errors.
        // Surface those structured errors rather than the generic exception message.
        var earlyIssues = [];
        if (compiler) {
            (compiler.errors        || []).forEach(function(m) { earlyIssues.push(parseMessage(m, 'ERROR',   mainFilename)); });
            (compiler.warnings      || []).forEach(function(m) { earlyIssues.push(parseMessage(m, 'WARNING', mainFilename)); });
            (compiler.authorMessages|| []).forEach(function(m) { earlyIssues.push(parseMessage(m, 'TODO',    mainFilename)); });
        }
        if (earlyIssues.length === 0)
            earlyIssues = [{ type: 'ERROR', filename: mainFilename, lineNumber: 1, message: e.message || String(e) }];
        setIssues(earlyIssues);
        events.compilerBusyChanged && events.compilerBusyChanged(false);
        events.exitDueToError && events.exitDueToError();
        return;
    }

    // Collect compile-time errors/warnings/TODOs
    var compileIssues = [];
    (compiler.errors        || []).forEach(function(m) { compileIssues.push(parseMessage(m, 'ERROR',   mainFilename)); });
    (compiler.warnings      || []).forEach(function(m) { compileIssues.push(parseMessage(m, 'WARNING', mainFilename)); });
    (compiler.authorMessages|| []).forEach(function(m) { compileIssues.push(parseMessage(m, 'TODO',    mainFilename)); });

    if (!story || (compiler.errors && compiler.errors.length > 0)) {
        setIssues(compileIssues);
        events.compilerBusyChanged && events.compilerBusyChanged(false);
        events.exitDueToError && events.exitDueToError();
        return;
    }

    // Story compiled OK — wire up runtime error handler
    story.onError = function(msg, type) {
        var isWarning = type && String(type).indexOf('Warning') >= 0;
        addIssues([{
            type: isWarning ? 'RUNTIME WARNING' : 'RUNTIME ERROR',
            message: msg,
            lineNumber: 1,
            filename: mainFilename
        }]);
    };

    events.compileComplete && events.compileComplete(currentSessionId);
    if (compileIssues.length > 0) {
        setIssues(compileIssues);
    }
    runTurn();
}

// Run the story forward from its current position until a choice point or end
function runTurn() {
    try {
        while (story.canContinue) {
            var text = story.Continue();
            if (text && text.trim().length > 0)
                events.textAdded && events.textAdded(text);
            if (story.currentTags && story.currentTags.length > 0)
                events.tagsAdded && events.tagsAdded(story.currentTags);
        }
    } catch(e) {
        events.compilerBusyChanged && events.compilerBusyChanged(false);
        events.unexpectedError && events.unexpectedError(e.message || String(e));
        return;
    }

    events.compilerBusyChanged && events.compilerBusyChanged(false);

    if (story.currentChoices.length > 0) {
        var turnCount = choiceSequence.length + 1;

        story.currentChoices.forEach(function(choice, i) {
            var isLatestTurn = currentTurnIdx >= turnCount - 1;
            // playerView.addChoice expects { choice: { text, tags }, number, sourceSessionId }
            events.choiceAdded && events.choiceAdded(
                { number: i, choice: { text: choice.text, tags: choice.tags || [] }, sourceSessionId: currentSessionId },
                isLatestTurn
            );
        });

        // Capture loop state for the async callback
        var sessionAtPrompt = currentSessionId;
        var replayingAtPrompt = replaying;

        events.playerPrompt && events.playerPrompt(replayingAtPrompt, function() {
            if (currentSessionId !== sessionAtPrompt) return; // stale session

            if (replayingAtPrompt && currentTurnIdx < choiceSequence.length) {
                var choiceIdx = choiceSequence[currentTurnIdx];
                currentTurnIdx++;
                var justFinishedReplay = (currentTurnIdx >= choiceSequence.length);
                if (justFinishedReplay) replaying = false;

                // Defer so the DOM can paint between turns
                setTimeout(function() {
                    if (currentSessionId !== sessionAtPrompt) return;
                    try {
                        story.ChooseChoiceIndex(choiceIdx);
                        runTurn();
                    } catch(e) {
                        events.unexpectedError && events.unexpectedError(e.message || String(e));
                    }
                    if (justFinishedReplay)
                        events.replayComplete && events.replayComplete(currentSessionId);
                }, 0);
            } else if (replayingAtPrompt) {
                // Replay reached the live frontier without needing a choice
                replaying = false;
                events.replayComplete && events.replayComplete(currentSessionId);
            }
        });

    } else {
        // No choices — story is done
        if (replaying) {
            replaying = false;
            events.replayComplete && events.replayComplete(currentSessionId);
        }
        events.storyCompleted && events.storyCompleted();
    }
}

// ----------------------------------------------------------------
// Error message parser
// Inkjs errors look like: "ERROR: 'filename' line 5: message"
// ----------------------------------------------------------------

function parseMessage(msg, defaultType, defaultFilename) {
    // Match optional prefix, optional filename, optional line number, then message
    var m = msg.match(/^(?:(ERROR|WARNING|TODO|AUTHOR):\s*)?(?:'([^']+)'\s+)?(?:line\s+(\d+)[:\s]+)?(.+)$/i);
    if (m) {
        return {
            type:       (m[1] || defaultType).toUpperCase().replace('AUTHOR', 'TODO'),
            filename:   m[2] || defaultFilename,
            lineNumber: m[3] ? parseInt(m[3], 10) : 1,
            message:    (m[4] || msg).trim()
        };
    }
    return { type: defaultType, filename: defaultFilename, lineNumber: 1, message: msg };
}

// ----------------------------------------------------------------
// Debounce loop — recompile 500ms after last edit
// ----------------------------------------------------------------

setInterval(function() {
    if (lastEditorChange !== null && Date.now() - lastEditorChange > 500 || reloadPending) {
        reloadAndPlay();
    }
}, 250);

// ----------------------------------------------------------------

// inkProject.js imports require('./liveCompiler.js').LiveCompiler — match that name too
exports.LiveCompiler = exports.WebLiveCompiler = {
    setProject:            setProject,
    setEdited:             setEdited,
    setEvents:             setEvents,
    getIssues:             getIssues,
    getIssuesForFilename:  getIssuesForFilename,
    choose:                choose,
    rewind:                rewind,
    stepBack:              stepBack,
    getLocationInSource:   getLocationInSource,
    getRuntimePathInSource: getRuntimePathInSource,
    evaluateExpression:    evaluateExpression,
    getStats:              getStats,
    exportJson:            exportJson,
    reload:                reloadAndPlay,
};
