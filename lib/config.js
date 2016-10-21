/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

const fs = require("fs-extra");
const util = require("./util");
const CONSTANTS = require("./constants");
const path = require("path");

var config = module.exports = function(prop, value) {
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
config.get = function(prop) {
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
config.set = function(prop, value) {
  return config.data[prop] = value;
};

/**
 * Create a new config 
 * @param  {Object} value to set the config.data to
 * @returns {String} return 
 */
config.init = function(obj) {
  _loadOraclejetConfig();
  return (config.data = obj || {});
};

config.loadOraclejetConfig = () => {
  const configJson = _readConfigJson();
  let src = {};
  let staging = {};      
  src.common = path.normalize(configJson.paths.source.common) || CONSTANTS.APP_SRC_DIRECTORY;
  src.javascript = path.normalize(configJson.paths.source.javascript) || "js";
  src.styles = path.normalize(configJson.paths.source.styles) || "css";
  src.themes = path.normalize(configJson.paths.source.themes) || "themes";
  src.web = path.normalize(configJson.paths.source.web) || CONSTANTS.APP_SRC_WEB_DIRECTORY;
  src.hybrid = path.normalize(configJson.paths.source.hybrid) || CONSTANTS.APP_SRC_HYBRID_DIRECTORY;
  staging.web = path.normalize(configJson.paths.staging.web) || CONSTANTS.WEB_DIRECTORY;
  staging.hybrid = path.normalize(configJson.paths.staging.hybrid) || CONSTANTS.CORDOVA_DIRECTORY;
  staging.themes = path.normalize(configJson.paths.staging.themes) || CONSTANTS.APP_THEMES_DIRECTORY;   
  config.data.paths = {src, staging};
  return {src, staging};
};

function _readConfigJson(){
  const configPath = util.destPath(CONSTANTS.ORACLE_JET_CONFIG_JSON);
  return util.fsExistsSync(configPath) ? fs.readJsonSync(configPath) : undefined; 
};

