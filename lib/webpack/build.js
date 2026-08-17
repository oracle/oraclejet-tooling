/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const fs = require('fs-extra');
const constants = require('../constants');
const buildCommon = require('../buildCommon');

// fs-extra retries transient Windows EPERM/EBUSY errors that Webpack 5.76 does not.
async function _cleanTypeDefinitions(context, fileSystem, webpackConfig) {
  const output = webpackConfig && webpackConfig.output;
  const stagingPath = context && context.opts && context.opts.stagingPath;
  if (!output || output.clean !== true || typeof output.path !== 'string'
    || typeof stagingPath !== 'string') {
    return;
  }

  const resolvedStagingPath = path.resolve(stagingPath);
  if (path.resolve(output.path) !== resolvedStagingPath) {
    return;
  }

  await fileSystem.remove(path.join(resolvedStagingPath, 'types'));
}

function _runWebpack(webpack, webpackConfig) {
  return new Promise((resolve, reject) => {
    webpack(webpackConfig, (err, stats) => {
      try {
        if (err) {
          console.error(err.stack || err);
          if (err.details) {
            console.error(err.details);
          }
          reject(err);
          return;
        }

        if (!stats) {
          reject(new Error('Webpack compilation did not return build statistics.'));
          return;
        }

        const compilationErrors = stats.compilation && stats.compilation.errors;
        if (compilationErrors && compilationErrors.length > 0) {
          console.error(compilationErrors);
          reject(compilationErrors);
          return;
        }

        console.log(stats.toString());
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function _runBuild(options, dependencies) {
  const {
    ojetUtils,
    setup,
    hookRunner,
    webpackUtils,
    buildCommon: buildCommonUtils,
    fileSystem
  } = dependencies;

  ojetUtils.log('Building with Webpack');
  const initialContext = webpackUtils.createContext({
    options,
    platform: constants.SUPPORTED_WEB_PLATFORM
  });
  const buildContext = await hookRunner('before_build', initialContext);
  const { context, webpack, webpackConfig } = setup(buildContext);
  const isTypescriptApplication = ojetUtils.isTypescriptApplication();

  await buildCommonUtils.buildICUTranslationsBundle(context);
  if (isTypescriptApplication) {
    await _cleanTypeDefinitions(context, fileSystem, webpackConfig);
  }
  await _runWebpack(webpack, webpackConfig);
  await hookRunner('after_build', context);

  if (isTypescriptApplication) {
    webpackUtils.organizeTypeDefinitions();
  }
}

module.exports = (options) => {
  // eslint-disable-next-line global-require
  const ojetUtils = require('../util');
  // eslint-disable-next-line global-require
  const setup = require('./setup');
  // eslint-disable-next-line global-require
  const hookRunner = require('../hookRunner');
  // eslint-disable-next-line global-require
  const webpackUtils = require('./utils');
  const dependencies = {
    ojetUtils,
    setup,
    hookRunner,
    webpackUtils,
    buildCommon,
    fileSystem: fs
  };

  return _runBuild(options, dependencies).catch((error) => {
    ojetUtils.log.error(error);
    throw error;
  });
};

module.exports.__runBuild = _runBuild;
