/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';
const DEFAULT_BUILD_CONFIG = require('./defaultconfig').build;
const util = require('./util');
const fs = require('fs-extra');
const CONSTANTS = require('./constants');

function _getValidAppType() {
  let defaultAppType = '';
  if (fs.existsSync(CONSTANTS.CORDOVA_DIRECTORY)) {
    defaultAppType = CONSTANTS.APP_TYPE.HYBRID;
  } else {
    defaultAppType = CONSTANTS.APP_TYPE.WEB;
  }
  return defaultAppType;
}

module.exports = function clean(path) {
  const validAppType = _getValidAppType();
  const config = DEFAULT_BUILD_CONFIG[validAppType];
  const filePath = path ? util.destPath(path) : util.destPath(config.stagingPath);
  return new Promise((resolve, reject) => {
    fs.emptyDir(filePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};
