/**
  Copyright (c) 2015, 2024, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const ojetUtils = require('../util');
const webpackUtils = require('./utils');
const config = require('../config');
const generateComponentsCache = require('../buildCommon/generateComponentsCache');
const constants = require('../constants');

module.exports = (context) => {
  config.set('componentsCache', generateComponentsCache({
    context
  }));
  config.set('_context', context);
  let webpackConfig;
  if (context.buildType === 'release') {
    // eslint-disable-next-line global-require
    webpackConfig = require('./webpack.production');
  } else {
    // eslint-disable-next-line global-require
    webpackConfig = require('./webpack.development');
  }

  // Process theme files and copy them to staging:
  webpackUtils.copyRequiredAltaFilesToStaging(context);

  const pathToOjetConfig = path.resolve(constants.PATH_TO_OJET_CONFIG);

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const ojetConfig = require(pathToOjetConfig);

  // This will have the new context and webpack config objects if any
  // changes will be made in the ojet.config.js file
  let newConfig;

  if (ojetConfig.webpack) {
    newConfig = ojetConfig.webpack({
      context,
      config: webpackConfig
    }) || webpackConfig;
  }

  return {
    webpack: ojetUtils.requireLocalFirst('webpack'),
    webpackConfig: newConfig.webpack,
    context: newConfig.context
  };
};
