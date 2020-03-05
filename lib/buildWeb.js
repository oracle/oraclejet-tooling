/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const buildCommon = require('./buildCommon');
const hookRunner = require('./hookRunner');

function _runReleaseBuildTasks(context) {
  return new Promise((resolve, reject) => {
    const opts = context.opts;
    if (opts.buildType !== 'release') {
      resolve(context);
    } else {
      buildCommon.injectPathsEs5(context)
      .then(data => hookRunner('before_release_build', data))
      .then(buildCommon.minifyLocalCca)
      .then(buildCommon.terser)
      .then(buildCommon.requireJs)
      .then(buildCommon.requireJsEs5)
      .then(buildCommon.copyMainJs)
      .then(buildCommon.cleanTemp)
      .then(buildCommon.cleanTypescript)
      .then(data => resolve(data))
      .catch(err => reject(err));
    }
  });
}

function _runCommonBuildTasks(context) {
  return new Promise((resolve, reject) => {
    buildCommon.clean(context)
    .then(data => hookRunner('before_build', data))
    .then(buildCommon.copy)
    .then(buildCommon.copyLibs)
    .then(buildCommon.copyReferenceCca)
    .then(buildCommon.copyLocalCca)
    .then(buildCommon.spriteSvg)
    .then(buildCommon.css)
    .then(buildCommon.typescript)
    .then(buildCommon.injectCdnBundleScript)
    .then(buildCommon.injectTheme)
    .then(buildCommon.copyThemes)
    .then(buildCommon.injectPaths)
    .then(data => resolve(data))
    .catch(err => reject(err));
  });
}

module.exports = function buildWeb(buildType, opts) {
  const context = { buildType, opts, platform: 'web' };
  return new Promise((resolve, reject) => {
    _runCommonBuildTasks(context)
      .then(_runReleaseBuildTasks)
      .then(buildCommon.runAllComponentHooks)
      .then(data => hookRunner('after_build', data))
      .then((data) => {
        resolve(data);
      })
      .catch(err => reject(err));
  });
};
