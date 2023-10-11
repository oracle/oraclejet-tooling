/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const ojetUtils = require('../util');
const webpackUtils = require('./utils');
// eslint-disable-next-line import/no-dynamic-require
const WebpackRequireFixupPlugin = require(path.join(webpackUtils.oracleJetDistPath, 'webpack-tools/plugins/WebpackRequireFixupPlugin'));

const WebpackCopyPlugin = ojetUtils.requireLocalFirst('copy-webpack-plugin');
const HtmlWebpackPlugin = ojetUtils.requireLocalFirst('html-webpack-plugin');
const MiniCssExtractPlugin = ojetUtils.requireLocalFirst('mini-css-extract-plugin');
const HtmlReplaceWebpackPlugin = ojetUtils.requireLocalFirst('html-replace-webpack-plugin');
const webpack = ojetUtils.requireLocalFirst('webpack');
const configPaths = ojetUtils.getConfiguredPaths();
const isTypescriptApplication = ojetUtils.isTypescriptApplication();

module.exports = {
  entry: webpackUtils.getEntryObject(),
  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        commons: {
          test: /[\\/]node_modules[\\/]/,
          name: 'libs/index',
          chunks: 'all',
        },
      },
    },
  },
  output: {
    path: path.resolve(configPaths.staging.web),
    clean: true,
    environment: {
      module: true,
      dynamicImport: true,
    }
  },
  module: {
    rules: [{
      sideEffects: true
    },
    {
      test: /\.(png|jpg|jpeg|svg|gif|ico)$/i,
      type: 'asset',
      generator: {
        filename: `${configPaths.src.styles}/dynamicImages/[hash][ext][query]`
      }
    },
    {
      test: /\.(css|sass|scss)$/i,
      use: [
        MiniCssExtractPlugin.loader,
        'css-loader',
        'sass-loader',
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
        // There is no path to ../../css/redwood/images/AI-Sparkle.gif.
        // Configure webpack to resolve it as ./images/AI-Sparkle.gif.
        {
          loader: 'css-fix-url-loader',
          options: {
            from: '../../css/redwood/images/AI-Sparkle.gif',
            to: './images/AI-Sparkle.gif',
          }
        },
        {
          loader: 'css-fix-url-loader',
          // There is no path to ./images/<avatar[id].png>.
          // Enable webpack to resolve it as ../../../images/<avatar[id].png>.
          options: {
            from: './images',
            to: '../../../images',
          }
        }
      ]
    },
    {
      test: /\.tsx?/,
      loader: 'ts-loader',
      exclude: /node_modules/,
      options: {
        getCustomTransformers: program => ({
          before: [
            // eslint-disable-next-line global-require
            require('./custom-tsc').metadataTransformer(program),
            // eslint-disable-next-line global-require
            require('./custom-tsc').decoratorTransformer(program)
          ]
        })
      }
    },
    {
      // disabling default webpack's JSON-handling for web components which use
      // text! to import *.json files
      test: resource => (/\.json$/i.test(resource) && webpackUtils.isWebComponent(resource)),
      type: 'javascript/auto'
    }
    ],
  },
  resolve: {
    modules: [webpackUtils.localComponentsPath, webpackUtils.exchangeComponentsPath, 'node_modules'],
    extensions: ['.ts', '.tsx', '.js', '.css'],
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      ojdnd: '@oracle/oraclejet/dist/js/libs/dnd-polyfill/dnd-polyfill-1.0.2',
      signals: 'signals/dist/signals.js',
      touchr: '@oracle/oraclejet/dist/js/libs/touchr/touchr',
      'jqueryui-amd': '@oracle/oraclejet/dist/js/libs/jquery/jqueryui-amd-1.13.2',
      ojs: '@oracle/oraclejet/dist/js/libs/oj/debug',
      ojtranslations: '@oracle/oraclejet/dist/js/libs/oj/resources',
      'oj-c': '@oracle/oraclejet-core-pack/oj-c'
    },
  },
  resolveLoader: {
    modules: [
      'node_modules',
      path.join(
        webpackUtils.oracleJetDistPath,
        'webpack-tools',
        'loaders'
      ),
    ],
    alias: {
      ojL10n: 'ojL10n-loader',
      text: 'raw-loader?esModule=false',
      css: 'noop-loader',
      ojcss: 'noop-loader',
      'ojs/ojcss': 'noop-loader',
    }
  },
  plugins: [
    new WebpackCopyPlugin({
      patterns: webpackUtils.getCopyPluginPatterns()
    }),
    new HtmlWebpackPlugin({
      template: path.join(configPaths.src.common, 'index.html'),
      inject: 'body'
    }),
    new HtmlReplaceWebpackPlugin(
      [
        {
          pattern: '<!-- Link-tag flag that webpack replaces with theme style links during build time -->',
          replacement: '<!-- Default style files for theming and app style -->'
        },
        {
          pattern: '<link rel="stylesheet">',
          replacement: webpackUtils.getStyleLinkTags()
        }
      ]),
    new MiniCssExtractPlugin({
      filename: `${configPaths.src.styles}/[name].[fullhash].css`
    }),
    // This plugin sets options for the ojL10n-loader (in this case, just the locale name)
    new webpack.LoaderOptionsPlugin({
      options: {
        ojL10nLoader: {
          locale: 'en-US',
        },
      },
    }),
    new webpack.ProvidePlugin({
      $: 'jquery',
      jQuery: 'jquery',
    }),
    new WebpackRequireFixupPlugin({
      ojModuleResources: {
        // The path to the root folder where the application-level (as opposed to relative)
        // ojModule/<oj-module> views and viewModels are located
        root: webpackUtils.getRootPath(),

        // view settings for ojModule and <oj-module>
        view: {
          prefix: 'text!',
          // regular expression for locating all views under the root folder
          match: '^\\./views/.+\\.html$',
        },
        // viewModel sttings for ojModule and <oj-module>
        viewModel: {
          // regular expression for locating all viewModels under the root folder
          match: isTypescriptApplication ? '^\\./viewModels/.+\\.ts$' : '^\\./viewModels/.+\\.js$',
          // Webpack search for lazy modules does not add '.js' extension automatically,
          // so we need to specify it explicitly
          addExtension: isTypescriptApplication ? '.ts' : '.js',
        },
      },
      // Point this setting to the root folder for the associated JET distribution
      // (could be a CDN). Used by the oj.Config.getResourceUri() call
      baseResourceUrl: `${configPaths.staging.web}/${configPaths.src.javascript}/libs/oj/${ojetUtils.getJETVersionV(ojetUtils.getJETVersion())}`,
    }),
  ],
};
