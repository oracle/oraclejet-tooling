/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const path = require('path');
const fs = require('fs-extra');
const CONSTANTS = require('./constants');
const util = require('./util');

function runHooks(type, context) {
  const hooksConfig = _getHooksConfigObj().hooks;
  return _getHookPromise(type, hooksConfig, context);
}

module.exports = runHooks;

// return the promise defined in the hooks. If not defined, return empty promise
function _getHookPromise(type, hooksConfig, context) {
  return new Promise((resolve, reject) => {
    const updatedContext = util.processContextForHooks(context);
    const hookPath = (hooksConfig && Object.prototype.hasOwnProperty.call(hooksConfig, type)) ?
      _resolveHookPath(hooksConfig[type]) : undefined;
    if (hookPath && util.fsExistsSync(hookPath)) {
      const hook = require(hookPath); // eslint-disable-line
      hook(updatedContext)
        .then((newContext) => {
          if (newContext === undefined || newContext === null ||
            (Object.keys(newContext).length === 0 && newContext.constructor === Object)) {
            // If context coming back is null or empty,
            // likely a mistake in the hook implementation that needs to be flagged
            util.log.warning(`Hook ${type} returning null or empty context.  Returning original context`);
            resolve(context);
          } else {
            resolve(newContext);
          }
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

function _resolveHookPath(hookPath) {
  if (typeof hookPath !== 'string' || !hookPath || path.isAbsolute(hookPath)) {
    return undefined;
  }

  const allowedDir = path.resolve(path.dirname(CONSTANTS.PATH_TO_HOOKS_CONFIG));
  const resolvedHookPath = path.resolve(hookPath);
  const relativeHookPath = path.relative(allowedDir, resolvedHookPath);
  if (!relativeHookPath ||
    relativeHookPath === '..' ||
    relativeHookPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeHookPath)) {
    util.log.warning(`Hook path '${hookPath}' is outside '${allowedDir}'. Skipping.`);
    return undefined;
  }
  return resolvedHookPath;
}

module.exports.__resolveHookPath = _resolveHookPath;
