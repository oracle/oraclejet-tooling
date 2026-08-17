/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const assert = require('assert');

const serveWeb = require('../lib/serveWeb');

describe('Serve web lifecycle', () => {
  it('should wait for CSP, connect, and watch startup before running after_serve', async () => {
    const csp = _deferred();
    const cspStarted = _deferred();
    const connect = _deferred();
    const connectStarted = _deferred();
    const watch = _deferred();
    const watchStarted = _deferred();
    const calls = [];
    let contextPassedToServices;
    let contextPassedToAfterServe;

    const lifecycle = serveWeb.__runServeLifecycle(
      () => {
        calls.push('build');
        return Promise.resolve({ fromBuild: true });
      },
      _getDependencies({
        hookRunner(type, context) {
          calls.push(type);
          if (type === 'before_serve') {
            return Promise.resolve(Object.assign({}, context, { fromBeforeServe: true }));
          }
          contextPassedToAfterServe = context;
          return Promise.resolve(context);
        },
        updateCspRuleForLivereload() {
          calls.push('csp');
          cspStarted.resolve();
          return csp.promise;
        },
        serveConnect(connectOpts, context) {
          calls.push('connect');
          contextPassedToServices = context;
          assert.strictEqual(connectOpts.port, 8000);
          connectStarted.resolve();
          return connect.promise;
        },
        serveWatch(watchOpts, livereloadPort, context) {
          calls.push('watch');
          assert.deepStrictEqual(watchOpts, { source: { files: [] } });
          assert.strictEqual(livereloadPort, 35729);
          assert.strictEqual(context, contextPassedToServices);
          watchStarted.resolve();
          return watch.promise;
        }
      })
    );

    await cspStarted.promise;
    assert.deepStrictEqual(calls, ['build', 'before_serve', 'csp']);

    csp.resolve();
    await Promise.all([connectStarted.promise, watchStarted.promise]);
    assert.deepStrictEqual(calls, ['build', 'before_serve', 'csp', 'connect', 'watch']);

    connect.resolve();
    await Promise.resolve();
    assert.strictEqual(calls.includes('after_serve'), false);

    watch.resolve();
    await lifecycle;
    assert.strictEqual(calls[calls.length - 1], 'after_serve');
    assert.strictEqual(contextPassedToServices.fromBeforeServe, true);
    assert.strictEqual(contextPassedToAfterServe, contextPassedToServices);
  });

  it('should reject startup and skip after_serve when a service fails', async () => {
    const startupError = new Error('connect startup failed');
    const calls = [];

    const lifecycle = serveWeb.__runServeLifecycle(
      () => Promise.resolve({}),
      _getDependencies({
        hookRunner(type, context) {
          calls.push(type);
          return Promise.resolve(context);
        },
        serveConnect() {
          calls.push('connect');
          return Promise.reject(startupError);
        },
        serveWatch() {
          calls.push('watch');
          return Promise.resolve();
        }
      })
    );

    await assert.rejects(lifecycle, error => error === startupError);
    assert.deepStrictEqual(calls, ['before_serve', 'connect', 'watch']);
    assert.strictEqual(calls.includes('after_serve'), false);
  });
});

function _getDependencies(overrides) {
  const serveConfig = {
    connect: {
      options: {
        hostname: '127.0.0.1',
        port: 8000
      }
    },
    livereloadPort: 35729,
    watch: {
      source: { files: [] }
    }
  };

  return Object.assign({
    getServeConfig: () => serveConfig,
    hookRunner: (type, context) => Promise.resolve(context),
    serveConnect: () => Promise.resolve(),
    serveWatch: () => Promise.resolve(),
    updateCspRuleForLivereload: () => Promise.resolve()
  }, overrides);
}

function _deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
