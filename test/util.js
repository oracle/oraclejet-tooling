/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const path = require('path');
const ojetUtil = require('../lib/util');

const util = require('../lib/util');

describe('Util Test', () => {
  it('should have templatePath', () => {
    const template = util.templatePath('');
    assert(template === path.resolve('../oraclejet-tooling'));
  });

  it('should have destPath', () => {
    const template = util.destPath('test1');
    assert(template === path.resolve('test1'));
  });

  describe('Config Test', () => {
    it('should expect false for isCCaSassFile', () => {
      assert(ojetUtil.isCcaSassFile('testApp/staged-themes/alta/web/alta.css') === false);
    });
  
    it('should expect true for isCCaSassFile', () => {
      assert(ojetUtil.isCcaSassFile('jet-composites/mytheme.css') == true);
    });
  });

  describe('collectReturnStatements', () => {
    it('should collect object return with required props', () => {
      const code = `function webpack() { return { context, webpack: config }; }`;
      const returns = util.collectReturnStatements(code);
      const objectReturns = returns.filter(r => r.type === 'object');
      assert.ok(objectReturns.length >= 1);
      const props = objectReturns[0].properties;
      assert.ok(props.includes('context'));
      assert.ok(props.includes('webpack'));
    });

    it('should collect non-object returns (literal)', () => {
      const code = `function webpack() { return 42; }`;
      const returns = util.collectReturnStatements(code);
      const literals = returns.filter(r => r.type === 'number');
      assert.ok(literals.length >= 1);
    });

    it('should collect multiple return paths', () => {
      const code = `function webpack(x){ if(x){ return { context, webpack: config }; } return 0; }`;
      const returns = util.collectReturnStatements(code);
      assert.ok(returns.length >= 2);
    });

    it('should collect concise arrow implicit object returns', () => {
      const code = `const webpack = ({context, config}) => ({ context, webpack: config });`;
      const returns = util.collectReturnStatements(code);
      const objectReturns = returns.filter(r => r.type === 'object');
      assert.ok(objectReturns.length >= 1);
      const props = objectReturns[0].properties;
      assert.ok(props.includes('context'));
      assert.ok(props.includes('webpack'));
    });
  });
});