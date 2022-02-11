#! /usr/bin/env node
/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/

'use strict';

/**
 * ## Dependencies
 */

const fs = require('fs-extra');
const path = require('path');
const util = require('./util');
const CONSTANTS = require('./constants');
/**
 * #addpwa
 *
 * @public
 * @returns {Promise}
 */

module.exports = function () {
  return new Promise((resolve) => {
    // eslint-disable-next-line global-require
    const appName = path.basename(process.cwd());
    const appNameRegex = new RegExp('@AppName@', 'g');
    const pathToApp = path.join('src');
    const pathToIndexHtml = path.join(pathToApp, 'index.html');
    const pathToServiceWorkerTemplates = path.join(util.getToolingPath(),
      CONSTANTS.PATH_TO_PWA_TEMPLATES);
    // 1. read index.html
    const indexHtmlString = fs.readFileSync(
      pathToIndexHtml,
      { encoding: 'utf-8' }
    );
    // 2. read sw.txt, replace app name token and resources to cache
    //    according to the app's architecture, and then write to app as js file
    let swJsString;
    if (util.isVDOMApplication()) {
      swJsString = fs.readFileSync(
        path.join(pathToServiceWorkerTemplates, 'sw.txt'),
        { encoding: 'utf-8' });
      const vdomResourcesToCache = `[
        'index.js',
        'index.html',
        'bundle.js',
        'manifest.json',
        'components/',
        'libs/',
        'styles/'
      ]`;
      const mvvmResourcesToCache = "['index.html', 'manifest.json', 'js/', 'css/']";
      swJsString = swJsString.replace(mvvmResourcesToCache, vdomResourcesToCache);
    } else {
      swJsString = fs.readFileSync(
        path.join(pathToServiceWorkerTemplates, 'sw.txt'),
        { encoding: 'utf-8' });
    }
    const pathToAppSw = path.join(pathToApp, 'sw.js');
    if (fs.pathExistsSync(pathToAppSw)) {
      fs.renameSync(pathToAppSw, path.join(pathToApp, 'sw_old.js'));
    }
    fs.outputFileSync(
      pathToAppSw,
      swJsString.replace(appNameRegex, appName)
    );
    // 3. read manifest.json, replace app name token, write to app
    const manifestJsonString = fs.readFileSync(
      path.join(pathToServiceWorkerTemplates, 'manifest.json'),
      { encoding: 'utf-8' }
    );
    const pathToAppManifest = path.join(pathToApp, 'manifest.json');
    if (fs.pathExistsSync(pathToAppManifest)) {
      fs.renameSync(pathToAppManifest, path.join(pathToApp, 'manifest_old.json'));
    }
    fs.outputFileSync(
      path.join(pathToApp, 'manifest.json'),
      manifestJsonString.replace(appNameRegex, appName)
    );
    // 4. copy swInit.txt and add it to end of body tag index.html, add <link>
    // to end of header tag in index.html and update
    const swInitString = fs.readFileSync(
      path.join(pathToServiceWorkerTemplates, 'swInit.txt'),
      { encoding: 'utf-8' }
    );
    fs.outputFileSync(
      pathToIndexHtml,
      indexHtmlString.replace(
        new RegExp('</head>', 'g'),
        '<link rel="manifest" href="manifest.json">\n</head>'
      ).replace(
        new RegExp('</body>', 'g'),
        `${swInitString.replace(appNameRegex, appName)}\n</body>`
      )
    );
    // Copy over swinit.js
    fs.copyFileSync(path.join(pathToServiceWorkerTemplates, 'swinit._js'),
      path.join(pathToApp, 'swinit.js'));
    resolve();
  });
};
