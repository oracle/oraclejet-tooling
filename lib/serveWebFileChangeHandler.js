/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

/**
 * # Dependencies
 */

/* 3rd party */
const fs = require('fs-extra');

/* Oracle */
const buildCommon = require('./buildCommon');
const util = require('./util');
const path = require('path');

/**
 * # serveWebFileChangeHandler
 *
 * @public
 * @param {object} options
 * @param {string} options.filePath
 * @param {object} options.buildContext
 * @returns {Promise}
 */
module.exports = function (filePath, buildContext) {
  return new Promise((resolve, reject) => {
    const pathComponents = util.getPathComponents(filePath);
    const configPaths = util.getConfiguredPaths();
    const defaultDest = path.join(
      pathComponents.beg,
      configPaths.staging.web,
      pathComponents.end
    );
    const isTypescriptFile = util.isTypescriptFile({ filePath });
    const inTypescriptFolder = pathComponents.end.startsWith(
      path.join(path.sep, configPaths.src.typescript)
    );
    let buildPromise = Promise.resolve(buildContext);
    /* Copies file over for the watch events */
    if (_isIndexHtml(filePath)) {
      fs.copySync(filePath, defaultDest);
      buildPromise = buildCommon.injectTheme(buildContext)
        .then(buildCommon.injectLocalhostCspRule)
        .then(buildCommon.injectScripts);
    } else if (_isMainJs(filePath)) {
      fs.copySync(filePath, defaultDest);
      buildPromise = buildCommon.injectPaths(buildContext);
    } else if (util.isPathCCA(path.join(pathComponents.mid, pathComponents.end))) {
      const { pack, component } = util.getComponentInformationFromFilePath({
        filePath: path.join(pathComponents.mid, pathComponents.end),
        filePathPointsToSrc: true
      });
      const scriptsFolder = inTypescriptFolder ?
        configPaths.src.typescript : configPaths.src.javascript;
      // copy to versioned component staging location
      const componentStagingRoot = util.generatePathToComponentRoot({
        context: buildContext,
        pack,
        component,
        root: configPaths.staging.web,
        scripts: scriptsFolder
      });
      const relativePathToFile = path.relative(
        path.join(path.sep, scriptsFolder, configPaths.components, pack, component),
        pathComponents.end
      );
      const filePathDest = path.join(
        pathComponents.beg,
        componentStagingRoot,
        relativePathToFile
      );
      fs.copySync(
        filePath,
        filePathDest
      );
      if (isTypescriptFile) {
        // is a typescript file so have to run the compiler
        // eslint-disable-next-line no-param-reassign
        buildContext.serving = true;
        // set file option with path to changed file that
        // needs to be compiled
        // eslint-disable-next-line no-param-reassign
        buildContext.opts.typescript = {
          ...(buildContext.opts.typescript || {}),
          file: path.join(componentStagingRoot, relativePathToFile)
        };
        buildPromise = buildCommon.compileComponentTypescript({
          context: buildContext,
          pack,
          component
        });
      } else {
        // not a typescript file so no need to run compiler, simply
        // copy to the destination folder i.e web/js
        const componentStagingRootJs = util.generatePathToComponentRoot({
          context: buildContext,
          pack,
          component,
          root: configPaths.staging.web,
          scripts: configPaths.src.javascript
        });
        const relativePathToFileJs = path.relative(
          path.join(path.sep, scriptsFolder, configPaths.components, pack, component),
          pathComponents.end
        );
        const filePathDestJs = path.join(
          pathComponents.beg,
          componentStagingRootJs,
          relativePathToFileJs
        );
        fs.copySync(
          filePath,
          filePathDestJs
        );
      }
    } else if (isTypescriptFile) {
      fs.copySync(filePath, defaultDest);
      // eslint-disable-next-line no-param-reassign
      buildContext.serving = true;
      // provide path to file so that we only compile the file that changed
      // eslint-disable-next-line no-param-reassign
      buildContext.opts.typescript = {
        ...(buildContext.opts.typescript || {}),
        file: path.join(configPaths.staging.web, pathComponents.end)
      };
      buildPromise = buildCommon.compileApplicationTypescript(buildContext);
    } else if (inTypescriptFolder) {
      // copy to web/ts to prevent override during post-typescript copy
      fs.copySync(filePath, defaultDest);
      // copy to web/js since post-typescript copy not run
      const relativePathToFile = path.relative(
        path.join(path.sep, configPaths.src.typescript),
        pathComponents.end
      );
      const filePathDest = path.join(
        pathComponents.beg,
        configPaths.staging.web,
        configPaths.src.javascript,
        relativePathToFile
      );
      fs.copySync(
        filePath,
        filePathDest
      );
    } else {
      fs.copySync(filePath, defaultDest);
    }
    buildPromise
      .then(resolve)
      .catch(reject);
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
