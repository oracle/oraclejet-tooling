/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const fs = require('fs');
const { createRequire } = require('module');
const path = require('path');
const vm = require('vm');

const componentPath = path.resolve(__dirname, '../lib/scopes/component.js');
const componentSource = fs.readFileSync(componentPath, 'utf8');
const componentRequire = createRequire(componentPath);

function getUnpackArchiveForTest(componentArchive, util) {
  const testModule = { exports: {} };
  const componentSecurity = {
    assertSafeExchangeComponentName() {},
    resolvePathInside(...pathSegments) {
      return path.resolve(...pathSegments);
    }
  };
  const dependencies = {
    'fs-extra': {},
    path,
    readline: {},
    archiver: {},
    glob: {},
    '../build': {},
    '../constants': { PACK_TYPE: { MONO_PACK: 'mono-pack' } },
    '../utils.exchange': {},
    './componentArchive': componentArchive,
    './componentSecurity': componentSecurity,
    './pack': {},
    '../util': util,
    '../hookRunner': {}
  };
  const sandbox = {
    Buffer,
    console,
    exports: testModule.exports,
    module: testModule,
    require: dependency => dependencies[dependency] || componentRequire(dependency),
    setTimeout,
    __dirname: path.dirname(componentPath),
    __filename: componentPath
  };

  vm.runInNewContext(
    `${componentSource}\nmodule.exports.unpackArchiveForTest = _unpackArchive;`,
    sandbox,
    { filename: componentPath }
  );
  return testModule.exports.unpackArchiveForTest;
}

describe('Exchange component archive unpacking', () => {
  const componentMetadata = {
    fullName: 'demo-card',
    name: 'demo-card',
    type: 'component',
    version: '1.0.0'
  };

  function createUtil(deleteFileSync, log) {
    return {
      deleteFileSync,
      getConfiguredPaths: () => ({ exchangeComponents: '/components' }),
      log
    };
  }

  it('waits for asynchronous installation before logging success or deleting the archive', async () => {
    let installationCompleted = false;
    let deletedAfterInstallation = false;
    const logs = [];
    const componentArchive = {
      installArchive: () => new Promise((resolve) => {
        setTimeout(() => {
          installationCompleted = true;
          resolve();
        }, 10);
      })
    };
    const unpackArchive = getUnpackArchiveForTest(
      componentArchive,
      createUtil(
        () => { deletedAfterInstallation = installationCompleted; },
        message => logs.push(message)
      )
    );

    const result = await unpackArchive(componentMetadata);

    assert.strictEqual(result, componentMetadata);
    assert.equal(installationCompleted, true);
    assert.equal(deletedAfterInstallation, true);
    assert.ok(logs.includes("Component 'demo-card@1.0.0' archive was successfully unpacked and installed."));
  });

  it('propagates asynchronous installation failures after deleting the archive', async () => {
    let archiveDeleted = false;
    const logs = [];
    const componentArchive = {
      installArchive: () => Promise.reject(new Error('Blocked Exchange archive'))
    };
    const unpackArchive = getUnpackArchiveForTest(
      componentArchive,
      createUtil(
        () => { archiveDeleted = true; },
        message => logs.push(message)
      )
    );

    await assert.rejects(
      () => unpackArchive(componentMetadata),
      /Blocked Exchange archive/
    );

    assert.equal(archiveDeleted, true);
    assert.equal(logs.includes("Component 'demo-card@1.0.0' archive was successfully unpacked and installed."), false);
  });
});
