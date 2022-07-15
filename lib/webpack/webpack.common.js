/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const ojetUtils = require('../util');
const webpackUtils = require('./utils');
// eslint-disable-next-line import/no-dynamic-require
const WebpackRequireFixupPlugin = require(path.join(webpackUtils.oracleJetDistPath, 'webpack-tools/plugins/WebpackRequireFixupPlugin'));

const HtmlWebpackPlugin = ojetUtils.requireLocalFirst('html-webpack-plugin');
const HtmlReplaceWebpackPlugin = ojetUtils.requireLocalFirst('html-replace-webpack-plugin');
const CopyPlugin = ojetUtils.requireLocalFirst('copy-webpack-plugin');
const webpack = ojetUtils.requireLocalFirst('webpack');

const configPaths = ojetUtils.getConfiguredPaths();
const isTypescriptApplication = ojetUtils.isTypescriptApplication();

module.exports = {
  entry: webpackUtils.getEntryFilePath(),
  output: {
    path: path.resolve(configPaths.staging.web),
    clean: true
  },
  module: {
    rules: [{
      test: /\.(png|jpg|jpeg|svg|gif)$/i,
      type: 'asset',
    },
    {
      test: /\.css$/i,
      use: [
        'style-loader',
        'css-loader'
      ],
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
    }],
  },
  resolve: {
    modules: [webpackUtils.localComponentsPath, webpackUtils.exchangeComponentsPath, 'node_modules'],
    extensions: ['.ts', '.tsx', '.js', '.css'],
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      ojdnd: path.join(
        webpackUtils.oracleJetDistJsLibsPath, 'dnd-polyfill/dnd-polyfill-1.0.2'
      ),
      signals: path.resolve('./node_modules/signals/dist/signals.js'),
      touchr: path.join(
        webpackUtils.oracleJetDistJsLibsPath, 'touchr/touchr'
      ),
      'jqueryui-amd': path.resolve('./node_modules/jquery-ui/ui'),
      ojs: path.join(
        webpackUtils.oracleJetDistJsLibsPath, 'oj/debug'
      ),
      ojtranslations: path.join(
        webpackUtils.oracleJetDistJsLibsPath, 'oj/resources'
      ),
      '@oracle/oraclejet-preact': path.join(
        webpackUtils.oracleJetDistJsLibsPath, 'oraclejet-preact/amd'
      )
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
      'ojs/ojcss': 'noop-loader'
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(configPaths.src.common, 'index.html'),
    }),
    new HtmlReplaceWebpackPlugin(
      [{
        pattern: webpackUtils.htmlEndInjectorTokenPattern,
        replacement: webpackUtils.htmlTokenReplacementFunction
      },
      {
        pattern: webpackUtils.htmlTokenPattern,
        replacement: webpackUtils.htmlTokenReplacementFunction
      },
      {
        pattern: '<!-- This injects script tags for the main javascript files -->',
        replacement: ''
      }]),
    new CopyPlugin({
      patterns: [{
        from: path.resolve(configPaths.src.common, configPaths.src.styles),
        to: path.resolve(configPaths.staging.web, configPaths.src.styles),
      },
      {
        from: path.join(
          webpackUtils.oracleJetDistCssPath,
          'redwood'
        ),
        to: path.resolve(configPaths.staging.web, configPaths.src.styles, 'redwood'),
      },
      {
        from: path.join(
          webpackUtils.oracleJetDistCssPath,
          'common'
        ),
        to: path.resolve(configPaths.staging.web, configPaths.src.styles, 'common'),
      }],
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
