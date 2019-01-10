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
    const hooks = require('@oracle/oraclejet-tooling/lib/hookRunner');

describe("Hooks Test", function ()
{
  before(function(){
    process.env.NODE_ENV = 'test';
  });  

  it("before_build hook", function(){
    hooks('before_build', {platform: "web", opts: {theme: "alta"}, buildType: "dev"});
    assert(process.env, "before_build");
  });

  it("after_component_build hook", function(){
    hooks('after_component_build', {platform: "web", opts: {theme: "alta"}, buildType: "dev"});
    assert(process.env, "after_component_build");
  });

  it("after_build hook", function(){
    hooks('after_build', {platform: "web", opts: {theme: "alta"}, buildType: "dev"});
    assert(process.env, "after_build");
  });

  it("before_hybrid_build hook", function(){
    hooks('before_hybrid_build', {platform: "web", opts: {theme: "alta"}, buildType: "dev"});
    assert(process.env, "before_hybrid_build");
  });
  
  it("before_release_build hook", function(){
    hooks('before_release_build', {platform: "web", opts: {theme: "alta"}, buildType: "dev"});
    assert(process.env, "before_release_build");
  });
  
  it("before_serve hook", function(){
    hooks('before_serve', {platform: "web", opts: {theme: "alta"}, buildType: "dev"});
    assert(process.env, "before_serve");
  });
  
  it("after_serve hook", function(){
    hooks('after_serve', {platform: "web", opts: {theme: "alta"}, buildType: "dev"});
    assert(process.env, "after_serve");
  });

  it ('invalid hooks does not terminate', () =>
  {
    assert.doesNotThrow(() =>
    {
      hooks('bxefore_build');
    });
  });
});

