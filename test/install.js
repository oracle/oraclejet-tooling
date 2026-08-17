/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const assert = require('assert');
const path = require('path');

const addjsdoc = require('../lib/addjsdoc');
const addtesting = require('../lib/addtesting');
const addtypescript = require('../lib/addtypescript');
const addwebpack = require('../lib/addwebpack');
const componentSecurity = require('../lib/scopes/componentSecurity');
const config = require('../lib/config');
const constants = require('../lib/constants');
const util = require('../lib/util');

describe('Install flow safety', () => {
  const original = {};

  beforeEach(() => {
    original.exec = util.exec;
    original.logError = util.log.error;
    original.spawn = util.spawn;
    original.getInstallerCommand = util.getInstallerCommand;
    original.getOraclejetConfigJson = util.getOraclejetConfigJson;
    original.getToolingPath = util.getToolingPath;
    original.injectFileIntoApplication = util.injectFileIntoApplication;
    original.isVDOMApplication = util.isVDOMApplication;
    original.loadOraclejetConfig = config.loadOraclejetConfig;
    original.configData = { ...config.data };
  });

  afterEach(() => {
    util.exec = original.exec;
    util.log.error = original.logError;
    util.spawn = original.spawn;
    util.getInstallerCommand = original.getInstallerCommand;
    util.getOraclejetConfigJson = original.getOraclejetConfigJson;
    util.getToolingPath = original.getToolingPath;
    util.injectFileIntoApplication = original.injectFileIntoApplication;
    util.isVDOMApplication = original.isVDOMApplication;
    config.loadOraclejetConfig = original.loadOraclejetConfig;
    config.data = { ...original.configData };
  });

  function stubInstallerEnvironment() {
    util.exec = () => {
      throw new Error('Install flow should not call util.exec');
    };
    util.log.error = (message) => {
      throw new Error(String(message));
    };
    util.getInstallerCommand = () => ({
      installer: 'npm',
      verbs: { install: 'install' },
      flags: {
        save: '--save-dev',
        exact: '--save-exact',
        legacy: '--legacy-peer-deps'
      }
    });
    util.getOraclejetConfigJson = () => ({ enableLegacyPeerDeps: false });
    util.getToolingPath = () => '.';
    config.loadOraclejetConfig = () => {};
  }

  it('should reject malicious typescriptLibraries before spawning', async () => {
    let spawned = false;

    stubInstallerEnvironment();
    config.data.typescriptLibraries = 'typescript@5.8.3 && touch /tmp/pwned';
    util.spawn = () => {
      spawned = true;
      return Promise.resolve();
    };

    await assert.rejects(
      () => addtypescript({ template: 'webdriver-ts' }),
      /Invalid dependency spec '&&' found in oraclejetconfig\.json\./
    );
    assert.equal(spawned, false);
  });

  it('should reject malicious mochaTestingLibraries before spawning', async () => {
    let spawned = false;

    stubInstallerEnvironment();
    config.data.mochaTestingLibraries = 'karma && touch /tmp/pwned';
    util.isVDOMApplication = () => false;
    util.spawn = () => {
      spawned = true;
      return Promise.resolve();
    };

    await assert.rejects(
      () => addtesting({}),
      /Invalid dependency spec '&&' found in oraclejetconfig\.json\./
    );
    assert.equal(spawned, false);
  });

  it('should reject malicious webpackLibraries before spawning', async () => {
    let spawned = false;

    stubInstallerEnvironment();
    config.data.webpackLibraries = 'webpack@5.101.0 && touch /tmp/pwned';
    util.spawn = () => {
      spawned = true;
      return Promise.resolve();
    };
    util.injectFileIntoApplication = () => Promise.resolve();

    await assert.rejects(
      () => addwebpack({}),
      /Invalid dependency spec '&&' found in oraclejetconfig\.json\./
    );
    assert.equal(spawned, false);
  });

  it('should reject a webpack installer failure after logging it', async () => {
    const installError = new Error('Webpack dependency installation failed');
    const loggedErrors = [];

    stubInstallerEnvironment();
    config.data.webpackLibraries = 'webpack@5.101.0';
    util.log.error = error => loggedErrors.push(error);
    util.spawn = () => Promise.reject(installError);

    await assert.rejects(
      () => addwebpack({}),
      error => error === installError
    );
    assert.deepStrictEqual(loggedErrors, [installError]);
  });

  it('should pin Webpack to the webpack-dev-server peer-compatible version', async () => {
    let captured;

    stubInstallerEnvironment();
    config.data.webpackLibraries = constants.WEBPACK_LIBRARIES;
    util.spawn = (command, args) => {
      captured = { command, args };
      return Promise.resolve();
    };
    util.injectFileIntoApplication = () => Promise.resolve();

    await addwebpack({});

    assert.equal(captured.command, 'npm');
    assert.ok(captured.args.includes('webpack@5.101.0'));
    assert.ok(captured.args.includes('webpack-dev-server'));
    assert.ok(!captured.args.includes('webpack-dev-server@4.15.2'));
  });

  it('should reject malicious jsdocLibraries before spawning', async () => {
    let spawned = false;

    stubInstallerEnvironment();
    config.data.jsdocLibraries = 'jsdoc@3.5.5 && touch /tmp/pwned';
    util.spawn = () => {
      spawned = true;
      return Promise.resolve();
    };

    await assert.rejects(
      () => addjsdoc({}),
      /Invalid dependency spec '&&' found in oraclejetconfig\.json\./
    );
    assert.equal(spawned, false);
  });

  it('should append legacy peer deps as a separate arg', async () => {
    let captured;

    stubInstallerEnvironment();
    config.data.typescriptLibraries = 'typescript@5.8.3';
    util.getOraclejetConfigJson = () => ({ enableLegacyPeerDeps: true });
    util.spawn = (command, args) => {
      captured = { command, args };
      return Promise.resolve();
    };

    await addtypescript({ template: 'webdriver-ts' });

    assert.deepStrictEqual(captured.args, [
      'install',
      'typescript@5.8.3',
      '--save-dev',
      '--save-exact',
      '--legacy-peer-deps'
    ]);
  });

  describe('Exchange component install safety', () => {
    it('should reject traversal component names before resolving install paths', () => {
      assert.throws(
        () => componentSecurity.assertSafeExchangeComponentName('../../src', 'component name'),
        /unsafe component name/
      );
    });

    it('should reject paths that escape the component install root', () => {
      assert.throws(
        () => componentSecurity.resolvePathInside('jet_components', '../src'),
        /outside/
      );
    });

    it('should resolve safe pack component install paths inside the configured root', () => {
      const resolvedPath = componentSecurity.resolvePathInside(
        'jet_components',
        'oj-pack',
        'oj-child'
      );

      assert.equal(
        resolvedPath,
        path.resolve('jet_components', 'oj-pack', 'oj-child')
      );
    });

    it('should reject prototype pollution keys when merging config changes', () => {
      const payload = JSON.parse(
        '{"__proto__":{"version":"polluted","components":{"isAdmin":true}}}'
      );

      assert.throws(
        () => componentSecurity.mergeChanges({}, payload),
        /unsafe component name/
      );
      assert.equal(Object.prototype.version, undefined);
      assert.equal(Object.prototype.components, undefined);
    });

    it('should reject prototype pollution keys inside pack component changes', () => {
      const payload = JSON.parse(
        '{"oj-pack":{"version":"1.0.0","components":{"__proto__":"1.0.0"}}}'
      );

      assert.throws(
        () => componentSecurity.mergeChanges({}, payload),
        /unsafe component name/
      );
    });

    it('should reject unsafe component versions when merging config changes', () => {
      assert.throws(
        () => componentSecurity.mergeChanges({}, { 'oj-button': '../evil' }),
        /unsafe version/
      );
    });

    it('should allow safe semver range component versions from Exchange', () => {
      assert.deepStrictEqual(
        componentSecurity.mergeChanges({}, { 'oj-sp-ref-maplibre-gl': '^5.0.0' }),
        { 'oj-sp-ref-maplibre-gl': '^5.0.0' }
      );
    });

    it('should allow config pack changes without a pack version', () => {
      assert.deepStrictEqual(
        componentSecurity.mergeChanges({}, {
          'oj-dynamic': {
            version: null,
            components: {
              form: '^2610.0.5'
            }
          }
        }),
        {
          'oj-dynamic': {
            components: {
              form: '^2610.0.5'
            }
          }
        }
      );
    });

    it('should validate the whole Exchange solution before project changes are applied', () => {
      const solution = {
        environmentChanges: {
          remove: {
            'oj-old': '1.0.0'
          },
          add: {
            'oj-button': '1.0.0/../../evil'
          }
        },
        configChanges: {}
      };

      assert.throws(
        () => componentSecurity.validateExchangeSolution(solution),
        /unsafe version/
      );
    });

    it('should reject non-plain exchange objects', () => {
      assert.equal(componentSecurity.isPlainExchangeObject(() => {}), false);
      assert.equal(componentSecurity.isPlainExchangeObject(new Date()), false);
      assert.equal(componentSecurity.isPlainExchangeObject(Object.create(null)), true);
    });

    it('should merge safe pack config changes', () => {
      assert.deepStrictEqual(
        componentSecurity.mergeChanges({}, {
          'oj-pack': {
            version: '1.0.0',
            components: {
              'oj-child': '1.0.0'
            }
          }
        }),
        {
          'oj-pack': {
            version: '1.0.0',
            components: {
              'oj-child': '1.0.0'
            }
          }
        }
      );
    });
  });
});
