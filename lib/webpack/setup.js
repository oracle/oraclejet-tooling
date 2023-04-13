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
const generateComponentsCache = require('../buildCommon/generateComponentsCache');
const constants = require('../constants');

const configPaths = ojetUtils.getConfiguredPaths();

module.exports = ({
  options,
  platform
}) => {
  const context = webpackUtils.createContext({
    options,
    platform
  });
  config.set('componentsCache', generateComponentsCache({
    context
  }));
  let webpackConfig;
  config.set('_context', context);
  if (context.buildType === 'release') {
    // eslint-disable-next-line global-require
    webpackConfig = require('./webpack.production');
  } else {
    // eslint-disable-next-line global-require
    webpackConfig = require('./webpack.development');
  }

  // Process theme files and copy them to staging:
  webpackUtils.copyRequiredAltaFilesToStaging(context);

  const themeStyleArray = webpackUtils.getThemeStyleArray(context);
  if (themeStyleArray.length !== 0) {
    webpackConfig.entry.styles = [];
    // Add path(s) to the chosen theme(s) as entry point as well:
    themeStyleArray.forEach((theme) => {
      const pathToThemeInWeb = path.resolve(configPaths.staging.web, theme);
      if (fs.existsSync(pathToThemeInWeb)) {
        webpackConfig.entry.styles.push(pathToThemeInWeb);
      }
    });
  }

  // Add path to app.css or app-min.css as part of the entry files:
  const pathToAppCSS = webpackUtils.getAppCssFilesPath(context);
  if (fs.existsSync(pathToAppCSS)) {
    webpackConfig.entry.app = pathToAppCSS;
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
