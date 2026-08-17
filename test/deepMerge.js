/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const util = require('../lib/util');

describe('deepMerge', () => {
  afterEach(() => {
    delete Object.prototype.polluted;
  });

  it('should merge safe object keys', () => {
    const result = util.deepMerge(
      { compilerOptions: { module: 'commonjs' }, include: ['src'] },
      { compilerOptions: { target: 'es2020' }, include: ['test'] }
    );

    assert.deepStrictEqual(result, {
      compilerOptions: {
        module: 'commonjs',
        target: 'es2020'
      },
      include: ['src', 'test']
    });
  });

  it('should ignore root prototype pollution keys', () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true},"safe":true}');
    const result = util.deepMerge({}, payload);

    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.polluted, undefined);
    assert.strictEqual(Object.getPrototypeOf(result).polluted, undefined);
    assert.strictEqual({}.polluted, undefined);
  });

  it('should ignore nested prototype pollution keys', () => {
    const payload = JSON.parse('{"nested":{"__proto__":{"polluted":true},"safe":true}}');
    const result = util.deepMerge({}, payload);

    assert.strictEqual(result.nested.safe, true);
    assert.strictEqual(result.nested.polluted, undefined);
    assert.strictEqual(Object.getPrototypeOf(result.nested).polluted, undefined);
    assert.strictEqual({}.polluted, undefined);
  });

  it('should ignore nested constructor prototype pollution paths', () => {
    const payload = JSON.parse(
      '{"nested":{"constructor":{"prototype":{"polluted":true}},"safe":true}}'
    );
    const result = util.deepMerge({}, payload);

    assert.strictEqual(result.nested.safe, true);
    assert.strictEqual(result.nested.constructor, Object.prototype.constructor);
    assert.strictEqual({}.polluted, undefined);
  });

  it('should ignore prototype pollution keys inside arrays', () => {
    const payload = JSON.parse('{"items":[{"__proto__":{"polluted":true},"safe":true}]}');
    const result = util.deepMerge({ items: [] }, payload);

    assert.strictEqual(result.items[0].safe, true);
    assert.strictEqual(result.items[0].polluted, undefined);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.items[0], '__proto__'), false);
    assert.strictEqual(Object.getPrototypeOf(result.items[0]).polluted, undefined);
    assert.strictEqual({}.polluted, undefined);
  });

  it('should ignore constructor prototype pollution paths inside arrays', () => {
    const payload = JSON.parse(
      '{"items":[{"constructor":{"prototype":{"polluted":true}},"safe":true}]}'
    );
    const result = util.deepMerge({ items: [] }, payload);

    assert.strictEqual(result.items[0].safe, true);
    assert.strictEqual(result.items[0].constructor, Object.prototype.constructor);
    assert.strictEqual({}.polluted, undefined);
  });

  it('should ignore constructor prototype pollution paths', () => {
    const payload = JSON.parse('{"constructor":{"prototype":{"polluted":true}},"safe":true}');
    const result = util.deepMerge({}, payload);

    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.constructor, Object.prototype.constructor);
    assert.strictEqual({}.polluted, undefined);
  });

  it('should preserve functions and non-plain objects', () => {
    const onComplete = () => {};
    const modified = new Date('2026-05-21T00:00:00.000Z');
    const result = util.deepMerge(
      { options: { open: true } },
      { options: { onComplete, modified } }
    );

    assert.strictEqual(result.options.onComplete, onComplete);
    assert.strictEqual(result.options.modified, modified);
  });

  it('should merge cyclic objects without overflowing the stack', () => {
    const obj1 = { name: 'default' };
    const obj2 = { enabled: true };
    obj1.self = obj1;
    obj2.self = obj2;

    const result = util.deepMerge(obj1, obj2);

    assert.strictEqual(result.name, 'default');
    assert.strictEqual(result.enabled, true);
    assert.strictEqual(result.self, result);
  });
});

describe('mergeDefaultOptions', () => {
  afterEach(() => {
    delete Object.prototype.polluted;
  });

  it('should ignore prototype pollution keys', () => {
    const defaultConfig = JSON.parse('{"nested":{"safeDefault":true}}');
    const options = JSON.parse(
      '{"__proto__":{"polluted":true},"nested":{"__proto__":{"polluted":true},"safeOption":true}}'
    );
    const result = util.mergeDefaultOptions(options, defaultConfig);

    assert.strictEqual(result.nested.safeDefault, true);
    assert.strictEqual(result.nested.safeOption, true);
    assert.strictEqual(result.polluted, undefined);
    assert.strictEqual(result.nested.polluted, undefined);
    assert.strictEqual({}.polluted, undefined);
  });

  it('should ignore constructor prototype pollution paths', () => {
    const options = JSON.parse('{"constructor":{"prototype":{"polluted":true}},"safe":true}');
    const result = util.mergeDefaultOptions(options, {});

    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.constructor, Object.prototype.constructor);
    assert.strictEqual({}.polluted, undefined);
  });

  it('should ignore nested constructor prototype pollution paths', () => {
    const options = JSON.parse(
      '{"nested":{"constructor":{"prototype":{"polluted":true}},"safe":true}}'
    );
    const result = util.mergeDefaultOptions(options, {});

    assert.strictEqual(result.nested.safe, true);
    assert.strictEqual(result.nested.constructor, Object.prototype.constructor);
    assert.strictEqual({}.polluted, undefined);
  });

  it('should preserve fileList and files array override behavior', () => {
    const result = util.mergeDefaultOptions(
      {
        fileList: [{ src: 'src/js/**/*.js' }],
        files: ['src/index.html']
      },
      {
        fileList: [{ src: 'src/css/**/*.css' }],
        files: ['src/old.html']
      }
    );

    assert.deepStrictEqual(result.fileList, [{ src: 'src/js/**/*.js' }]);
    assert.deepStrictEqual(result.files, ['src/index.html']);
  });

  it('should preserve functions and non-plain objects', () => {
    const onComplete = () => {};
    const modified = new Date('2026-05-21T00:00:00.000Z');
    const result = util.mergeDefaultOptions(
      { options: { onComplete, modified } },
      { options: { open: true } }
    );

    assert.strictEqual(result.options.open, true);
    assert.strictEqual(result.options.onComplete, onComplete);
    assert.strictEqual(result.options.modified, modified);
  });

  it('should merge cyclic options without overflowing the stack', () => {
    const options = { safe: true };
    options.self = options;

    const result = util.mergeDefaultOptions(options, { defaultSafe: true });

    assert.strictEqual(result.defaultSafe, true);
    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.self.safe, true);
  });

  it('should handle cyclic serve-shaped options', () => {
    const options = {
      build: true,
      buildOptions: {},
      connect: {
        options: {
          port: 8000
        }
      }
    };
    options.buildOptions = options;

    const result = util.mergeDefaultOptions(options, {
      build: false,
      connect: {
        options: {
          hostname: '127.0.0.1',
          open: true
        }
      }
    });

    assert.strictEqual(result.build, true);
    assert.strictEqual(result.connect.options.port, 8000);
    assert.strictEqual(result.connect.options.hostname, '127.0.0.1');
    assert.strictEqual(result.buildOptions.build, true);
  });
});
