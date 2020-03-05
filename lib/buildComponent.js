/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const CONSTANTS = require('./constants');
const path = require('path');
const util = require('./util');
const fs = require('fs-extra');
const hookRunner = require('./hookRunner');
const buildCommon = require('./buildCommon');

function _getComponentJsonObj(componentPath) {
  const file = path.resolve(componentPath, 'component.json');
  if (util.fsExistsSync(file)) {
    return fs.readJsonSync(file);
  }
  return {};
}

//
// Build a specific component.
//
module.exports = function buildComponent(component, opts) {
  return new Promise((resolve, reject) => {
    const srcPath = util.getComponentPath(component);
    const componentJson =
      util.readJsonAndReturnObject(path.join(srcPath, CONSTANTS.JET_COMPONENT_JSON));
    const componentSrcPath = util.getComponentPath(component);
    // force component build to run in release mode.
    const context = { platform: 'web', buildType: 'release', componentConfig: _getComponentJsonObj(componentSrcPath), opts };
    // Note that in order to ensure that the proper libs
    // are in web/ (platform:web buildType:release) we must call copyLibs().
    buildCommon.copyLibs(context)
      .then(() => buildCommon.copySingleCca(context, componentJson, component))
      .then(() => buildCommon.compileComponentTypescript({
        context,
        component,
        version: componentJson.version
      }))
      .then(() => buildCommon.minifyComponent(context, componentJson, component))
      .then(() => hookRunner('after_component_build', context))
      .then(data => resolve(data))
      .catch(err => reject(err));
  });
};
