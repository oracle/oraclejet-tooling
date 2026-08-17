/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const assert = require('assert');
const path = require('path');

const hookRunner = require('../lib/hookRunner');

describe('Hook path hardening', () => {
  it('should allow hook paths under scripts/hooks', () => {
    assert.strictEqual(
      hookRunner.__resolveHookPath('scripts/hooks/before_build.js'),
      path.resolve('scripts/hooks/before_build.js')
    );
  });

  it('should reject absolute hook paths', () => {
    assert.strictEqual(
      hookRunner.__resolveHookPath(path.resolve('scripts/hooks/before_build.js')),
      undefined
    );
  });

  it('should reject hook paths that traverse outside scripts/hooks', () => {
    assert.strictEqual(
      hookRunner.__resolveHookPath('scripts/hooks/../../outside.js'),
      undefined
    );
    assert.strictEqual(
      hookRunner.__resolveHookPath('../outside.js'),
      undefined
    );
  });

  it('should reject the hooks directory itself as a hook module', () => {
    assert.strictEqual(
      hookRunner.__resolveHookPath('scripts/hooks'),
      undefined
    );
  });

  it('should reject non-string hook paths', () => {
    assert.strictEqual(
      hookRunner.__resolveHookPath({ path: 'scripts/hooks/before_build.js' }),
      undefined
    );
  });
});
