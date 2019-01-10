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
    _ = require('lodash');

describe("Config Test", function ()
{
  before(function(){

  });  

  it("Init empty config", function(){
    ojet.config();
    assert(_.isEmpty(ojet.config()));
  });

  it("Init non-empty config", function(){
    ojet.config("name", "test1");
    assert(ojet.config("name") === "test1");
  });

  it("Get config", function(){
    assert(ojet.config("name"), "test1");
  });

  it("Get entire config", function(){
    assert(ojet.config(), {"name":"test1"});
  });

  it("Set config", function(){
    ojet.config("value", "123");
    assert(ojet.config("value"), "123");
  });

  it("Overwrite config", function(){
    ojet.config("value", "1234");
    assert(ojet.config("value"), "1234");
  });

});

