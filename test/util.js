/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
var env = process.env,
    assert = require('assert'),
    ojet = require('../oraclejet-tooling'),
    path = require('path');

describe("Util Test", function ()
{
  before(function(){

  });  

  it("templatePath", function(){
    var template = ojet.util.templatePath('test');
    assert(template === path.resolve(""));
  });

  it("destPath", function(){
    var template = ojet.util.destPath('test1');
    assert(template === path.resolve("test1"));
  });
});

