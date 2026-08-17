/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

/**
 * # Dependencies
 */

/* Oracle */
const config = require('./config');
const util = require('./util');
const indexHtmlInjector = require('./indexHtmlInjector');
const serveConnect = require('./serve/connect');
const serveWatch = require('./serve/watch');
const hookRunner = require('./hookRunner');

/**
 * # ServeWeb procedure
 *
 * @param {function} build - build action (build or not)
 * @returns {Promise}
 * @public
 */
module.exports = build => _runServeLifecycle(build, {
  getServeConfig: () => config.get('serve'),
  hookRunner,
  serveConnect,
  serveWatch,
  updateCspRuleForLivereload: _updateCspRuleForLivereload
}).catch((error) => {
  util.log.error(error);
});

function _runServeLifecycle(build, dependencies) {
  let beforeServeContext = {};
  let connectOpts = {};
  let serveOpts = {};
  return Promise.resolve()
    .then(build)
    .then((context) => {
      serveOpts = dependencies.getServeConfig();
      connectOpts = _getConnectConfig(serveOpts);
      if (!context) {
        // eslint-disable-next-line no-param-reassign
        context = {};
      }
      // eslint-disable-next-line no-param-reassign
      context.connectOpts = connectOpts;

      // eslint-disable-next-line no-param-reassign
      context.serveOpts = serveOpts;
      return dependencies.hookRunner('before_serve', context);
    })
    .then((returnedContext) => {
      beforeServeContext = returnedContext;
      return dependencies.updateCspRuleForLivereload();
    })
    .then(() => Promise.all([
      dependencies.serveConnect(connectOpts, beforeServeContext),
      dependencies.serveWatch(
        serveOpts.watch,
        serveOpts.livereloadPort,
        beforeServeContext
      )
    ]))
    .then(() => dependencies.hookRunner('after_serve', beforeServeContext));
}

function _getConnectConfig(opts) {
  const connectConfig = Object.assign({
    livereloadPort: opts.livereloadPort,
    serverUrl: opts.serverUrl
  },
  opts.connect.options
  );
  if (connectConfig.buildType === 'dev') {
    connectConfig.keepalive = true;
  }
  return connectConfig;
}

/**
 * ## _updateCspRuleForLivereload
 *
 * If livereload is on, updates the CSP rule in index.html to allow connections
 * to the livereload server.
 *
 * @private
 * @returns {object} - resolved promise
 */
function _updateCspRuleForLivereload() {
  const serveConfigs = config.get('serve');

  if (!serveConfigs.livereload) {
    return Promise.resolve();
  }
  const opts = { stagingPath: config.get('paths').staging.web };
  const context = { opts };
  return indexHtmlInjector.injectLocalhostCspRule(context);
}

module.exports.__runServeLifecycle = _runServeLifecycle;
