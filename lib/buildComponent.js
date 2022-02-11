/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const path = require('path');
const util = require('./util');
const hookRunner = require('./hookRunner');
const buildCommon = require('./buildCommon');
const config = require('./config');
const generateComponentsCache = require('./buildCommon/generateComponentsCache');
const constants = require('./constants');

module.exports = function buildComponent(component, opts) {
  return new Promise((resolve, reject) => {
    // force component build to run in release mode.
    const context = { platform: 'web', buildType: 'release', opts };
    const componentsCache = generateComponentsCache({ context });
    config.set('componentsCache', componentsCache);
    const componentCache = componentsCache[component];
    if (!componentCache) {
      util.log.error(`${component} is not a valid component name.`);
    }
    const { componentJson } = componentCache;
    context.componentConfig = componentJson;
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
      .then(() => {
        // Write cached component.json to staging location
        const { builtPath } = componentsCache[component];
        const componentJsonPath = path.join(builtPath, constants.JET_COMPONENT_JSON);
        util.writeObjectAsJsonFile(componentJsonPath, componentJson);
      })
      .then(data => resolve(data))
      .catch(err => reject(err));
  });
};
