/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
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
const path = require('path');
const CONSTANTS = require('./constants');

/**
 * # serveWeb file change procedure
 *
 * @public
 * @param {string} filePath - Path to the file
 * @param {object} buildContext - Build configurations
 * @returns {Promise}
 */

module.exports = function (filePath, buildContext) {
  return new Promise((resolve) => {
    const pathComponents = util.getPathComponents(filePath);
    const defaultDest = path.join(
      pathComponents.beg,
      config('paths').staging.web,
      pathComponents.end
    );
    let buildPromise = Promise.resolve();
    let customDest;
    if (_isFileOverridden(pathComponents)) {
      console.log(`Overridden file not changed: ${filePath}`);
      return;
    }
    /* Copies file over for the watch events */
    if (_isIndexHtml(filePath)) {
      fs.copySync(filePath, defaultDest);
      buildPromise = buildCommon.injectTheme(buildContext)
        .then(buildCommon.injectLocalhostCspRule)
        .then(buildCommon.injectCdnBundleScript)
        .catch((err) => {
          console.log(err);
        });
    } else if (_isMainJs(filePath)) {
      fs.copySync(filePath, defaultDest);
      buildPromise = buildCommon.injectPaths(buildContext)
        .catch((err) => {
          console.log(err);
        });
    } else if (util.isPathCCA(pathComponents.end)) {
      let component = util.getCCANameFromPath(pathComponents.end);
      let version = config('componentVersionObj')[component];
      // If the simple name lookup fails, then we check to see if we have a jetpack component.
      if (version === undefined) {
        component = util.getJetpackCompNameFromConfigObj(config('componentVersionObj'), pathComponents.end);
        if (component !== null) {
          version = config('componentVersionObj')[component];
        }
      }
      const basePathArray = pathComponents.end.split(path.sep);
      let basePath = '';
      const startIndex = component ? basePathArray.indexOf(component) + 1 :
            basePathArray.indexOf(CONSTANTS.JET_COMPOSITES_DIRECTORY) + 2;
      for (let i = startIndex; i < basePathArray.length; i++) {
        basePath = path.join(basePath, basePathArray[i]);
      }
      const isTypescriptComponent = util.isTypescriptComponent({ component });
      customDest = path.join(
        pathComponents.beg,
        config('paths').staging.web,
        isTypescriptComponent ? config('paths').src.typescript : config('paths').src.javascript,
        config('paths').composites,
        component,
        version,
        basePath
      );
      fs.copySync(filePath, customDest);
      if (isTypescriptComponent) {
        buildPromise = buildCommon.compileComponentTypescript({
          context: {
            ...buildContext,
            serving: true
          },
          component,
          version
        });
      }
    } else if (util.isTypescriptFile(pathComponents)) {
      fs.copySync(filePath, defaultDest);
      buildPromise = buildCommon.typescript({ ...buildContext, serving: true });
    } else if (_isUnderTsFolder(pathComponents.end)) {
      customDest = path.join(
        pathComponents.beg,
        config('paths').staging.web,
        _replaceTsWithJs(pathComponents.end)
      );
      fs.copySync(filePath, customDest);
    } else {
      fs.copySync(filePath, defaultDest);
    }
    buildPromise.then(() => resolve());
  });
};

/**
 * ## _isIndexHtml
 *
 * @private
 * @param {string} filePath
 * @returns {boolean}
 */
function _isIndexHtml(filePath) {
  return path.basename(filePath) === 'index.html';
}

/**
 * ## _isMainJs
 *
 * @private
 * @param {string} filePath
 * @returns {boolean}
 */
function _isMainJs(filePath) {
  return path.basename(filePath) === 'main.js';
}

/**
 * ## _isUnderTsFolder
 *
 * @private
 * @param {string} filePath
 * @returns {boolean}
 */
function _isUnderTsFolder(filePath) {
  return filePath.startsWith(_getTsFolderToken());
}

/**
 * ## _getTsFolderToken
 *
 * @private
 * @returns {boolean}
 */
function _getTsFolderToken() {
  return `${path.sep}${config('paths').src.typescript}${path.sep}`;
}

/**
 * ## _replaceTsWithJs
 *
 * @private
 * @returns {boolean}
 */
function _replaceTsWithJs(filePath) {
  return path.join(
    'js',
    filePath.slice(_getTsFolderToken().length)
  );
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
  const filePath = pathComponents.beg + config('paths').src.web + pathComponents.end;

  return util.fsExistsSync(filePath);
}
