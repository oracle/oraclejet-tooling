/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

const fs = require('fs-extra');
const util = require('./util');
const CONSTANTS = require('./constants');
const path = require('path');

const config = module.exports = function (prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  } else {
    return config.get(prop);
  }
};

config.data = {};

/**
 * Get the config value
 * @param  {String} prop property to get
 * @returns {String} return
 */
config.get = function (prop) {
  if (prop) {
    return config.data[prop];
  } else {
    return config.data;
  }
};

/**
 * Set the config value
 * @param  {String} prop property to set
 * @param  {*} value value to set
 * @returns {String} return
 */
config.set = function (prop, value) {
  return config.data[prop] = value;
};

/**
 * Create a new config
 * @param  {Object} value to set the config.data to
 * @returns {String} return
 */
config.init = function (obj) {
  _loadOraclejetConfig();
  return (config.data = obj || {});
};

config.loadOraclejetConfig = () => _loadOraclejetConfig();

config.getConfiguredPaths = () => _getConfiguredPaths();

function _loadOraclejetConfig() {
  config.data.paths = _getConfiguredPaths();
}

function _getConfiguredPaths() {
  const configJson = _readConfigJson();
  const src = {};
  const staging = {};
  const srcConfig = configJson.paths ? configJson.paths.source : {};
  const stagingConfig = configJson.paths ? configJson.paths.staging : {};

  src.common = srcConfig.common ? path.normalize(srcConfig.common) : CONSTANTS.APP_SRC_DIRECTORY;
  src.javascript = srcConfig.javascript ? path.normalize(srcConfig.javascript) : 'js';
  src.styles = srcConfig.styles ? path.normalize(srcConfig.styles) : 'css';
  src.themes = srcConfig.themes ? path.normalize(srcConfig.themes) : 'themes';
  src.web = srcConfig.web ? path.normalize(srcConfig.web) : CONSTANTS.APP_SRC_WEB_DIRECTORY;
  src.hybrid = srcConfig.hybrid ? path.normalize(srcConfig.hybrid) : CONSTANTS.APP_SRC_HYBRID_DIRECTORY;

  staging.web = stagingConfig.web ? path.normalize(stagingConfig.web) : CONSTANTS.WEB_DIRECTORY;
  staging.hybrid = stagingConfig.hybrid ? path.normalize(stagingConfig.hybrid) : CONSTANTS.CORDOVA_DIRECTORY;
  staging.themes = stagingConfig.themes ? path.normalize(stagingConfig.themes) : CONSTANTS.APP_THEMES_DIRECTORY;
  return { src, staging };
}

function _readConfigJson() {
  const configPath = util.destPath(CONSTANTS.ORACLE_JET_CONFIG_JSON);
  const configJson = util.fsExistsSync(configPath) ? fs.readJsonSync(configPath) : null;
  config.set('defaultBrowser', configJson.defaultBrowser || CONSTANTS.DEFAULT_BROWSER);
  return configJson;
}
