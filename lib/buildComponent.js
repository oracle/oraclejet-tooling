/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const util = require('./util');
const hookRunner = require('./hookRunner');
const buildCommon = require('./buildCommon');

module.exports = function buildComponent(component, opts) {
  return new Promise((resolve, reject) => {
    const componentJson = util.getComponentJson({ component });
    // force component build to run in release mode.
    const context = { platform: 'web', buildType: 'release', componentConfig: componentJson, opts };
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
