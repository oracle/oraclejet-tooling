/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const CONSTANTS = require('./constants');
const util = require('./util');
const configGenerator = require('./rjsConfigGenerator');

module.exports = {};
const npmCopy = module.exports;

/**
 * # npmCopy
 * To align with Jet's 3rd party library directory structure, this config will copy from its
 * original npm location to specific path with the file name being modified to include the
 * version string.
 */
npmCopy.getNonMappingFileList = function (buildType, platform) {
  const srcPrefix = 'node_modules/';
  const destPrefix = platform === 'web' ?
    `${config('paths').staging.web}/${config('paths').src.javascript}/libs`
    : `${config('paths').staging.hybrid}/www/${config('paths').src.javascript}/libs`;
  const cssSrcPrefix = 'node_modules/@oracle/oraclejet/dist/css/';
  let nonMappingList = [];
  const versions = util.getLibVersionsObj();
  if (!util.getInstalledCssPackage()) {
    if (config('defaultTheme') === CONSTANTS.DEFAULT_PCSS_THEME) {
      nonMappingList = [
        {
          cwd: `${srcPrefix}requirejs`,
          src: ['*.js'],
          dest: `${destPrefix}/require`
        },
        {
          cwd: `${cssSrcPrefix}alta`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/web`
        },
        {
          cwd: `${cssSrcPrefix}alta-windows`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/windows`
        },
        {
          cwd: `${cssSrcPrefix}alta-android`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/android`
        },
        {
          cwd: `${cssSrcPrefix}alta-ios`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/ios`
        },
        {
          cwd: `${cssSrcPrefix}common`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/common`
        },
        {
          cwd: `${srcPrefix}@oracle/oraclejet/dist/js/libs/oj/resources/nls`,
          src: ['*.js'],
          dest: `${config('paths').staging.stagingPath}/${config('paths').src.javascript}/libs/oj/v${versions.ojs}/resources/root`
        },
        {
          cwd: `${cssSrcPrefix}redwood`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/redwood/web`
        },
        {
          cwd: `${cssSrcPrefix}stable`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/stable/web`
        }
      ];
    } else {
      nonMappingList = [
        {
          cwd: `${srcPrefix}requirejs`,
          src: ['*.js'],
          dest: `${destPrefix}/require`
        },
        {
          cwd: `${cssSrcPrefix}alta`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/web`
        },
        {
          cwd: `${cssSrcPrefix}alta-windows`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/windows`
        },
        {
          cwd: `${cssSrcPrefix}alta-android`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/android`
        },
        {
          cwd: `${cssSrcPrefix}alta-ios`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/ios`
        },
        {
          cwd: `${cssSrcPrefix}common`,
          src: ['**'],
          dest: `${config('paths').staging.themes}/alta/common`
        },
        {
          cwd: `${srcPrefix}@oracle/oraclejet/dist/js/libs/oj/resources/nls`,
          src: ['*.js'],
          dest: `${config('paths').staging.stagingPath}/${config('paths').src.javascript}/libs/oj/v${versions.ojs}/resources/root`
        }
      ];
    }
  } else {
    nonMappingList = [
      {
        cwd: `${srcPrefix}requirejs`,
        src: ['*.js'],
        dest: `${destPrefix}/require`
      },
      {
        cwd: `${cssSrcPrefix}redwood`,
        src: ['**'],
        dest: `${config('paths').staging.themes}/redwood/web`
      },
      {
        cwd: `${cssSrcPrefix}stable`,
        src: ['**'],
        dest: `${config('paths').staging.themes}/stable/web`
      },
      {
        cwd: `${srcPrefix}@oracle/oraclejet/dist/js/libs/oj/resources/nls`,
        src: ['*.js'],
        dest: `${config('paths').staging.stagingPath}/${config('paths').src.javascript}/libs/oj/v${versions.ojs}/resources/root`
      }
    ];
  }

  nonMappingList = util.getFileList(buildType, nonMappingList);

  return nonMappingList;
};

function _getDestPrefix(platform) {
  return platform === 'web' ?
    `${config('paths').staging.web}` : `${config('paths').staging.hybrid}/www`;
}

function _getValidLibObj(buildType, libName, libObj, base, platform) {
  let cwd = libObj.cwd;
  if (libObj[buildType].cwd !== undefined) cwd = path.join(libObj.cwd, libObj[buildType].cwd);
  const src = Array.isArray(libObj[buildType].src)
    ? libObj[buildType].src : [libObj[buildType].src];
  const dest = _getValidDestFromPathMapping(libObj[buildType], libName, base, platform);
  if (_needRename(libObj[buildType].src, dest)) {
    const rename = function (pathPrefix) {
      const fileName = path.basename(_processVersionToken(libName, libObj[buildType].path));
      return path.join(pathPrefix, fileName);
    };
    return { cwd, src, dest, rename };
  }
  return { cwd, src, dest };
}

function _needRename(src, dest) {
  // when the provided src is a single file, and the requirejs path has a different name
  // example in node moduels, the lib is jquery.js, but the path is jquery-3.3.1.js
  if (Array.isArray(src)) return false;
  return path.basename(src) !== path.basename(dest);
}

function _getValidDestFromPathMapping(libObj, libName, base, platform) {
  let dest = (path.extname(libObj.path) === '' || path.extname(libObj.path) === '.min')
    ? libObj.path : path.join(libObj.path, '..');
  dest = _processVersionToken(libName, dest);
  return path.join(_getDestPrefix(platform), base, dest);
}

function _processVersionToken(libName, destPath) {
  const versions = util.getLibVersionsObj();

  return Object.keys(versions).indexOf(libName) !== -1
    ? destPath.replace(CONSTANTS.PATH_MAPPING_VERSION_TOKEN, versions[libName]) : destPath;
}

function _needCopyTask(buildType, lib, libObj) {
  if (!libObj[buildType]) {
    util.log.error(`The path mapping entry (${lib}) is missing an entry for the \"${buildType}\" property. Build failed.`); // eslint-disable-line
  }
  return Object.prototype.hasOwnProperty.call(libObj[buildType], 'src');
}

npmCopy.renameAltaThemeFiles = function (paths) {
  if (!util.getInstalledCssPackage()) {
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

    if (config('defaultTheme') === CONSTANTS.DEFAULT_PCSS_THEME) {
      const redwoodfileList = {
        'oj-redwood.css': 'redwood.css',
        'oj-redwood-min.css': 'redwood.min.css'
      };
      const redwoodthemePath = path.join(paths.staging.themes, CONSTANTS.DEFAULT_PCSS_THEME);
      Object.keys(redwoodfileList).forEach((key) => {
        fs.renameSync(path.join(redwoodthemePath, 'web', key),
          path.join(redwoodthemePath, 'web', redwoodfileList[key]));
      });

      const stablefileList = {
        'oj-stable.css': 'stable.css',
        'oj-stable-min.css': 'stable.min.css'
      };
      const stablethemePath = path.join(paths.staging.themes, CONSTANTS.DEFAULT_STABLE_THEME);
      Object.keys(stablefileList).forEach((key) => {
        fs.renameSync(path.join(stablethemePath, 'web', key),
          path.join(stablethemePath, 'web', stablefileList[key]));
      });
    }
  } else {
    const fileList = {
      'oj-redwood.css': 'redwood.css',
      'oj-redwood-min.css': 'redwood.min.css'
    };

    const themePath = path.join(paths.staging.themes, CONSTANTS.DEFAULT_PCSS_THEME);
    Object.keys(fileList).forEach((key) => {
      fs.renameSync(path.join(themePath, 'web', key),
        path.join(themePath, 'web', fileList[key]));
    });
    const stablefileList = {
      'oj-stable.css': 'stable.css',
      'oj-stable-min.css': 'stable.min.css'
    };

    const stablethemePath = path.join(paths.staging.themes, CONSTANTS.DEFAULT_STABLE_THEME);
    Object.keys(stablefileList).forEach((key) => {
      fs.renameSync(path.join(stablethemePath, 'web', key),
        path.join(stablethemePath, 'web', stablefileList[key]));
    });
  }
};

npmCopy.getMappingLibsList = function (buildMode, platform) {
  const buildType = buildMode === 'release' ? 'release' : 'debug';
  const libsList = [];
  const masterJson = util.readPathMappingJson();
  const basePath = masterJson.baseUrl;
  Object.keys(masterJson.libs).forEach((lib) => {
    const libObj = masterJson.libs[lib];
    const isCdn = configGenerator.isCdnPath(
      libObj,
      masterJson.use,
      masterJson.cdns,
      buildType,
      lib
    );
    // Skip copy the library if it uses cdn
    if (!isCdn && _needCopyTask(buildType, lib, libObj)) {
      libsList.push(_getValidLibObj(buildType, lib, libObj, basePath, platform));
    }
  });
  return libsList;
};
