/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const ojetUtils = require('../util');
const zlib = require('zlib');
const common = require('./webpack.common.js');

const {
  merge
} = ojetUtils.requireLocalFirst('webpack-merge');
const webpack = ojetUtils.requireLocalFirst('webpack');
const CompressionPlugin = ojetUtils.requireLocalFirst('compression-webpack-plugin');
const configPaths = ojetUtils.getConfiguredPaths();
const {
  CleanWebpackPlugin
} = ojetUtils.requireLocalFirst('clean-webpack-plugin');

module.exports = merge(common, {
  mode: 'production',
  devtool: 'source-map',
  output: {
    filename: 'js/[name].[fullhash].js',
    chunkFilename: 'js/[name].[fullhash].js',
    path: path.resolve(configPaths.staging.web),
    clean: true

  },
  plugins: [
    new CompressionPlugin({
      filename: '[path][base].br',
      algorithm: 'brotliCompress',
      test: /\.(js|css|html|svg)$/,
      compressionOptions: {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        },
      },
      threshold: 10240,
      minRatio: 0.8,
      deleteOriginalAssets: false,
    }),
    new webpack.optimize.ModuleConcatenationPlugin(),
    new CleanWebpackPlugin({
      cleanAfterEveryBuildPatterns: ['web/**'],
      dry: true,
      verbose: true,
    })
  ],
});
