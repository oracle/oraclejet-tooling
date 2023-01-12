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
const MiniCssExtractPlugin = ojetUtils.requireLocalFirst('mini-css-extract-plugin');
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
  module: {
    rules: [{
      test: /\.css$/i,
      use: [
        MiniCssExtractPlugin.loader,
        'css-loader',
        {
          loader: 'css-fix-url-loader',
          // There is no path to images/../../redwood/images/<avatar[id].png>.
          // Enable webpack to resolve it as images/<avatar[id].png>.
          options: {
            from: 'images/../../redwood/images',
            to: 'images',
          }
        },
        {
          loader: 'css-fix-url-loader',
          // There is no 'images' folder under the created theme's folder.
          // Redirect the path to the alta's images subfolder.
          options: {
            from: 'images/animated-overlay.gif',
            to: `../../../alta/${ojetUtils.getJETVersion()}/common/images/animated-overlay.gif`,
          }
        },
        {
          loader: 'css-fix-url-loader',
          options: {
            from: '../../css/redwood/images/AI-Sparkle.gif',
            to: './images/AI-Sparkle.gif',
          }
        },
      ],
    }],
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
    new MiniCssExtractPlugin({
      filename: `${configPaths.src.styles}/[name].[fullhash].css`
    }),
    new webpack.optimize.ModuleConcatenationPlugin(),
    new CleanWebpackPlugin({
      cleanAfterEveryBuildPatterns: ['web/**'],
      dry: true,
      verbose: true,
    })
  ],
});
