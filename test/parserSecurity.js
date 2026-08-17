/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('vendored DOM parser security', () => {
  it('should not copy inherited or prototype pollution keys', () => {
    const domPath = path.resolve(__dirname, '../lib/parser/dom.js');
    const domSource = fs.readFileSync(domPath, 'utf8');
    const testModule = { exports: {} };
    const sandbox = {
      console,
      exports: testModule.exports,
      module: testModule
    };

    vm.runInNewContext(
      `${domSource}\nmodule.exports.copyForTest = copy;`,
      sandbox,
      { filename: domPath }
    );

    const source = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"polluted":true},' +
      '"prototype":{"polluted":true},"safe":"value"}'
    );
    Object.setPrototypeOf(source, { inherited: 'unsafe' });
    const destination = {};

    testModule.exports.copyForTest(source, destination);

    assert.deepStrictEqual(destination, { safe: 'value' });
    assert.strictEqual(Object.getPrototypeOf(destination), Object.prototype);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(destination, '__proto__'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(destination, 'constructor'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(destination, 'prototype'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(destination, 'inherited'), false);
    assert.strictEqual({}.polluted, undefined);
  });
});
