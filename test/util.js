/**
  Copyright (c) 2015, 2019, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
var env = process.env,
    assert = require('assert'),
    ojet = require('@oracle/oraclejet-tooling'),
    path = require('path');
    const util = require('@oracle/oraclejet-tooling/lib/util');

describe("Util Test", function ()
{
  before(function(){

  });  

  it("templatePath", function(){
    var template = util.templatePath('');
    assert(template === path.resolve("node_modules/@oracle/oraclejet-tooling"));
  });

  it("destPath", function(){
    var template = util.destPath('test1');
    assert(template === path.resolve("test1"));
  });
});

