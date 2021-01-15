#! /usr/bin/env node
/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/

'use strict';

/**
 * ## Dependencies
 */

const util = require('./util');
const fs = require('fs-extra');
const exec = require('child_process').exec;
const CONSTANTS = require('./constants');
const path = require('path');

/**
 * ## Helpers
 */

/**
 * ## _installTypescript
 *
 * Install Typescript locally if environment does not
 * have a valid global version
 *
 * @private
 * @returns {Promise}
 */
function installTypescipt() {
  return new Promise((resolve) => {
    util.log('Installing Typescript');
    exec(`npm install typescript@${CONSTANTS.TYPESCRIPT_VERSION} --save-dev --save-exact`, {
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

/**
 * ## _injectFileIntoApplication
 *
 * Inject file into the application
 *
 * @private
 * @param {string} options.name name of file
 * @param {string} options.src path to file src
 * @param {string} options.dest path to file dest
 * @returns {Promise}
 */
function _injectFileIntoApplication({ name, src, dest }) {
  util.log(`Adding ${dest}`);
  return new Promise((resolve) => {
    fs.pathExists(dest)
      .then((exists) => {
        if (!exists) {
          fs.copy(src, dest)
            .then(resolve)
            .catch(util.log.error);
        } else {
          const ext = path.extname(name);
          fs.rename(dest, dest.replace(ext, `_old${ext}`))
            .then(() => {
              fs.copy(src, dest)
                .then(resolve)
                .catch(util.log.error);
            })
            .catch(util.log.error);
        }
      })
      .catch(util.log.error);
  });
}

/**
 * ## injectTypescriptConfig
 *
 * Inject preset tsconfig.json file into the application
 *
 * @private
 * @returns {Promise}
 */
function injectTypescriptConfig() {
  return _injectFileIntoApplication({
    name: CONSTANTS.TSCONFIG,
    src: CONSTANTS.PATH_TO_TSCONFIG_TEMPLATE,
    dest: CONSTANTS.TSCONFIG
  });
}

/**
 * ## addTypescript
 *
 * Add Typescript support to an application
 *
 * @public
 * @returns {Promise}
 */
module.exports = function () {
  return installTypescipt()
    .then(injectTypescriptConfig)
    .catch(util.log.error);
};
