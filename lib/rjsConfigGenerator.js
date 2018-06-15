/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

const path = require('path');
const util = require('./util');
const CONSTANTS = require('./constants');

function _getPathMappingObj(buildType, masterJson) {
  const obj = {};
  const useCdn = masterJson.use;
  Object.keys(masterJson.libs).forEach((lib) => {
    const libPath = _getLibPath(buildType, masterJson.libs[lib], useCdn, masterJson.cdns, lib);
    if (libPath) obj[lib] = libPath;
  });
  return obj;
}

function _getLibPath(buildType, libObj, useCdn, cdnUrls, libName) {
  // if user defines cdn path and set use to "cdn" in path_mapping.json
  //  prefer to use cdn path over local path
  if (_isCdnPath(libObj, useCdn, cdnUrls, buildType)) {
    // if the lib's cdn reference points to a bundles-config
    if (_isCdnBundle(libObj, cdnUrls)) {
      return null;
    }

    const prefix = typeof cdnUrls[libObj.cdn] === 'object'
      ? cdnUrls[libObj.cdn].prefix : cdnUrls[libObj.cdn];

    return `${prefix}/${libObj[buildType].cdnPath}`;
  }

  let libPath = _processVersionToken(libName, libObj[buildType].path);
  if (path.extname(libPath) === '.js') {
    libPath = path.join(libPath, '..', path.basename(libPath, path.extname(libPath)));
  }
  return libPath;
}

function _isCdnPath(libObj, useCdn, cdnUrls, buildType) {
  return (useCdn === 'cdn'
    && libObj.cdn !== undefined
    && cdnUrls[libObj.cdn] !== undefined
    && libObj[buildType].cdnPath !== undefined);
}

function _isCdnBundle(libObj, cdnUrls) {
  const cdnName = (libObj.cdn === '3rdParty') ? 'jet' : libObj.cdn;
  return (typeof cdnUrls[cdnName] === 'object' && cdnUrls[cdnName].config && cdnUrls[cdnName].config.length > 0);
}

function _processVersionToken(libName, libPath) {
  const versions = util.getLibVersionsObj();
  return Object.keys(versions).indexOf(libName) !== -1
    ? libPath.replace(CONSTANTS.PATH_MAPPING_VERSION_TOKEN, versions[libName]) : libPath;
}


function _getRJsConfig(buildType, masterJson, config) {
  // Update the requirejs optimizer config to skip bundling any cdn resouces
  const newConfig = config;
  const useCdn = masterJson.use;
  Object.keys(masterJson.libs).forEach((lib) => {
    if (_isCdnPath(masterJson.libs[lib], useCdn, masterJson.cdns, buildType)) {
      if (config.paths === undefined) {
        newConfig.paths = {};
      }
      newConfig.paths[lib] = 'empty:';
    }
  });
  return newConfig;
}

module.exports = {
  getPathsMapping: function _getPathsMapping(context) {
    const masterJson = util.readPathMappingJson();
    const buildType = context.buildType === 'release' ? 'release' : 'debug';
    return _getPathMappingObj(buildType, masterJson);
  },

  updateRJsOptimizerConfig: function _updateRJsOptimizer(context) {
    const masterJson = util.readPathMappingJson();
    const config = context.opts.requireJs;
    const buildType = context.buildType === 'release' ? 'release' : 'debug';
    return _getRJsConfig(buildType, masterJson, config);
  }
};
