/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const CONSTANTS = require('./constants');

const npmCopy = module.exports = {};

/**
 * # npmCopy
 * To align with Jet's 3rd party library directory structure, this config will copy from its
 * original npm location to specific path with the file name being modified to include the
 * version string.
 */


npmCopy.getCopyLibFileList = function (platform) {
  const destPrefix = _getDestPrefix(platform);
  const srcPrefix = 'node_modules/';
  const versions = _getVersionsObj();

  const fileConfig = {
    'requirejs-text/text.js': 'require/text.js',
    'requirejs/require.js': 'require/require.js',
    'es6-promise/dist/es6-promise.js': 'es6-promise/es6-promise.js',
    'hammerjs/hammer.js': `hammer/hammer-${versions.hammerjs}.js`,
    'signals/dist/signals.js': 'js-signals/signals.js',
    'knockout/build/output/knockout-latest.debug.js': `knockout/knockout-${versions.knockout}.debug.js`,
    'jquery/dist/jquery.js': `jquery/jquery-${versions.jquery}.js`,
    'proj4/dist/proj4-src.js': 'proj4js/dist/proj4-src.js',
    'require-css/css.js': 'require-css/css.js',
    'webcomponents.js/CustomElements.js': 'webcomponents/CustomElements.js',

    'es6-promise/dist/es6-promise.min.js': 'es6-promise/es6-promise.min.js',
    'hammerjs/hammer.min.js': `hammer/hammer-${versions.hammerjs}.min.js`,
    'signals/dist/signals.min.js': 'js-signals/signals.min.js',
    'knockout/build/output/knockout-latest.js': `knockout/knockout-${versions.knockout}.js`,
    'jquery/dist/jquery.min.js': `jquery/jquery-${versions.jquery}.min.js`,
    'proj4/dist/proj4.js': 'proj4js/dist/proj4.js',
    'require-css/css.min.js': 'require-css/css.min.js',
    'webcomponents.js/CustomElements.min.js': 'webcomponents/CustomElements.min.js',
  };

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
      fs.renameSync(path.join(themePath, platform, key), path.join(themePath, platform, fileList[key]));
    });
  });
};

npmCopy.getLibsList = function (paths) {
  const versions = _getVersionsObj();
  const copyFileListConfig = {
    fileList: [
      {
        cwd: 'node_modules/oraclejet/dist/css/alta',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/web`
      },
      {
        cwd: 'node_modules/oraclejet/dist/css/alta-windows',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/windows`
      },
      {
        cwd: 'node_modules/oraclejet/dist/css/alta-android',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/android`
      },
      {
        cwd: 'node_modules/oraclejet/dist/css/alta-ios',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/ios`
      },
      {
        cwd: 'node_modules/oraclejet/dist/css/common',
        src: ['**'],
        dest: `${paths.staging.themes}/alta/common`
      },
      { 
        buildType: 'dev',
        cwd: 'node_modules/oraclejet/dist/js/libs/oj',
        src: ['*', 'debug/**', 'resources/**'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/oj/v${versions.oraclejet}`
      },
      {
        cwd: 'node_modules/oraclejet/dist/js/libs/oj',
        src: ['*', 'min/**', 'resources/**'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/oj/v${versions.oraclejet}`
      },
      {
        cwd: 'node_modules/oraclejet/dist/js/libs/oj/resources/nls',
        src: ['*.js'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs/oj/v${versions.oraclejet}/resources/root`
      },
      {
        cwd: 'node_modules/oraclejet/dist/js/libs',
        src: ['proj4js/**', 'webcomponents/**', 'require-css/**', 'dnd-polyfill/**'],
        dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs`
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
