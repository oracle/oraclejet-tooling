/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
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
/**
 * # ServeWeb procedure
 *
 * @param {function} build - build action (build or not)
 * @public
 */
module.exports = (build) => {
  build()
    .then(_updateCspRuleForLivereload)
    .then(() => {
      const connectOpts = _getConnectConfig(config.get('serve'));
      const serveOpts = config.get('serve');
      serveConnect(connectOpts);
      if (serveOpts.livereload) {
        serveWatch(serveOpts.watch, serveOpts.livereloadPort);
      }
    })
    .catch((error) => {
      // Can not throw in promise catch handler
      // http://stackoverflow.com/questions/30715367/why-can-i-not-throw-inside-a-promise-catch-handler
      setTimeout(() => {
        throw util.toError(error);
      }, 0);
    });
};

function _getConnectConfig(opts) {
  const connectConfig = Object.assign({ livereloadPort: opts.livereloadPort },
                                      opts.connect.options);
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
