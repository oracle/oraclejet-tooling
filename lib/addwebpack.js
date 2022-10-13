/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const CONSTANTS = require('./constants');
const util = require('./util');

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

  const command = `
    ${installer.installer} ${installer.verbs.install} 
    webpack@${CONSTANTS.WEBPACK_VERSION}
    @types/node@18.8.3
    webpack-dev-server
    style-loader
    css-loader
    ts-loader
    raw-loader
    noop-loader
    html-webpack-plugin
    html-replace-webpack-plugin
    copy-webpack-plugin
    @prefresh/webpack
    @prefresh/babel-plugin
    webpack-merge
    compression-webpack-plugin
    mini-css-extract-plugin
    --save-dev --save-exact
  `.replace(/\n/g, '').replace(/\s+/g, ' ');
  return util.exec(command);
}

module.exports = function (options) {
  return installWebpack(options)
    .then(injectOJetConfig)
    .catch(util.log.error);
};
