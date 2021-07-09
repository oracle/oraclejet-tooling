/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const CONSTANTS = require('./constants');
const util = require('./util');
const exec = require('child_process').exec;

/**
 * Add "bundle" and "bundleName" properties to application's
 * oraclejetconfig.json file
 * @returns
 */
function updateOraclejetConfig() {
  return new Promise((resolve) => {
    util.log('Adding bundler and bundlerName properties to oraclejetconfig.json');
    const oraclejetConfigJson = util.readJsonAndReturnObject(CONSTANTS.ORACLE_JET_CONFIG_JSON);
    oraclejetConfigJson.bundler = 'webpack';
    oraclejetConfigJson.bundleName = CONSTANTS.DEFAULT_BUNDLE_NAME;
    util.writeObjectAsJsonFile(CONSTANTS.ORACLE_JET_CONFIG_JSON, oraclejetConfigJson);
    resolve();
  });
}

/**
 * Install webpack and required loaders from NPM
 * @returns
 */
function installWebpack() {
  return new Promise((resolve) => {
    util.log('Installing webpack and required loaders');
    exec('npm i -D webpack text-loader style-loader css-loader', {
      env: {
        ...process.env,
        // speed up npm install when on vpn
        NO_UPDATE_NOTIFIER: true
      }
    }, (error) => {
      if (error) {
        util.log.error(error);
      } else {
        resolve();
      }
    });
  });
}

module.exports = function () {
  return Promise.resolve()
    .then(updateOraclejetConfig)
    .then(installWebpack);
};
