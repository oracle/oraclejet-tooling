/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * # Dependencies
 */

/* 3rd party */
const fs = require("fs-extra");

/* Oracle */
const CONSTANTS = require("./constants");
const buildCommon = require('./buildCommon');
const util = require('./util');

/**
 * # serveWeb file change procedure
 *
 * @private
 * @param {string} filePath - Path to the file
 */

module.exports = (filePath, target, buildContext) =>
{
  const pathComponents = util.getPathComponents(filePath);
  
  if (_isFileOverridden(pathComponents))
  {
    console.log('Overridden file not changed: ' + filePath);
    return;
  }
  
  /* Copies file over for the watch events */
  fs.copySync(filePath, pathComponents['beg'] + CONSTANTS.WEB_DIRECTORY + pathComponents['end']);
  _injectThemeIfIndexHtml(filePath, buildContext);
};

function _injectThemeIfIndexHtml(filePath, buildContext) {
 if( _isIndexHtml(filePath)) {
    buildCommon.injectTheme(buildContext)
    .then(buildCommon.injectLocalhostCspRule.bind(buildContext))
    .catch((err) => {
      console.log(err);
    });
  } 
}

function _isIndexHtml(filePath) {
  return /index.html/.test(filePath);
}

/**
 * # _isFileOverridden
 * Checks if the source file modified under livereload is potentially overridden
 * in the src-web directory in which case the change should not be propagated
 * to the served content.
 * 
 * @private
 * @param {object} pathComponents - file path specification
 * @returns {boolean}
 */

function _isFileOverridden(pathComponents)
{
  var srcDir = pathComponents['mid'];
  
  if (srcDir === CONSTANTS.APP_SRC_WEB_DIRECTORY)
  {
    return false;
  }
  var path = pathComponents['beg'] + CONSTANTS.APP_SRC_WEB_DIRECTORY + pathComponents['end'];
  
  return util.fsExistsSync(path);
}