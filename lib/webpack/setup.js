/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const fs = require('fs-extra');
const ojetUtils = require('../util');
const webpackUtils = require('./utils');
const config = require('../config');
const valid = require('../validations');
const generateComponentsCache = require('../buildCommon/generateComponentsCache');
const constants = require('../constants');
const buildCommon = require('../buildCommon');

const configPaths = ojetUtils.getConfiguredPaths();

function createContext({
  options,
  platform
}) {
  config.loadOraclejetConfig(platform);
  const validPlatform = valid.platform(platform);
  const validOptions = valid.buildOptions(options, validPlatform);
  const validBuildType = valid.buildType(validOptions);
  return {
    buildType: validBuildType,
    opts: validOptions,
    platform: validPlatform
  };
}

module.exports = ({
  options,
  platform
}) => {
  const context = createContext({
    options,
    platform
  });
  config.set('componentsCache', generateComponentsCache({
    context
  }));
  let webpackConfig;
  if (context.buildType === 'release') {
    // eslint-disable-next-line global-require
    webpackConfig = require('./webpack.production');
  } else {
    // eslint-disable-next-line global-require
    webpackConfig = require('./webpack.development');
  }

  // Process theme files and copy them to staging:
  buildCommon.copy(context);
  buildCommon.copyLibs(context);
  buildCommon.css(context);
  buildCommon.copyThemes(context);
  webpackUtils.copyRequiredAltaFilesToStaging(context);

  const entryFilesArray = webpackConfig.entry.main;
  const masterJSON = ojetUtils.readPathMappingJson();
  const themeStyleArray = webpackUtils.getThemeStyleArray(context);
  const pathToAppCSS = webpackUtils.getAppCssFilesPath(context);
  // Add path to app.css or app-min.css as part of the entry files:
  entryFilesArray.push(pathToAppCSS);
  // Add path(s) to the chosen theme(s) as entry point as well:
  if (masterJSON.use === 'cdn') {
    // Add a configuration to ensure that webpack resolves CDN links if CDN is used:
    webpackConfig.externalsType = 'script';
    webpackConfig.externals = { packageName: themeStyleArray };
  } else if (masterJSON.use === 'local') {
    themeStyleArray.forEach((theme) => {
      const pathToThemeInWeb = path.resolve(configPaths.staging.web, theme);
      if (fs.existsSync(pathToThemeInWeb)) {
        entryFilesArray.push(pathToThemeInWeb);
      }
    });
  }

  const pathToOjetConfig = path.resolve(constants.PATH_TO_OJET_CONFIG);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const ojetConfig = require(pathToOjetConfig);
  if (ojetConfig.webpack) {
    webpackConfig = ojetConfig.webpack({
      context,
      config: webpackConfig
    }) || webpackConfig;
  }
  return {
    webpack: ojetUtils.requireLocalFirst('webpack'),
    webpackConfig
  };
};
