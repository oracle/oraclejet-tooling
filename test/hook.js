/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
var assert = require('assert');
var hooks = require('../lib/hookRunner');

const hookList = [
  'after_app_create',
  'after_app_restore',
  'after_build',
  'after_component_build',
  'after_component_create',
  'after_serve',
  'before_build',
  'before_hybrid_build',
  'before_optimize',
  'before_release_build',
  'before_serve'
];

describe("Hooks Test", () => {
  before(() => {
    process.env.NODE_ENV = 'test';
  });  

  hookList.forEach((element) => {
    it(`should have a ${element} hook`, () => {
      hooks(element, {platform: "web", opts: {theme: "alta"}, buildType: "dev"});
      assert(process.env, element);
    });
  });

  it ('should not terminate invalid hooks', () => {
    assert.doesNotThrow(() => {
      hooks('before_build');
    });
  });
});

