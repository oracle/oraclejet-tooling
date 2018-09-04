/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

const path = require('path');
const util = require('./util');
const CONSTANTS = require('./constants');
const config = require('./config');
const glob = require('glob');

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


function _getRJsConfig(buildType, masterJson, oldConfig) {
  // Update the requirejs optimizer config to skip bundling any cdn resouces
  const newConfig = oldConfig;
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

/**
 * ## _getCcaRJsConfig
 * @private
 * @param {String} buildType
 * @param {Object} config
 * @returns {Object}
 */
function _getCcaRJsConfig(buildType, oldConfig) {
  // Update the requirejs optimizer config to skip bundling any minified cca components
  const newConfig = oldConfig;
  const dependenciesObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`).dependencies;
  if (!dependenciesObj) return newConfig;
  Object.keys(dependenciesObj).forEach((dependency) => {
    const version = _isPack(dependenciesObj[dependency]) ?
      dependenciesObj[dependency].version : dependenciesObj[dependency];
    if (buildType === 'release' && _isMinified(dependency, version)) newConfig.paths[dependency] = 'empty:';
  });
  return newConfig;
}

/**
 * ## _getCcaPathMapping
 * @private
 * @param {String} buildType
 * @returns {Object}
 */
function _getCcaPathMapping(buildType) {
  const pathMappingObj = {};
  const dependenciesObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`).dependencies;
  if (!dependenciesObj) return pathMappingObj;
  Object.keys(dependenciesObj).forEach((dependency) => {
    let dependencyPath = `${CONSTANTS.JET_COMPOSITE_DIRECTORY}/${dependency}`;
    if (_isPack(dependenciesObj[dependency])) {
      const version = dependenciesObj[dependency].version;
      dependencyPath += `/${version}`;
      if (buildType === 'release' && _isMinified(dependency, version)) dependencyPath += '/min';
    } else {
      const version = dependenciesObj[dependency];
      dependencyPath += `/${version}`;
      if (buildType === 'release' && _isMinified(dependency, version)) dependencyPath += '/min';
    }
    pathMappingObj[dependency] = dependencyPath;
  });
  return pathMappingObj;
}

/**
 * ## _getLocalCcaPathMapping
 * @private
 * @returns {Object}
 */
function _getLocalCcaPathMapping() {
  const pathMappingObj = {};
  const basePath = path.join(config('paths').staging.stagingPath, config('paths').src.javascript, config('paths').composites);
  const components = glob.sync('**/component.json', { cwd: basePath });
  components.forEach((componentPath) => {
    const componentJson = util.readJsonAndReturnObject(path.join(basePath, componentPath));
    // if the component doesn't belong to a pack
    if (!Object.prototype.hasOwnProperty.call(componentJson, 'pack')) {
      pathMappingObj[componentJson.name] = path.join(config('paths').composites, componentPath, '..');
    } else if (!Object.prototype.hasOwnProperty.call(pathMappingObj, componentJson.pack)) {
      pathMappingObj[componentJson.pack] = path.join(config('paths').composites, componentPath, '..', '..');
    }
  });
  return pathMappingObj;
}

/**
 * ## _isPack
 * @private
 * @param {Object} dependency
 * @returns {Boolean}
 */
function _isPack(dependency) {
  return Object.prototype.hasOwnProperty.call(dependency, 'components');
}

/**
 * ## _isMinified
 * @public
 * @param {Object} dependency
 * @returns {Boolean}
 */
function _isMinified(dependency, version) {
  // check jet_components and the src/js/composites directories
  const exchangePath = path.join(CONSTANTS.JET_COMPONENTS_DIRECTORY, dependency, version, 'min');
  const srcPath = path.join(config('paths').src.common, config('paths').src.javascript,
    config('paths').composites, dependency, version, 'min');
  return (util.fsExistsSync(exchangePath) || util.fsExistsSync(srcPath));
}

module.exports = {
  getPathsMapping: function _getPathsMapping(context) {
    const masterJson = util.readPathMappingJson();
    const buildType = context.buildType === 'release' ? 'release' : 'debug';
    const pathMappingObj = Object.assign({}, _getPathMappingObj(buildType, masterJson),
      _getCcaPathMapping(buildType), _getLocalCcaPathMapping());
    return pathMappingObj;
  },

  updateRJsOptimizerConfig: function _updateRJsOptimizer(context) {
    const masterJson = util.readPathMappingJson();
    const rConfig = context.opts.requireJs;
    const buildType = context.buildType === 'release' ? 'release' : 'debug';
    const rjsConfig = _getRJsConfig(buildType, masterJson, rConfig);
    return _getCcaRJsConfig(buildType, rjsConfig);
  }
};
