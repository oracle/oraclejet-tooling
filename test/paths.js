/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
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
    _ = require('lodash');
    const npmCopy = require('@oracle/oraclejet-tooling/lib/npmCopy');

describe("Paths Mapping Test", function ()
{
  before(function(){

  });  

  it("Single Path Mapping Not Empty -- Dev", function(){
    const mapping = npmCopy.getMappingLibsList('dev', 'web');
    assert(_.isEmpty(mapping) === false);
  });

  it("Single Path Mapping Not Empty -- Release", function(){
    const mapping = npmCopy.getMappingLibsList('release', 'web');
    assert(_.isEmpty(mapping) === false);
  });
});

