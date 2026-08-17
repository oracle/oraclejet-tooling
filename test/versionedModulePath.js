/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const util = require('../lib/util');

describe('Versioned Module Path', () => {
  const originalGetNodeModuleVersion = util.getNodeModuleVersion;
  let tempDir;

  afterEach(() => {
    util.getNodeModuleVersion = originalGetNodeModuleVersion;
    if (tempDir) {
      fs.removeSync(tempDir);
      tempDir = null;
    }
  });

  it('should use the installed npm package version in the module path', () => {
    util.getNodeModuleVersion = (packageName) => {
      assert.equal(packageName, 'some-package');
      return '1.99.0';
    };

    assert.equal(
      util.getVersionedModulePath({
        modulePrefix: '@example/some-module',
        packageName: 'some-package'
      }),
      '@example/some-module-1.99.0'
    );
  });

  it('should use a version found in a matching file name', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ojet-versioned-module-'));
    fs.outputFileSync(path.join(tempDir, 'dnd-polyfill-not-a-version.js'), '');
    fs.outputFileSync(path.join(tempDir, 'dnd-polyfill-2.3.4.js'), '');
    fs.outputFileSync(path.join(tempDir, 'dnd-polyfill-2.10.0.js'), '');

    assert.equal(
      util.getVersionedModulePath({
        modulePath: '@oracle/oraclejet/dist/js/libs/dnd-polyfill/dnd-polyfill-#{version}',
        versionFileDirectory: tempDir,
        versionFilePattern: /^dnd-polyfill-([0-9]+(?:\.[0-9]+)+(?:[-+][0-9A-Za-z][0-9A-Za-z.-]*)?)(?:\.min)?\.js$/
      }),
      '@oracle/oraclejet/dist/js/libs/dnd-polyfill/dnd-polyfill-2.10.0'
    );
  });
});
