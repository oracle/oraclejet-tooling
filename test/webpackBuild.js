/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const assert = require('assert');
const path = require('path');

const webpackBuild = require('../lib/webpack/build');

function _createDependencies(overrides = {}) {
  const context = { name: 'configured-context' };
  const stats = {
    compilation: { errors: [] },
    toString: () => 'webpack stats'
  };
  const dependencies = {
    ojetUtils: {
      log: () => {},
      isTypescriptApplication: () => false
    },
    setup: buildContext => ({
      context: buildContext,
      webpack: (config, callback) => callback(null, stats),
      webpackConfig: {}
    }),
    hookRunner: (hookName, buildContext) => Promise.resolve(buildContext),
    webpackUtils: {
      createContext: () => context,
      organizeTypeDefinitions: () => {}
    },
    buildCommon: {
      buildICUTranslationsBundle: () => Promise.resolve()
    },
    fileSystem: {
      remove: () => Promise.resolve()
    }
  };

  return Object.assign(dependencies, overrides);
}

describe('Webpack build lifecycle', () => {
  it('should run build steps in deterministic order', async () => {
    const calls = [];
    const initialContext = { name: 'initial-context' };
    const hookedContext = { name: 'hooked-context' };
    const outputPath = path.resolve('test-output');
    const configuredContext = {
      name: 'configured-context',
      opts: { stagingPath: outputPath }
    };
    const webpackConfig = {
      mode: 'development',
      output: { clean: true, path: outputPath }
    };
    const dependencies = _createDependencies({
      ojetUtils: {
        log: message => calls.push(`log:${message}`),
        isTypescriptApplication: () => {
          calls.push('is-typescript');
          return true;
        }
      },
      webpackUtils: {
        createContext: () => {
          calls.push('create-context');
          return initialContext;
        },
        organizeTypeDefinitions: () => calls.push('organize-types')
      },
      fileSystem: {
        remove: (targetPath) => {
          calls.push('clean-types:start');
          assert.strictEqual(targetPath, path.join(outputPath, 'types'));
          return Promise.resolve().then(() => calls.push('clean-types:end'));
        }
      },
      hookRunner: (hookName, context) => {
        calls.push(`${hookName}:start`);
        return Promise.resolve().then(() => {
          calls.push(`${hookName}:end`);
          if (hookName === 'before_build') {
            assert.strictEqual(context, initialContext);
            return hookedContext;
          }
          assert.strictEqual(context, configuredContext);
          return context;
        });
      },
      setup: (context) => {
        calls.push('setup');
        assert.strictEqual(context, hookedContext);
        return {
          context: configuredContext,
          webpackConfig,
          webpack: (config, callback) => {
            calls.push('webpack:start');
            assert.strictEqual(config, webpackConfig);
            process.nextTick(() => {
              calls.push('webpack:end');
              callback(null, {
                compilation: { errors: [] },
                toString: () => {
                  calls.push('webpack-stats');
                  return 'webpack stats';
                }
              });
            });
          }
        };
      },
      buildCommon: {
        buildICUTranslationsBundle: (context) => {
          calls.push('icu:start');
          assert.strictEqual(context, configuredContext);
          return Promise.resolve().then(() => calls.push('icu:end'));
        }
      }
    });

    await webpackBuild.__runBuild({ release: false }, dependencies);

    assert.deepStrictEqual(calls, [
      'log:Building with Webpack',
      'create-context',
      'before_build:start',
      'before_build:end',
      'setup',
      'is-typescript',
      'icu:start',
      'icu:end',
      'clean-types:start',
      'clean-types:end',
      'webpack:start',
      'webpack:end',
      'webpack-stats',
      'after_build:start',
      'after_build:end',
      'organize-types'
    ]);
  });

  it('should stop before Webpack when type-definition cleanup fails', async () => {
    const cleanupError = new Error('type-definition cleanup failed');
    let webpackCalled = false;
    let afterBuildCalled = false;
    let organizeTypesCalled = false;
    const outputPath = path.resolve('test-output');
    const configuredContext = { opts: { stagingPath: outputPath } };
    const dependencies = _createDependencies({
      ojetUtils: {
        log: () => {},
        isTypescriptApplication: () => true
      },
      setup: () => ({
        context: configuredContext,
        webpackConfig: {
          output: { clean: true, path: outputPath }
        },
        webpack: () => {
          webpackCalled = true;
        }
      }),
      hookRunner: (hookName, context) => {
        if (hookName === 'after_build') {
          afterBuildCalled = true;
        }
        return Promise.resolve(context);
      },
      webpackUtils: {
        createContext: () => ({}),
        organizeTypeDefinitions: () => {
          organizeTypesCalled = true;
        }
      },
      fileSystem: {
        remove: (targetPath) => {
          assert.strictEqual(targetPath, path.join(outputPath, 'types'));
          return Promise.reject(cleanupError);
        }
      }
    });

    await assert.rejects(
      () => webpackBuild.__runBuild({}, dependencies),
      error => error === cleanupError
    );
    assert.strictEqual(webpackCalled, false);
    assert.strictEqual(afterBuildCalled, false);
    assert.strictEqual(organizeTypesCalled, false);
  });

  it('should preserve custom Webpack output-clean semantics', async () => {
    const stagingPath = path.resolve('test-output');
    const cleanConfigurations = [
      { path: stagingPath, clean: false },
      { path: stagingPath },
      { path: stagingPath, clean: { keep: /types/ } },
      { path: path.resolve('custom-output'), clean: true }
    ];

    const builds = cleanConfigurations.map((output) => {
      let cleanupCalled = false;
      const dependencies = _createDependencies({
        ojetUtils: {
          log: () => {},
          isTypescriptApplication: () => true
        },
        setup: () => ({
          context: { opts: { stagingPath } },
          webpackConfig: { output },
          webpack: (config, callback) => callback(null, {
            compilation: { errors: [] },
            toString: () => 'webpack stats'
          })
        }),
        webpackUtils: {
          createContext: () => ({}),
          organizeTypeDefinitions: () => {}
        },
        fileSystem: {
          remove: () => {
            cleanupCalled = true;
            return Promise.resolve();
          }
        }
      });

      return webpackBuild.__runBuild({}, dependencies).then(() => {
        assert.strictEqual(cleanupCalled, false);
      });
    });

    await Promise.all(builds);
  });

  it('should preserve fatal Webpack errors without inspecting stats', async () => {
    const fatalError = new Error('fatal Webpack error');
    fatalError.details = 'fatal error details';
    let statsInspected = false;
    let afterBuildCalled = false;
    let organizeTypesCalled = false;
    const dependencies = _createDependencies({
      setup: context => ({
        context,
        webpackConfig: {},
        webpack: (config, callback) => callback(fatalError, {
          get compilation() {
            statsInspected = true;
            throw new Error('stats should not be inspected after a fatal error');
          }
        })
      }),
      hookRunner: (hookName, context) => {
        if (hookName === 'after_build') {
          afterBuildCalled = true;
        }
        return Promise.resolve(context);
      },
      webpackUtils: {
        createContext: () => ({}),
        organizeTypeDefinitions: () => {
          organizeTypesCalled = true;
        }
      }
    });

    await assert.rejects(
      () => webpackBuild.__runBuild({}, dependencies),
      error => error === fatalError
    );
    assert.strictEqual(statsInspected, false);
    assert.strictEqual(afterBuildCalled, false);
    assert.strictEqual(organizeTypesCalled, false);
  });

  it('should reject a Webpack callback that omits stats', async () => {
    let afterBuildCalled = false;
    const dependencies = _createDependencies({
      setup: context => ({
        context,
        webpackConfig: {},
        webpack: (config, callback) => callback(null)
      }),
      hookRunner: (hookName, context) => {
        if (hookName === 'after_build') {
          afterBuildCalled = true;
        }
        return Promise.resolve(context);
      }
    });

    await assert.rejects(
      () => webpackBuild.__runBuild({}, dependencies),
      /Webpack compilation did not return build statistics/
    );
    assert.strictEqual(afterBuildCalled, false);
  });

  it('should stop after Webpack compilation errors', async () => {
    const compilationErrors = [new Error('compilation failed')];
    let statsStringCalled = false;
    let afterBuildCalled = false;
    const dependencies = _createDependencies({
      setup: context => ({
        context,
        webpackConfig: {},
        webpack: (config, callback) => callback(null, {
          compilation: { errors: compilationErrors },
          toString: () => {
            statsStringCalled = true;
            return 'unexpected stats';
          }
        })
      }),
      hookRunner: (hookName, context) => {
        if (hookName === 'after_build') {
          afterBuildCalled = true;
        }
        return Promise.resolve(context);
      }
    });

    await assert.rejects(
      () => webpackBuild.__runBuild({}, dependencies),
      errors => errors === compilationErrors
    );
    assert.strictEqual(statsStringCalled, false);
    assert.strictEqual(afterBuildCalled, false);
  });

  it('should reject exceptions thrown while processing asynchronous Webpack stats', async () => {
    const statsError = new Error('stats formatting failed');
    let afterBuildCalled = false;
    const dependencies = _createDependencies({
      setup: context => ({
        context,
        webpackConfig: {},
        webpack: (config, callback) => {
          process.nextTick(() => callback(null, {
            compilation: { errors: [] },
            toString: () => {
              throw statsError;
            }
          }));
        }
      }),
      hookRunner: (hookName, context) => {
        if (hookName === 'after_build') {
          afterBuildCalled = true;
        }
        return Promise.resolve(context);
      }
    });

    await assert.rejects(
      () => webpackBuild.__runBuild({}, dependencies),
      error => error === statsError
    );
    assert.strictEqual(afterBuildCalled, false);
  });
});
