/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const CONSTANTS = require('./constants');
const util = require('./util');

module.exports = {};
const npmCopy = module.exports;

/**
 * # npmCopy
 * To align with Jet's 3rd party library directory structure, this config will copy from its
 * original npm location to specific path with the file name being modified to include the
 * version string.
 */


npmCopy.getCopyLibFileList = function (platform, buildType) {
  const destPrefix = _getDestPrefix(platform);
  const srcPrefix = 'node_modules/';
  const versions = _getVersionsObj();

  let fileConfig = {
    'requirejs-text/text.js': 'require/text.js',
    'requirejs/require.js': 'require/require.js',
    'es6-promise/dist/es6-promise.js': 'es6-promise/es6-promise.js',
    'es6-promise/dist/es6-promise.map': 'es6-promise/es6-promise.map',
    'hammerjs/hammer.js': `hammer/hammer-${versions.hammerjs}.js`,
    'signals/dist/signals.js': 'js-signals/signals.js',
    'knockout/build/output/knockout-latest.debug.js': `knockout/knockout-${versions.knockout}.debug.js`,
    'jquery/dist/jquery.js': `jquery/jquery-${versions.jquery}.js`,
    'proj4/dist/proj4-src.js': 'proj4js/dist/proj4-src.js',
    '@webcomponents/custom-elements/custom-elements.min.js': 'webcomponents/custom-elements.min.js',
    '@webcomponents/custom-elements/custom-elements.min.js.map': 'webcomponents/custom-elements.min.js.map',
    'es6-promise/dist/es6-promise.min.js': 'es6-promise/es6-promise.min.js',
    'es6-promise/dist/es6-promise.min.map': 'es6-promise/es6-promise.min.map',
    'hammerjs/hammer.min.js': `hammer/hammer-${versions.hammerjs}.min.js`,
    'signals/dist/signals.min.js': 'js-signals/signals.min.js',
    'knockout/build/output/knockout-latest.js': `knockout/knockout-${versions.knockout}.js`,
    'jquery/dist/jquery.min.js': `jquery/jquery-${versions.jquery}.min.js`,
    'proj4/dist/proj4.js': 'proj4js/dist/proj4.js',
  };

  const testConfig = {
    'qunit-reporter-junit/qunit-reporter-junit.js': 'qunit/qunit-reporter-junit.js',
    'qunitjs/qunit/qunit.js': 'qunit/qunit.js',
    'qunitjs/qunit/qunit.css': 'qunit/qunit.css',
  };

  const testPath = path.resolve(`${config('paths').src.common}/${config('paths').src.tests}`);
  if (buildType === 'dev' && fs.existsSync(testPath)) fileConfig = Object.assign(fileConfig, testConfig);
  return _getFileList(fileConfig, srcPrefix, destPrefix);
};

function _getFileList(copyConfig, srcPrefix, destPrefix) {
  const fileList = [];
  Object.keys(copyConfig).forEach((key) => {
    const fileObj = _getFileObj(key, copyConfig[key], srcPrefix, destPrefix);
    fileList.push(fileObj);
  });
  return fileList;
}

function _getFileObj(src, dest, srcPrefix, destPrefix) {
  return {
    src: path.join(srcPrefix, src),
    dest: path.join(destPrefix, dest)
  };
}

function _getDestPrefix(platform) {
  return platform === 'web' ?
        `${config('paths').staging.web}/${config('paths').src.javascript}/libs`
        : `${config('paths').staging.hybrid}/www/${config('paths').src.javascript}/libs`;
}

function _getVersionsObj() {
  const versionsObj = {
    oraclejet: _getVersionFromNpm('oraclejet'),
    jquery: _getVersionFromNpm('jquery'),
    jqueryUI: _getVersionFromNpm('jquery-ui'),
    hammerjs: _getVersionFromNpm('hammerjs'),
    knockout: _getVersionFromNpm('knockout'),
  };
  return versionsObj;
}

function _getVersionFromNpm(libPath) {
  if (libPath === 'oraclejet') return util.getJETVersion();
  const packageJSON = fs.readJsonSync(`node_modules/${libPath}/package.json`);
  return packageJSON.version;
}

npmCopy.renameAltaThemeFiles = function (paths) {
  const fileList = {
    'oj-alta.css': 'alta.css',
    'oj-alta-min.css': 'alta.min.css'
  };

  const themePath = path.join(paths.staging.themes, CONSTANTS.DEFAULT_THEME);

  CONSTANTS.SUPPORTED_PLATFORMS.forEach((platform) => {
    Object.keys(fileList).forEach((key) => {
      fs.renameSync(path.join(themePath, platform, key),
        path.join(themePath, platform, fileList[key]));
    });
  });
};

npmCopy.getLibsList = function (paths) {
  const versions = _getVersionsObj();
  const copyFileListConfig = {
    fileList: [
      {
        cwd: 'node_modules/@oracle/oraclejet/dist/css/alta',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/web`
      },
      {
        cwd: 'node_modules/@oracle/oraclejet/dist/css/alta-windows',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/windows`
      },
      {
        cwd: 'node_modules/@oracle/oraclejet/dist/css/alta-android',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/android`
      },
      {
        cwd: 'node_modules/@oracle/oraclejet/dist/css/alta-ios',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/ios`
      },
      {
        cwd: 'node_modules/@oracle/oraclejet/dist/css/common',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/common`
      },
      {
        buildType: 'dev',
        cwd: 'node_modules/@oracle/oraclejet/dist/js/libs/oj',
        src: ['*', 'debug/**', 'resources/**'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/oj/v${versions.oraclejet}`
      },
      {
        cwd: 'node_modules/@oracle/oraclejet/dist/js/libs/oj',
        src: ['*', 'min/**', 'resources/**'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/oj/v${versions.oraclejet}`
      },
      {
        cwd: 'node_modules/@oracle/oraclejet/dist/js/libs/oj/resources/nls',
        src: ['*.js'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/oj/v${versions.oraclejet}/resources/root`
      },
      {
        cwd: 'node_modules/@oracle/oraclejet/dist/js/libs',
        src: ['proj4js/**', 'webcomponents/**', 'require-css/**', 'dnd-polyfill/**'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs`
      },
      {
        buildType: 'dev',
        cwd: 'node_modules/require-css',
        src: ['css.js', 'css-builder.js', 'normalize.js'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/require-css`
      },
      {
        buildType: 'release',
        cwd: 'node_modules/require-css',
        src: ['css.min.js', 'css-builder.js', 'normalize.js'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/require-css`
      },
      {
        buildType: 'dev',
        cwd: 'node_modules/jquery-ui/ui/',
        src: ['*.js', 'widgets/draggable.js', 'widgets/mouse.js', 'widgets/sortable.js'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/jquery/jqueryui-amd-${versions.jqueryUI}`
      },
      {
        buildType: 'release',
        cwd: 'node_modules/jquery-ui/ui/',
        src: ['*.js', 'widgets/draggable.js', 'widgets/mouse.js', 'widgets/sortable.js'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/jquery/jqueryui-amd-${versions.jqueryUI}.min`
      }
    ],
  };
  return copyFileListConfig;
};
