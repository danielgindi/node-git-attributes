const Path = require('path');
const Fs = require('fs');
const minimatch = require('minimatch').minimatch;

/**
 * @typedef {Object} GitAttributes.Rule
 * @property {String|null} pattern
 * @property {String} comment
 * @property {Object<String, Boolean|String>|null} attrs
 */

/**
 * @typedef {Object} GitAttributes.SerializationOptions
 * @property {string} delimiter
 */

/**
 * @class
 */
class GitAttributes {

    /**
     * @param {GitAttributes.SerializationOptions} opts 
     */
    constructor(opts) {
        const p = this._p = {};

        /** @type {GitAttributes.Rule[]} */
        p.rules = [];

        /** @type {GitAttributes.SerializationOptions} */
        p.opts = {
            delimiter: opts && typeof opts.delimiter === 'string' ? opts.delimiter : '\t'
        };

        this.rules = [];
    }

    /**
     * Rules
     * @returns {GitAttributes.Rule[]}
     */
    get rules() {
        const p = this._p;
        return p.rules;
    }

    /** @param {GitAttributes.Rule[]} rules */
    set rules(rules) {
        const p = this._p;
        p.rules = rules;
    }

    /**
     * Clears all rules.
     */
    clear() {
        this.rules = [];
    }

    /**
     * Add a rule
     * @param {GitAttributes.Rule} rule
     */
    addRule(rule) {
        const p = this._p;
        p.rules.push(rule);
    }

    /**
     * Add a set of rules
     * @param {GitAttributes.Rule[]} rules
     */
    addRules(rules) {
        const p = this._p;
        p.rules.push(...rules);
    }

    /**
     * Parse the `.gitattributes` file of a specific repo.
     * @remarks Parsing does not clear previously parsed rules. This is to allow parsing global + local files etc.
     * @param {String} path - path to the repo
     * @param {Boolean} [includeComments=false] - return a rule even for a comment (will have `pattern=null`)
     * @param {Boolean} [includeEmptyLines=false] - return an empty rule for empty lines
     * @returns {Boolean} `true` if succeeded, `false` if a `.gitattributes` file could not be found
     */
    parseAttributesForRepo(path, includeComments = false, includeEmptyLines = false) {
        let attributesPath = GitAttributes.findAttributesFile(path);
        if (!attributesPath) return false;

        this.parse(
            Fs.readFileSync(attributesPath, {encoding: 'utf8'}),
            includeComments,
            includeEmptyLines);

        return true;
    }

    /**
     * Serialize the rules into a `.gitattributes` file in a specific repo.
     * @param {String} path - path to the repo
     * @returns {Boolean} `true` if succeeded, `false` if a proper place for a `.gitattributes` file could not be found
     */
    serializeAttributesIntoRepo(path) {
        let attributesPath = GitAttributes.findAttributesFile(path, false);
        if (!attributesPath) return false;

        Fs.writeFileSync(attributesPath, this.serialize(), {encoding: 'utf8'});

        return true;
    }

    /**
     * Parse rules from input string
     * @remarks Parsing does not clear previously parsed rules. This is to allow parsing global + local files etc.
     * @param {String} data
     * @param {Boolean} [includeComments=false] - return a rule even for a comment (will have `pattern=null`)
     * @param {Boolean} [includeEmptyLines=false] - return an empty rule for empty lines
     */
    parse(data, includeComments = false, includeEmptyLines = false) {
        let lines = data.split(/\r\n|\r|\n/g);

        for (let line of lines) {
            this.readLine(line, includeComments, includeEmptyLines);
        }
    }

    /**
     * Serializes the rules into a `.gitattributes` format.
     * The output can be written to a file.
     * @returns {String}
     */
    serialize() {
        const p = this._p;

        let lines = [];

        for (let rule of this.rules) {
            let line = GitAttributes.serializeRule(rule, p.opts);
            if (line !== null)
                lines.push(line);
        }

        return lines.join('\n') + '\n';
    }

    /**
     * Read a single line. You an use this with one-by-line readers.
     * @param {String} line
     * @param {Boolean} [includeComments=false] - return a rule even for a comment (will have `pattern=null`)
     * @param {Boolean} [includeEmptyLines=false] - return an empty rule for empty lines
     */
    readLine(line, includeComments = false, includeEmptyLines = false) {
        const p = this._p;
        let rule = GitAttributes.parseRule(line, includeComments, includeEmptyLines);
        if (rule)
            p.rules.push(rule);
    }

    /**
     * Fetch all the rules for the specified path
     * @param {String} path - the path of the file relative to the repo
     * @returns {GitAttributes.Rule[]} array of rules
     */
    rulesForPath(path) {
        let rules = /**@type {GitAttributes.Rule[]}*/[];

        // Remove leading ./ which cause trouble with minimatch
        while (/^(\.\/|\.\\)/.test(path)) {
            path = path.substr(2);
        }

        // Make the path absolute
        if (!/^[\/\\]/.test(path))
            path = '/' + path;

        for (let rule of this.rules) {
            if (rule.pattern === null) continue;

            let fullPattern = rule.pattern[0] === "/"
                ? `${rule.pattern}`
                : `**/${rule.pattern}`;

            if (minimatch(path, fullPattern))
                rules.push(rule);
        }

        return rules;
    }

    /**
     * Fetch all attributes related to a specific path
     * @param {String} path - the path of the file relative to the repo
     * @returns {Object<String, Boolean|String>} attributes
     */
    attrsForPath(path) {
        let rules = this.rulesForPath(path);
        let attrs = /**@type {Object<String, Boolean|String>}*/{};

        for (let rule of rules) {
            let ruleAttrs = rule.attrs;
            for (let key of Object.keys(ruleAttrs)) {
                attrs[key] = ruleAttrs[key];
            }
        }

        return attrs;
    }

    /**
     * Parse a rule
     * @param {String} rule
     * @param {Boolean} [includeComments=false] - return a rule even for a comment (will have `pattern=null`)
     * @param {Boolean} [includeEmptyLines=false] - return an empty rule for empty lines
     * @returns {GitAttributes.Rule|null}
     */
    static parseRule(rule, includeComments = false, includeEmptyLines = false) {
        rule = rule.trim();

        // Empty line
        if (!rule)
            return includeEmptyLines
                ? {comment: null, pattern: null, attr: null}
                : null;

        // Comment
        if (rule[0] === '#') {
            if (includeComments)
                return {comment: rule.substr(1), pattern: null, attrs: null};
            return null;
        }

        // Escaped dash, convert to actual dash
        if (rule[0] === '\\' && rule[1] === '#')
            rule = rule.substr(1);

        let pattern, attrs;

        if (rule[0] === '"') {
            let match = rule.match(/^"(?:[^"\\]|\\.)*"/);
            if (match) {
                try {
                    pattern = JSON.parse(match[0]);
                } catch (ignored) {
                    pattern = pattern.replace(/\\(.)/g, '\\1');
                }
                attrs = rule.substr(match[0].length + 1).trim();
            } else {
                pattern = match[0];
                attrs = null;
            }
        } else {
            let match = /\s+/g.exec(rule);
            pattern = match ? rule.substr(0, match.index) : rule;
            attrs = match ? rule.substr(match.index + match[0].length) : null;
        }

        return {
            pattern: pattern,
            attrs: attrs ? this.parseAttributes(attrs) : {},
            comment: null,
        };
    }

    /**
     * Serializes a rule to a string
     * @param {GitAttributes.Rule|null} rule
     * @param {GitAttributes.SerializationOptions} [opts]
     * @returns {String|null}
     */
    static serializeRule(rule, opts) {
        if (!rule)
            return null;

        if (rule.pattern === null) {
            if (rule.comment !== null)
                return '#' + rule.comment;

            return '';
        }

        let out = /\s/.test(rule.pattern)
            ? '"' + rule.pattern.replace(/[\\"]/g, '\\\\\\0') + '"'
            : rule.pattern;
        let attrsOuts = '';

        if (rule.attrs) {
            for (let key of Object.keys(rule.attrs)) {
                let value = rule.attrs[key];

                if (key === 'diff' && value === false && rule.attrs['binary'])
                    continue;

                // Backwards compatible flags
                if (key === 'text') {
                    if (value === true && rule.attrs['crlf'] === true)
                        continue;
                    if (value === false && rule.attrs['crlf'] === false)
                        continue;
                }

                if (key === 'eol' && value === 'lf' && rule.attrs['crlf'] === 'input')
                    continue;

                if (attrsOuts.length)
                    attrsOuts += ' ';

                if (value === true)
                    attrsOuts += key;
                else if (value === false)
                    attrsOuts += '-' + key;
                else if (value != null)
                    attrsOuts += key + '=' + value.toString();
            }
        }

        let delimiter = typeof opts.delimiter === 'string' ? opts.delimiter : '\t';
        return out + (attrsOuts ? delimiter + attrsOuts : '');
    }

    /**
     * Parse a rule's attributes
     * @param {String} input - attributes input
     * @returns {Object<String, Boolean|String>}
     */
    static parseAttributes(input) {
        let values = {};

        for (let piece of input.split(/\s+/g)) {
            if (piece === '=') continue;

            let key = piece, value;

            // Falsy attribute: "-attr"
            if (piece.startsWith('-')) {
                key = piece.substr(1);
                value = false;
            }
            // Attribute with value: "attr=value"
            else if (piece.includes('=')) {
                let i = piece.indexOf('=');
                key = piece.substr(0, i);
                value = piece.substr(i + 1);
            }
            // Truthy attribute: "attr"
            else {
                value = true;
            }

            values[key] = value;

            // Treat special attributes and backwards compatible attributes
            // https://git-scm.com/docs/gitattributes
            if (key === 'binary' && value)
                values.diff = false;
            else if (key === 'crlf' && value === true)
                values.text = true;
            else if (key === 'crlf' && value === false)
                values.text = false;
            else if (key === 'crlf' && value === 'input')
                values.eol = 'lf';
        }

        return values;
    }

    /**
     * Retrieve the path to the `.gitattributes` file
     * @param {String} repoPath - path to the repo, or any path inside the repo
     * @param {Boolean} [validate=true] - make sure that a `.gitattributes` file actually exists
     * @returns {String|null} The path to the `.gitattributes` file, or null if not found.
     */
    static findAttributesFile(repoPath, validate = true) {
        let gitBaseDir = repoPath;

        // Find the root of the repo
        while (
            !Fs.existsSync(Path.join(gitBaseDir, '.git')) ||
            !Fs.existsSync(Path.join(gitBaseDir, '.git/config'))) {

            let next = Path.resolve(gitBaseDir, '..');
            if (next === gitBaseDir) break;

            gitBaseDir = next;
        }

        let attributesPath = Path.join(gitBaseDir, '.gitattributes');
        if (!validate || Fs.existsSync(attributesPath))
            return attributesPath;

        return null;
    }
}

module.exports = GitAttributes;