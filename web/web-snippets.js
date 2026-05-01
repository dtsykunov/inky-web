// Ink snippet definitions for the web toolbar menu.
// Longer snippets are inlined by build.mjs into web-snippets-generated.js.
var s = require('./web-snippets-generated.js');
function ink(name) { return s[name] || ''; }

exports.snippets = [
    {
        categoryName: 'Basic structure',
        snippets: [
            { name: 'Knot (main section)',  ink: "=== knotName ===\nThis is the content of the knot.\n-> END\n" },
            { name: 'Stitch (sub-section)', ink: "= stitchName\nThis is the content of the stitch.\n-> END\n" },
            { separator: true },
            { name: 'Divert',              ink: "-> targetKnotName" },
            { name: 'Ending indicator',    ink: "-> END\n" },
        ]
    },
    {
        categoryName: 'Choices',
        snippets: [
            { name: 'Basic choice',              ink: "* This is a choice that can only be chosen once\n" },
            { name: 'Sticky choice',             ink: "+ This is a sticky choice — can be chosen more than once\n" },
            { name: 'Choice without printing',   ink: "* [A choice where the content isn't printed after choosing]\n" },
            { name: 'Choice with mixed output',  ink: "* Try [it] this example!\n" },
        ]
    },
    {
        categoryName: 'Variables',
        snippets: [
            { name: 'Global variable',   ink: "VAR myNumber = 5\n" },
            { name: 'Temporary variable', ink: "temp myTemporaryValue = 5\n" },
            { name: 'Modify variable',   ink: "~ myNumber = myNumber + 1\n" },
            { name: 'Get variable type', ink: ink('type_of') },
        ]
    },
    {
        categoryName: 'Inline logic',
        snippets: [
            { name: 'Condition', ink: "{yourVariable: This is written if yourVariable is true|Otherwise this is written}" },
        ]
    },
    {
        categoryName: 'Multi-line logic',
        snippets: [
            { name: 'Condition', ink: "{yourVariable:\n    This is written if yourVariable is true.\n  - else:\n    Otherwise this is written.\n}\n" },
        ]
    },
    {
        categoryName: 'Comments',
        snippets: [
            { name: 'Single-line comment', ink: "// This line is a comment.\n" },
            { name: 'Block comment',       ink: "/* ---------------------------------\n\n   This whole section is a comment \n\n ----------------------------------*/\n" },
        ]
    },
    { separator: true },
    {
        categoryName: 'List-handling',
        snippets: [
            { name: 'List: pop',                      ink: ink('list_pop') },
            { name: 'List: pop_random',               ink: ink('list_pop_random') },
            { name: 'List: LIST_NEXT and LIST_PREV',  ink: ink('list_prev_next') },
            { name: 'List: list_item_is_member_of',   ink: ink('list_item_is_member_of') },
            { name: 'List: list_random_subset',       ink: ink('list_random_subset') },
            { name: 'List: list_random_subset_of_size', ink: ink('list_random_subset_of_size') },
            { name: 'List: string_to_list',           ink: ink('string_to_list') },
        ]
    },
    {
        categoryName: 'Useful functions',
        snippets: [
            { name: 'Logic: maybe',              ink: ink('maybe') },
            { separator: true },
            { name: 'Mathematics: divisor',      ink: "=== function divisor(x, n)\n~ return (x - x mod n) / n" },
            { name: 'Mathematics: abs',          ink: "=== function abs(x)\n{ x < 0:\n      ~ return -1 * x\n  - else: \n      ~ return x\n}" },
            { separator: true },
            { name: 'Flow: came_from',           ink: ink('came_from') },
            { name: 'Flow: seen_very_recently',  ink: ink('seen_very_recently') },
            { name: 'Flow: seen_more_recently_than', ink: ink('seen_more_recently_than') },
            { name: 'Flow: seen_this_scene',     ink: ink('seen_this_scene') },
            { name: 'Flow: thread_in_tunnel',    ink: ink('thread_in_tunnel') },
            { separator: true },
            { name: 'Printing: a (or an)',       ink: ink('a_or_an') },
            { name: 'Printing: UPPERCASE',       ink: ink('uppercase') },
            { name: 'Printing: print_number',    ink: ink('print_number') },
            { name: 'Printing: list_with_commas', ink: ink('list_with_commas') },
        ]
    },
    {
        categoryName: 'Useful systems',
        snippets: [
            { name: 'List Items as Integer Variables', ink: ink('listToNumber') },
            { name: 'Swing Variables',                 ink: ink('swing_variables') },
            { name: 'Storylets',                       ink: ink('storylets') },
        ]
    },
    { separator: true },
    {
        categoryName: 'Full stories',
        snippets: [
            { name: 'Crime Scene (from Writing with Ink)', ink: ink('murder_scene') },
            { name: 'Swindlestones (from Sorcery!)',       ink: ink('swindlestones') },
            { name: 'Pontoon Game (from Overboard!)',      ink: ink('pontoon_example') },
        ]
    },
];
