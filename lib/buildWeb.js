/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const buildCommon = require('./buildCommon');

function _runReleaseBuildTasks(context) {
  return new Promise((resolve, reject) => {
    const opts = context.opts;
    if (opts.buildType !== 'release') {
      resolve(context);
    } else {
      buildCommon.uglify(context)
      .then(buildCommon.requireJs)
      .then(buildCommon.cleanTemp)
      .then((data) => resolve(data))
      .catch(err => reject(err));
    }
  });
}

function _runCommonBuildTasks(context) {
  return new Promise((resolve, reject) => {
    buildCommon.clean(context)
      .then(buildCommon.copy)
      .then(buildCommon.sass)
      .then(buildCommon.injectTheme)
      .then(buildCommon.copyThemes)
      .then(buildCommon.injectPaths)
      .then((data) => resolve(data))
      .catch(err => reject(err));
  });
}

module.exports = function buildWeb(buildType, opts) {
  const context = { buildType, opts, platform: 'web' };

  return new Promise((resolve, reject) => {
    _runCommonBuildTasks(context)
      .then(_runReleaseBuildTasks)
      .then((data) => resolve(data))
      .catch(err => reject(err));
  });
};
