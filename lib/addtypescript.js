#! /usr/bin/env node
/**
  Copyright (c) 2015, 2019, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

/**
 * ## Dependencies
 */

const util = require('./util');
const fs = require('fs');
const exec = require('child_process').exec;
const CONSTANTS = require('./constants');

/**
 * ## Helpers
 */

function installTypescipt(validGlobalTypescriptAvailable) {
  return new Promise((resolve) => {
    if (validGlobalTypescriptAvailable) {
      resolve();
    } else {
      util.log('Installing Typescript');
      exec('npm install typescript --save-dev=true', {
        env: {
          ...process.env,
          NO_UPDATE_NOTIFIER: true
        }
      }, (error) => {
        if (error) {
          util.log.error(error);
        } else {
          resolve();
        }
      });
    }
  });
}

function injectTypscriptConfig() {
  util.log('Adding tsconfig.json');
  function copyTsconfigToRoot(resolve) {
    fs.copyFile(CONSTANTS.PATH_TO_TSCONFIG_TEMPLATE, CONSTANTS.PATH_TO_TSCONFIG, (error) => {
      if (error) {
        util.log.error(error);
      } else {
        resolve();
      }
    });
  }
  return new Promise((resolve) => {
    util.fsExists(CONSTANTS.PATH_TO_TSCONFIG, (fsExistsError) => {
      if (fsExistsError) {
        copyTsconfigToRoot(resolve);
      } else {
        fs.rename(CONSTANTS.PATH_TO_TSCONFIG, CONSTANTS.PATH_TO_TSCONFIG.replace('.', '_old.'), (fsRenameError) => {
          if (fsRenameError) {
            util.log.error(fsRenameError);
          } else {
            copyTsconfigToRoot(resolve);
          }
        });
      }
    });
  });
}

/**
 * # 'addTypescript'
 *
 * @public
 * @returns {Promise}
 */
module.exports = function () {
  return util.validGlobalTypescriptAvailable()
  .then(installTypescipt)
  .then(injectTypscriptConfig);
};
