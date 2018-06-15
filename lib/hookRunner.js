/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const path = require('path');
const fs = require('fs-extra');
const CONSTANTS = require('./constants');
const util = require('./util');
const config = require('./config');


module.exports = function runHooks(type, context) {
  const hooksConfig = _getHooksConfigObj().hooks;
  return _getHookPromise(type, hooksConfig, context);
};

// return the promise defined in the hooks. If not defined, return empty promise
function _getHookPromise(type, hooksConfig, context) {
  return new Promise((resolve, reject) => {
    const hookPath = (hooksConfig && Object.prototype.hasOwnProperty.call(hooksConfig, type)) ?
      path.resolve(hooksConfig[type]) : undefined;
    if (hookPath && util.fsExistsSync(hookPath)) {
      const hook = require(hookPath); // eslint-disable-line

      hook(_processContextForHooks(context))
        .then(() => {
          resolve(context);
        })
        .catch(err => reject(err));
    } else {
      console.log(`Hook ${type} not defined..`);
      resolve(context);
    }
  });
}

// Read the hooks.json file
function _getHooksConfigObj() {
  const file = path.resolve(CONSTANTS.PATH_TO_HOOKS_CONFIG);
  if (util.fsExistsSync(file)) {
    return fs.readJsonSync(file);
  }
  return {};
}

// assemble the necessary environment variables for writing hooks
function _processContextForHooks(context) {
  const obj = {
    platform: context.platform,
    buildType: context.buildType,
    theme: context.opts.theme,
    paths: config('paths')
  };
  return obj;
}
