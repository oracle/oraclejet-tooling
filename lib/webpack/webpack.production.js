/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const zlib = require('zlib');
const ojetUtils = require('../util');
const common = require('./webpack.common.js');

const { merge } = ojetUtils.requireLocalFirst('webpack-merge');
const webpack = ojetUtils.requireLocalFirst('webpack');
const MiniCssExtractPlugin = ojetUtils.requireLocalFirst('mini-css-extract-plugin');
const CompressionPlugin = ojetUtils.requireLocalFirst('compression-webpack-plugin');
const configPaths = ojetUtils.getConfiguredPaths();

module.exports = merge(common, {
  mode: 'production',
  devtool: 'source-map',
  output: {
    filename: '[name].[fullhash].js',
    chunkFilename: '[name].[fullhash].js',
    path: path.resolve(configPaths.staging.web),
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader'
        ],
      },
    ],
  },
  resolve: {
    alias: {
      'oj-c': '@oracle/oraclejet-core-pack/oj-c/min'
    }
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
    new MiniCssExtractPlugin(),
    new webpack.optimize.ModuleConcatenationPlugin(),
  ],
});
