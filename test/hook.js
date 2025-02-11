/**
  Copyright (c) 2015, 2025, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const hooks = require('../lib/hookRunner');

const hookList = [
  'after_app_create',
  'after_app_restore',
  'after_app_typescript',
  'after_build',
  'after_component_build',
  'after_component_create',
  'after_component_package',
  'after_component_typescript',
  'after_serve',
  'after_watch',
  'before_app_typescript',
  'before_build',
  'before_component_typescript',
  'before_injection',
  'before_component_optimize',
  'before_component_package',
  'before_optimize',
  'before_release',
  'before_release_build',
  'before_serve',
  'before_watch',
  'before_webpack'
];


describe('Hooks Test', () => {
  before(() => {
    process.env.NODE_ENV = 'test';
  });

  hookList.forEach((element) => {
    it(`should have a ${element} hook`, () => {
      hooks(element, {platform: 'web', opts: {theme: 'alta'}, buildType: 'dev'});
      assert(process.env, element);
    });
  });

  it('should not terminate invalid hooks', () => {
    assert.doesNotThrow(() => {
      hooks('before_build');
    });
  });
});

