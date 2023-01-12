/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/

'use strict';

const fs = require('fs-extra');
const CONSTANTS = require('./constants');
const path = require('path');

const config = function (prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  }
  return config.get(prop);
};
module.exports = config;

config.data = {};

/**
 * Get the config value
 * @param  {String} prop property to get
 * @returns {String} return
 */
config.get = function (prop) {
  if (prop) {
    return config.data[prop];
  }
  return config.data;
};

/**
 * Set the config value
 * @param  {String} prop property to set
 * @param  {*} value value to set
 * @returns {String} return
 */
config.set = function (prop, value) {
  config.data[prop] = value;
  return config.data[prop];
};

config.loadOraclejetConfig = (platform) => {
  config.data.paths = config.getConfiguredPaths(platform);
};

config.getConfiguredPaths = (platform) => {
  const configJson = _readConfigJson();
  const src = {};
  const staging = {};

  const srcConfig = configJson.paths ? configJson.paths.source : {};
  const stagingConfig = configJson.paths ? configJson.paths.staging : {};

  src.common = srcConfig.common ? path.normalize(srcConfig.common) : CONSTANTS.APP_SRC_DIRECTORY;
  src.javascript = srcConfig.javascript ? path.normalize(srcConfig.javascript) : 'js';
  src.typescript = srcConfig.typescript ? path.normalize(srcConfig.typescript) : 'ts';
  src.styles = srcConfig.styles ? path.normalize(srcConfig.styles) : 'css';
  src.themes = srcConfig.themes ? path.normalize(srcConfig.themes) : 'themes';
  src.web = srcConfig.web ? path.normalize(srcConfig.web) : CONSTANTS.APP_SRC_WEB_DIRECTORY;
  src.hybrid = srcConfig.hybrid ? path.normalize(srcConfig.hybrid) :
    CONSTANTS.APP_SRC_HYBRID_DIRECTORY;

  staging.web = stagingConfig.web ? path.normalize(stagingConfig.web) : CONSTANTS.WEB_DIRECTORY;
  staging.hybrid = stagingConfig.hybrid ? path.normalize(stagingConfig.hybrid) :
    CONSTANTS.CORDOVA_DIRECTORY;
  staging.themes = stagingConfig.themes ? path.normalize(stagingConfig.themes) :
    CONSTANTS.APP_STAGED_THEMES_DIRECTORY;

  const configuredPlatform = platform || config.data.platform || 'web';
  staging.stagingPath = (configuredPlatform === 'web') ? staging.web : path.join(staging.hybrid, 'www');
  src.platformSpecific = (configuredPlatform === 'web') ? src.web : src.hybrid;

  const components = srcConfig.components ?
    path.normalize(srcConfig.components) : CONSTANTS.JET_COMPOSITE_DIRECTORY;
  const exchangeComponents = srcConfig.exchangeComponents ?
    path.normalize(srcConfig.exchangeComponents) : CONSTANTS.JET_COMPONENTS_DIRECTORY;

  return {
    src,
    staging,
    components,
    exchangeComponents
  };
};

function _readConfigJson() {
  const configPath = path.join(process.cwd(), CONSTANTS.ORACLE_JET_CONFIG_JSON);
  const configJson = fs.existsSync(configPath) ? fs.readJsonSync(configPath) : {};
  config.set('defaultBrowser', configJson.defaultBrowser || CONSTANTS.DEFAULT_BROWSER);
  config.set('sassVer', configJson.sassVer || CONSTANTS.SASS_VER);
  config.set('typescriptLibraries', configJson.typescriptLibraries || CONSTANTS.TYPESCRIPT_LIBARIES);
  config.set('defaultTheme', configJson.defaultTheme || CONSTANTS.DEFAULT_THEME);
  config.set('installer', configJson.installer || CONSTANTS.DEFAULT_INSTALLER);
  config.set('webpackLibraries', configJson.webpackLibraries || CONSTANTS.WEBPACK_LIBRARIES);
  return configJson;
}
