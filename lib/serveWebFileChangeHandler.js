/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
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
    const pathSegments = pathComponents.end.split(path.sep).filter(segment => !!segment);
    const configPaths = util.getConfiguredPaths();
    const defaultDest = path.join(
      pathComponents.beg,
      configPaths.staging.web,
      pathComponents.end
    );
    let buildPromise = Promise.resolve(buildContext);
    /* Copies file over for the watch events */
    if (_isIndexHtml(filePath)) {
      fs.copySync(filePath, defaultDest);
      buildPromise = buildCommon.injectTheme(buildContext)
        .then(buildCommon.injectLocalhostCspRule)
        .then(buildCommon.injectCdnBundleScript);
    } else if (_isMainJs(filePath)) {
      fs.copySync(filePath, defaultDest);
      buildPromise = buildCommon.injectPaths(buildContext);
    } else if (util.isPathCCA(pathComponents.end)) {
      const { pack, component } = util.getComponentInformationFromFilePath({
        filePath: path.join(pathComponents.mid, pathComponents.end),
        filePathPointsToSrc: true
      });
      const pathSegmentsEnd = pathSegments.slice(pathSegments.indexOf(component) + 1);
      // copy to versioned component staging location
      fs.copySync(
        filePath,
        path.join(
          util.generatePathToComponentRoot({
            pack,
            component,
            root: configPaths.staging.web,
            scripts: pathSegments[0]
          }),
          ...pathSegmentsEnd
        )
      );
      if (util.isTypescriptFile({ filePath })) {
        // is a typescript file so have to run the compiler
        buildPromise = buildCommon.compileComponentTypescript({
          context: {
            ...buildContext,
            serving: true
          },
          pack,
          component
        });
      } else {
        // not a typescript file so no need to run compiler, simply
        // copy to the destination folder i.e web/js
        fs.copySync(
          filePath,
          path.join(
            util.generatePathToComponentRoot({
              pack,
              component,
              root: configPaths.staging.web,
              scripts: configPaths.src.javascript
            }),
            ...pathSegmentsEnd
          )
        );
      }
    } else if (util.isTypescriptFile({ filePath })) {
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
    } else if (pathSegments[0] === configPaths.src.typescript) {
      // copy to web/ts to prevent override during post-typescript copy
      fs.copySync(filePath, defaultDest);
      // copy to web/js since post-typescript copy not run
      fs.copySync(
        filePath,
        path.join(
          pathComponents.beg,
          configPaths.staging.web,
          configPaths.src.javascript,
          ...pathSegments.slice(1)
        )
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
