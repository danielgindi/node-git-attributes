const assert = require('assert');
const GitAttributes = require('../');

describe('Parse attributes', async () => {

    it(`Parse simple attributes`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('*.sln       merge=binary');
        assert.deepEqual(
            attrs.attrsForPath('hello.sln'),
            {
                merge: 'binary'
            });
    });

    it(`Binary flag`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('*.jpg binary');
        assert.deepEqual(
            attrs.attrsForPath('landscape.jpg'),
            {
                binary: true,
                diff: false
            });
    });

    it(`Binary flag and diff override`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('package-lock.json binary\npackage-lock.json diff=astextplain');
        assert.deepEqual(
            attrs.attrsForPath('package-lock.json'),
            {
                binary: true,
                diff: 'astextplain'
            });
    });

    it(`Backwards compatibility: crlf`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('*.txt crlf');
        assert.deepEqual(
            attrs.attrsForPath('readme.txt'),
            {
                crlf: true,
                text: true
            });
    });

    it(`Backwards compatibility: -crlf`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('*.txt -crlf');
        assert.deepEqual(
            attrs.attrsForPath('readme.txt'),
            {
                crlf: false,
                text: false
            });
    });

    it(`Backwards compatibility: crlf=input`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('*.txt crlf=input');
        assert.deepEqual(
            attrs.attrsForPath('readme.txt'),
            {
                crlf: 'input',
                eol: 'lf'
            });
    });

    it(`True and negate #1`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('*.jpg flag -flag');
        assert.deepEqual(
            attrs.attrsForPath('landscape.jpg'),
            {
                flag: false
            });
    });

    it(`True and negate #2`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('*.jpg flag\n*.jpg -flag');
        assert.deepEqual(
            attrs.attrsForPath('landscape.jpg'),
            {
                flag: false
            });
    });

    it(`Double quoted pattern`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('"a file.jpg" flag');
        assert.deepEqual(
            attrs.attrsForPath('a file.jpg'),
            {
                flag: true
            });
    });

});

describe('Path matching', async () => {

    it(`Relative file path`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('sample.txt text=auto');
        assert.deepEqual(
            attrs.attrsForPath('./sample.txt'),
            {
                text: 'auto'
            });
    });

    it(`Leading slash not matching subfolder`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('/sample.txt text=auto');
        assert.deepEqual(
            attrs.attrsForPath('path/sample.txt'),
            {});
    });

    it(`Leading slash matching subfolder`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('/sample.txt text=auto');
        assert.deepEqual(
            attrs.attrsForPath('sample.txt'),
            {
                text: 'auto'
            });
    });

    it(`Subfolder matching - single wildcard`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('*/sample.txt text=auto');
        assert.deepEqual(
            attrs.attrsForPath('path/sample.txt'),
            {
                text: 'auto'
            });
    });

    it(`Subfolder not matching - single wildcard`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('*/sample.txt text=auto');
        assert.deepEqual(
            attrs.attrsForPath('path/to/sample.txt'),
            {
                text: 'auto'
            });
    });

    it(`Subfolder not matching - double wildcard`, async () => {
        let attrs = new GitAttributes();
        attrs.parse('**/sample.txt text=auto');
        assert.deepEqual(
            attrs.attrsForPath('path/to/sample.txt'),
            {
                text: 'auto'
            });
    });

});

describe('Read then write', async () => {

    it(`With comments and empty lines`, async () => {
        let input = 'sample.txt\ttext=auto\n\n#this is a comment\n**/sample.txt\tflag=false';
        let output = 'sample.txt\ttext=auto\n\n#this is a comment\n**/sample.txt\tflag=false\n';

        let attrs = new GitAttributes();
        attrs.parse(input, true, true);

        assert.equal(attrs.serialize(), output);
    });

    it(`With comments and without empty lines`, async () => {
        let input = 'sample.txt\ttext=auto\n\n#this is a comment\n**/sample.txt\tflag=false';
        let output = 'sample.txt\ttext=auto\n#this is a comment\n**/sample.txt\tflag=false\n';

        let attrs = new GitAttributes();
        attrs.parse(input, true, false);

        assert.equal(attrs.serialize(), output);
    });

    it(`Without comments and with empty lines`, async () => {
        let input = 'sample.txt\ttext=auto\n\n#this is a comment\n**/sample.txt\tflag=false';
        let output = 'sample.txt\ttext=auto\n\n**/sample.txt\tflag=false\n';

        let attrs = new GitAttributes();
        attrs.parse(input, false, true);

        assert.equal(attrs.serialize(), output);
    });

    it(`Without comments and empty lines`, async () => {
        let input = 'sample.txt\ttext=auto\n\n#this is a comment\n**/sample.txt\tflag=false';
        let output = 'sample.txt\ttext=auto\n**/sample.txt\tflag=false\n';

        let attrs = new GitAttributes();
        attrs.parse(input, false, false);

        assert.equal(attrs.serialize(), output);
    });

    it(`Double quoted pattern`, async () => {
        let input = '"a file.jpg" flag';
        let output = '"a file.jpg"\tflag\n';

        let attrs = new GitAttributes();
        attrs.parse(input);

        assert.equal(attrs.serialize(), output);
    });

});