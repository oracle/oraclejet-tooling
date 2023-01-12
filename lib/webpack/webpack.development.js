/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const ojetUtils = require('../util');
const webpackUtils = require('./utils');
const common = require('./webpack.common.js');

const PreactRefreshPlugin = ojetUtils.requireLocalFirst('@prefresh/webpack');
const {
  merge
} = ojetUtils.requireLocalFirst('webpack-merge');
const configPaths = ojetUtils.getConfiguredPaths();

module.exports = merge(common, {
  mode: 'development',
  output: {
    filename: 'js/[name].bundle.js',
    clean: true
  },
  devServer: {
    static: [{
      directory: path.join(webpackUtils.oracleJetDistCssPath, 'redwood'),
      publicPath: `/${configPaths.src.styles}/redwood`,
    },
    {
      directory: path.join(webpackUtils.oracleJetDistCssPath, 'common'),
      publicPath: `/${configPaths.src.styles}/common`,
    },
    ],
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
    compress: true,
    port: 8000,
    open: true,
    hot: true,
  },
  plugins: [
    new PreactRefreshPlugin()
  ],
});
