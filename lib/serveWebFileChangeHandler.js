/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * # Dependencies
 */
/* 3rd party */
const fs = require('fs-extra');

/* Oracle */
const buildCommon = require('./buildCommon');
const config = require('./config');
const util = require('./util');

/**
 * # serveWeb file change procedure
 *
 * @public
 * @param {string} filePath - Path to the file
 */

module.exports = (filePath, buildContext) => {
  const pathComponents = util.getPathComponents(filePath);
  if (_isFileOverridden(pathComponents)) {
    console.log(`Overridden file not changed: ${filePath}`);
    return;
  }
  /* Copies file over for the watch events */
  fs.copySync(filePath, pathComponents.beg + config('paths').staging.web + pathComponents.end);
  _injectThemeIfIndexHtml(filePath, buildContext);
};

/**
 * ## _injectThemeIfIndexHtml
 *
 * @private
 * @param {string} filePath
 * @param {Object} buildContext
 * @returns {boolean} validBuild
 */
function _injectThemeIfIndexHtml(filePath, buildContext) {
  if (_isIndexHtml(filePath)) {
    buildCommon.injectTheme(buildContext)
      .then(buildCommon.injectLocalhostCspRule.bind(buildContext))
      .catch((err) => {
        console.log(err);
      });
  }
}

/**
 * ## _isIndexHtml
 *
 * @private
 * @param {string} filePath
 * @returns {boolean}
 */
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
function _isFileOverridden(pathComponents) {
  const srcDir = pathComponents.mid;

  if (srcDir === config('paths').src.web) {
    return false;
  }
  const path = pathComponents.beg + config('paths').src.web + pathComponents.end;

  return util.fsExistsSync(path);
}
