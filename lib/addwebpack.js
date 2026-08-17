/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const CONSTANTS = require('./constants');
const util = require('./util');
const config = require('./config');

/**
 * ## injectOjetConfig
 *
 * Inject default ojet.config file into the application
 *
 * @private
 * @returns {Promise}
 */
function injectOJetConfig() {
  return util.injectFileIntoApplication({
    name: CONSTANTS.OJET_CONFIG,
    src: path.join(util.getToolingPath(), CONSTANTS.PATH_TO_OJET_CONFIG_TEMPLATE),
    dest: CONSTANTS.OJET_CONFIG
  });
}

/**
 * Install webpack and required loaders from NPM
 * @param {Object} options
 * @returns
 */
function installWebpack(options) {
  util.log('Installing webpack and required dependencies');
  const installer = util.getInstallerCommand({ options });
  config.loadOraclejetConfig();
  const webpackLibraries = config.data.webpackLibraries;
  const { enableLegacyPeerDeps } = util.getOraclejetConfigJson();
  try {
    const installArgs = util.getInstallArgs({
      installer,
      dependencies: webpackLibraries,
      enableLegacyPeerDeps
    });

    return util.spawn(installer.installer, installArgs);
  } catch (error) {
    return Promise.reject(error);
  }
}

module.exports = function (options) {
  return installWebpack(options)
    .then(injectOJetConfig)
    .catch((error) => {
      util.log.error(error);
      return Promise.reject(error);
    });
};
