/**
  Copyright (c) 2015, 2024, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const path = require('path');
const ojetUtil = require('../lib/util');
const _ = require('lodash');

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
});