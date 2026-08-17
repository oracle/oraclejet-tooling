/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const assert = require('assert');

const config = require('../lib/config');
const connect = require('../lib/serve/connect');
const serve = require('../lib/serve');
const util = require('../lib/util');
const watch = require('../lib/serve/watch');
const validations = require('../lib/validations');

describe('Serve hardening', () => {
  const original = {};

  beforeEach(() => {
    original.defaultServeConfig = config.get('defaultServeConfig');
    original.paths = config.get('paths');
    original.serveConfig = config.data.serve;
    original.log = util.log;
    original.logWarning = util.log.warning;
    original.logError = util.log.error;
    original.buildWithWebpack = util.buildWithWebpack;
    original.exec = util.exec;
    original.spawn = util.spawn;
  });

  afterEach(() => {
    config.set('defaultServeConfig', original.defaultServeConfig);
    config.set('paths', original.paths);
    config.data.serve = original.serveConfig;
    util.log = original.log;
    util.log.warning = original.logWarning;
    util.log.error = original.logError;
    util.buildWithWebpack = original.buildWithWebpack;
    util.exec = original.exec;
    util.spawn = original.spawn;
  });

  it('should default serve config to localhost without directory listing', () => {
    config.set('paths', {
      staging: { web: 'web', themes: 'web/themes' },
      src: {
        common: 'src',
        styles: 'css',
        javascript: 'js',
        typescript: 'ts',
        themes: 'themes',
        web: 'src-web'
      },
      exchangeComponents: 'jet_components'
    });
    const defaultServeConfig = validations.getDefaultServeConfig();

    assert.strictEqual(defaultServeConfig.connect.options.hostname, '127.0.0.1');
    assert.strictEqual(defaultServeConfig.connect.options.directoryListing, false);
  });

  it('should reject arbitrary string watch commands', async () => {
    config.data = {
      ...config.data,
      serve: {}
    };
    util.log = () => {};
    util.log.error = (message) => {
      throw message instanceof Error ? message : new Error(String(message));
    };

    await assert.rejects(
      () => watch.__getCommandPromise('echo pwned'),
      /Unknown watch command 'echo pwned' is not allowed/
    );
  });

  it('should run structured watch commands with spawn', async () => {
    let execCalled = false;
    let spawnCall;

    config.data = {
      ...config.data,
      serve: {}
    };
    util.exec = () => {
      execCalled = true;
      return Promise.resolve();
    };
    util.spawn = (cmd, args, outputString, logOutputArg, spawnOptions) => {
      spawnCall = {
        cmd,
        args,
        outputString,
        logOutputArg,
        spawnOptions
      };
      return Promise.resolve();
    };

    await watch.__getCommandPromise({
      cmd: 'npm',
      args: ['run', 'generate-docs'],
      cwd: 'tools',
      env: { NODE_ENV: 'development' }
    });

    assert.strictEqual(execCalled, false);
    assert.deepStrictEqual(spawnCall, {
      cmd: 'npm',
      args: ['run', 'generate-docs'],
      outputString: undefined,
      logOutputArg: undefined,
      spawnOptions: {
        cwd: 'tools',
        env: { NODE_ENV: 'development' }
      }
    });
  });

  it('should reject invalid structured watch commands', async () => {
    await assert.rejects(
      () => watch.__getCommandPromise({ cmd: '' }),
      /cmd' must be a non-empty string/
    );
    await assert.rejects(
      () => watch.__getCommandPromise({ cmd: 'npm', args: 'run build' }),
      /args' must be an array of strings/
    );
    await assert.rejects(
      () => watch.__getCommandPromise({ cmd: 'npm', cwd: 5 }),
      /cwd' must be a string/
    );
    await assert.rejects(
      () => watch.__getCommandPromise({ cmd: 'npm', env: { NODE_ENV: 1 } }),
      /env' must be an object with string values/
    );
    await assert.rejects(
      () => watch.__getCommandPromise({ cmd: 'npm', shell: true }),
      /Unsupported watch command property 'shell'/
    );
  });

  it('should omit serve-index middleware by default', () => {
    const middleware = connect.__getDefaultMiddleware({
      base: 'web',
      directoryListing: false
    });

    assert.strictEqual(Array.isArray(middleware), true);
    assert.strictEqual(middleware.length, 1);
  });

  it('should include serve-index middleware when explicitly enabled', () => {
    const middleware = connect.__getDefaultMiddleware({
      base: 'web',
      directoryListing: true
    });

    assert.strictEqual(Array.isArray(middleware), true);
    assert.strictEqual(middleware.length, 2);
  });

  it('should fail closed when wildcard hostname is configured', () => {
    const warnings = [];
    util.log.warning = message => warnings.push(message);
    const options = connect.__processCustomOptions({
      hostname: '*',
      port: 8000
    });

    assert.strictEqual(options.hostname, '127.0.0.1');
    assert.strictEqual(
      warnings.some(message => message.includes("Wildcard hostname '*' is not used")),
      true
    );
  });

  it('should reject requests with unexpected host headers', () => {
    const middleware = connect.__getHostValidationMiddleware({
      hostname: '127.0.0.1'
    });
    const result = _runHostValidationMiddleware(middleware, 'attacker.example:8000');

    assert.strictEqual(result.nextCalled, false);
    assert.strictEqual(result.statusCode, 403);
    assert.strictEqual(result.body, 'Invalid Host header');
  });

  it('should allow localhost and configured host headers', () => {
    const middleware = connect.__getHostValidationMiddleware({
      hostname: 'devbox.example.com'
    });

    assert.strictEqual(_runHostValidationMiddleware(middleware, 'localhost:8000').nextCalled, true);
    assert.strictEqual(_runHostValidationMiddleware(middleware, '127.0.0.1:8000').nextCalled, true);
    assert.strictEqual(_runHostValidationMiddleware(middleware, '[::1]:8000').nextCalled, true);
    assert.strictEqual(
      _runHostValidationMiddleware(middleware, 'devbox.example.com:8000').nextCalled,
      true
    );
  });

  it('should skip host validation for explicit all-interface binding', () => {
    const middleware = connect.__getHostValidationMiddleware({
      hostname: '0.0.0.0'
    });
    const result = _runHostValidationMiddleware(middleware, 'attacker.example:8000');

    assert.strictEqual(result.nextCalled, true);
  });

  it('should not allow host headers from serverUrl unless hostname is configured', () => {
    const options = connect.__processCustomOptions({
      hostname: '127.0.0.1',
      serverUrl: 'http://smadeghe-dev.example.com:8080/some/path'
    });
    const middleware = connect.__getHostValidationMiddleware(options);

    assert.strictEqual(
      _runHostValidationMiddleware(middleware, 'smadeghe-dev.example.com:8080').statusCode,
      403
    );
    assert.strictEqual(
      _runHostValidationMiddleware(middleware, 'localhost:8080').nextCalled,
      true
    );
  });

  it('should install host validation before static middleware', () => {
    const middleware = connect.__getMiddleware({
      base: 'web',
      directoryListing: false,
      hostname: '127.0.0.1',
      livereload: false
    });
    const result = _runHostValidationMiddleware(middleware[0], 'attacker.example:8000');

    assert.strictEqual(result.nextCalled, false);
    assert.strictEqual(result.statusCode, 403);
  });

  it('should pass the connect hostname to the livereload server', async () => {
    let listenArgs;
    const liveReloadServer = {
      listen(port, hostname, callback) {
        listenArgs = { port, hostname };
        callback();
      }
    };

    await watch.__startLiveReloadServer({}, 35729, {
      connectOpts: { hostname: '127.0.0.1' },
      liveReloadServer,
      serveOpts: { livereload: true }
    });

    assert.deepStrictEqual(listenArgs, {
      port: 35729,
      hostname: '127.0.0.1'
    });
  });

  it('should use localhost for livereload when hostname is empty or wildcard', () => {
    assert.strictEqual(watch.__getLiveReloadHostname({
      connectOpts: { hostname: '*' }
    }), '127.0.0.1');
    assert.strictEqual(watch.__getLiveReloadHostname({
      connectOpts: {}
    }), '127.0.0.1');
  });

  it('should warn when enabling external host or directory listing', () => {
    const warnings = [];
    util.log.warning = (message) => warnings.push(message);
    const defaultServeConfig = {
      options: {
        build: true,
        livereload: true,
        watchFiles: true,
        livereloadPort: 35729
      },
      connect: {
        options: {
          hostname: '127.0.0.1',
          port: 8000,
          open: true,
          directoryListing: false
        }
      },
      watch: {}
    };
    const opts = {
      connect: {
        hostname: '0.0.0.0'
      },
      livereload: false,
      destination: 'server-only',
      port: 8000,
      directoryListing: true
    };

    serve.__getConnectOptions(opts, defaultServeConfig.connect);

    assert.strictEqual(warnings.some(message => message.includes('non-local host')), true);
    assert.strictEqual(
      warnings.some(message => message.includes('Directory listing is enabled')),
      true
    );
  });
});

function _runHostValidationMiddleware(middleware, host) {
  const result = {
    nextCalled: false,
    statusCode: null,
    body: null
  };
  const req = {
    headers: {
      host
    }
  };
  const res = {
    set statusCode(value) {
      result.statusCode = value;
    },
    end(body) {
      result.body = body;
    }
  };

  middleware(req, res, () => {
    result.nextCalled = true;
  });

  return result;
}
