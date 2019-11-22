/**
  Copyright (c) 2015, 2019, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
var assert = require('assert');
var path = require('path');
var ojetUtil = require('../lib/util');
var _ = require('lodash');

const util = require('../lib/util');

describe("Util Test", () => {
  it("should have templatePath", () => {
    var template = util.templatePath('');
    assert(template === path.resolve("../oraclejet-tooling"));
  });

  it("should have destPath", () => {
    var template = util.destPath('test1');
    assert(template === path.resolve("test1"));
  });

  describe("Config Test", () => {
    it("should expect false for isCCaSassFile", () => {
      assert(ojetUtil.isCcaSassFile('testApp/staged-themes/alta/web/alta.css') === false);
    });
  
    it("should expect true for isCCaSassFile", () => {
      assert(ojetUtil.isCcaSassFile('jet-composites/mytheme.css') == true);
    });
  });
});