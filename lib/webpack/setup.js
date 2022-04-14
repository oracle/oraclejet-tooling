/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');

const ojetUtils = require('../util');
const webpackUtils = require('./utils');
const config = require('../config');
const valid = require('../validations');
const generateComponentsCache = require('../buildCommon/generateComponentsCache');
const constants = require('../constants');

function createContext({ options, platform }) {
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

module.exports = ({ options, platform }) => {
  const context = createContext({ options, platform });
  config.set('componentsCache', generateComponentsCache({ context }));
  let webpackConfig;
  if (context.buildType === 'release') {
    // In the release mode, the ./src/index.html file is minified. This process
    // removes the <!-- css: redwood --> tag before the appropriate redwood css
    // files link is injected. No tag, no injecting the link in ./web/index.html.
    // So, we inject the link right before the minification process happens to ensure
    // that the link is present in ./web/index.html.
    webpackUtils.injectRedwoodThemeFileLink(context);
    // eslint-disable-next-line global-require
    webpackConfig = require('./webpack.production');
  } else {
    // eslint-disable-next-line global-require
    webpackConfig = require('./webpack.development');
  }
  const pathToOjetConfig = path.resolve(constants.PATH_TO_OJET_CONFIG);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const ojetConfig = require(pathToOjetConfig);
  if (ojetConfig.webpack) {
    webpackConfig = ojetConfig.webpack({ context, config: webpackConfig }) || webpackConfig;
  }
  return {
    webpack: ojetUtils.requireLocalFirst('webpack'),
    webpackConfig
  };
};
