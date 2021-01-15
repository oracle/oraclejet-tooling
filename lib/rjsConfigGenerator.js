/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const path = require('path');
const util = require('./util');
const CONSTANTS = require('./constants');
const config = require('./config');

function _getPathMappingObj(buildType, masterJson, requirejs, es5) {
  const obj = {};
  const useCdn = masterJson.use;
  Object.keys(masterJson.libs).forEach((lib) => {
    const libPath = _getLibPath(buildType, masterJson.libs[lib], useCdn, masterJson.cdns,
      lib, requirejs, es5);
    if (libPath) obj[lib] = libPath;
  });

  // fix bug for require css broken link to css-builder.js
  let lp = 'libs/require-css/css-builder';
  obj['css-builder'] = path.join(lp, '..', path.basename(lp, path.extname(lp)));
  lp = 'libs/require-css/normalize';
  obj.normalize = path.join(lp, '..', path.basename(lp, path.extname(lp)));
  if (!requirejs) {
    obj['css-builder'] = `'${obj['css-builder']}'`;
    obj.normalize = `'${obj.normalize}'`;
  }
  return obj;
}

function _getLibPath(buildType, libObj, useCdn, cdnUrls, libName, requirejs, es5) {
  // if user defines cdn path and set use to "cdn" in path_mapping.json
  //  prefer to use cdn path over local path
  const buildTypeEs5 = `${buildType}_es5`;
  const buildTypeLibObj = (es5 && buildType === 'release' && libObj[buildTypeEs5]) ? buildTypeEs5 : buildType;
  if (_isCdnPath(libObj, useCdn, cdnUrls, buildType, libName)) {
    // if the lib's cdn reference points to a bundles-config
    if (_isCdnBundle(libObj, cdnUrls) && !requirejs) {
      return null;
    }

    const prefix = typeof cdnUrls[libObj.cdn] === 'object'
      ? cdnUrls[libObj.cdn].prefix : cdnUrls[libObj.cdn];

    const suffix = libObj[buildTypeLibObj].pathSuffix ? libObj[buildTypeLibObj].pathSuffix : '\'';
    return `'${prefix}/${libObj[buildType].cdnPath}${suffix}`;
  }

  let libPath = _processVersionToken(libName, libObj[buildTypeLibObj].path);
  if (path.extname(libPath) === '.js') {
    libPath = path.join(libPath, '..', path.basename(libPath, path.extname(libPath)));
  }

  libPath = requirejs ? `${libPath}` : `'${libPath}`;
  let suffix = libObj[buildTypeLibObj].pathSuffix ? libObj[buildTypeLibObj].pathSuffix : '\'';
  if (requirejs && suffix.substring(suffix.length - 1) === "'") {
    // remove it
    suffix = suffix.substring(0, suffix.length - 1);
  }

  libPath += suffix;

  return libPath;
}

function _isCdnPath(libObj, useCdn, cdnUrls, buildType, libName) {
  const pluginLibs = ['text', 'ojcss', 'css', 'normalize', 'css-builder', 'ojL10n'];
  const pluginLib = (buildType === 'release' && pluginLibs.indexOf(libName) > -1);
  return (useCdn === 'cdn'
    && !pluginLib
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


function _getRJsConfig(buildType, masterJson, oldConfig, es5) {
  // Update the requirejs optimizer config to skip bundling any cdn resouces
  const newConfig = oldConfig;
  const useCdn = masterJson.use;
  Object.keys(masterJson.libs).forEach((lib) => {
    if (_isCdnPath(masterJson.libs[lib], useCdn, masterJson.cdns, buildType, lib)) {
      if (newConfig.paths === undefined) {
        newConfig.paths = {};
      }
      newConfig.paths[lib] = 'empty:';
    }
  });
  // bug fix for require-css broken link to css-build.js
  if (config.exclude === undefined) {
    newConfig.exclude = [];
  }
  newConfig.exclude.push('css-builder');
  newConfig.exclude.push('normalize');
  if (es5) {
    newConfig.exclude.push('corejs');
    newConfig.exclude.push('regenerator-runtime');
  }

  return newConfig;
}

/**
 * ## _getCcaRJsConfig
 * @private
 * @param {String} buildType
 * @param {Object} masterJson
 * @param {Object} config
 * @returns {Object}
 */
function _getCcaRJsConfig(buildType, masterJson, oldConfig) {
  // Update the requirejs optimizer config to skip bundling any minified cca components
  const newConfig = oldConfig;
  const dependenciesObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`).dependencies;

  // Update build config with reference components
  const componentList = util.getDirectories(`./${CONSTANTS.JET_COMPONENTS_DIRECTORY}`);
  componentList.forEach((component) => {
    const componentDirPath = `./${CONSTANTS.JET_COMPONENTS_DIRECTORY}/${component}/${CONSTANTS.JET_COMPONENT_JSON}`;
    const componentJson = util.readJsonAndReturnObject(`${componentDirPath}`);
    if (componentJson.type === 'reference') {
      // Should cdn be used? && is paths.cdn property defined?
      if (masterJson.use === 'cdn' && componentJson.cdn) {
        // Is either release or debug url available?
        if (componentJson.cdn.min || componentJson.cdn.debug) {
          newConfig.paths[(componentJson.paths && componentJson.paths.name) || component] = 'empty:';
        }
      }
    }
  });

  // bug fix for require-css broken link to css-build.js
  if (newConfig.exclude === undefined) {
    newConfig.exclude = [];
  }
  newConfig.exclude.push('css-builder');
  newConfig.exclude.push('normalize');

  if (!dependenciesObj) return newConfig;
  Object.keys(dependenciesObj).forEach((dependency) => {
    const version = _isPack(dependenciesObj[dependency]) ?
      dependenciesObj[dependency].version : dependenciesObj[dependency];
    if (buildType === 'release' && _isMinified(dependency, version)) newConfig.paths[dependency] = 'empty:';
  });
  return newConfig;
}

function _constructComponentPath(retObj, npmPackageName) {
  let finalPath = '';
  if (!retObj.npmPckgInitFileRelativePath) return finalPath;
  if (retObj.npm) {
    // Get only the file name
    const npmPckgInitFileNameArray = retObj.npmPckgInitFileRelativePath.split('/');
    let npmPckgInitFileName = npmPckgInitFileNameArray[npmPckgInitFileNameArray.length - 1];
    npmPckgInitFileName = npmPckgInitFileName.replace('.js', '');
    finalPath = `libs/${npmPackageName}/${npmPckgInitFileName}`;
  } else {
    finalPath = retObj.npmPckgInitFileRelativePath;
  }
  return finalPath;
}


/**
 * ## _getReferencePathInternal
 * @private
 * @param {String} buildType
 * @param {Boolean} requirejs
 * @param {Object} dependencyComponentJson
 * @returns {Object}
 *
 * Assign the proper reference paths, returning a pathMappingObj.
 * For reference components, the pathMappingObject property is set to:
 * (a) paths.name (if it exists), otherwise (b) the package name.
 */
function _getReferencePathInternal(buildType, requirejs, dependencyComponentJson) {
  const pathMappingObj = {};
  const npmPackageName = dependencyComponentJson.package;
  const npmPathName = (dependencyComponentJson.paths && dependencyComponentJson.paths.name) ||
        npmPackageName;
  const retObj = util.getNpmPckgInitFileRelativePath(dependencyComponentJson, buildType);
  const finalPath = _constructComponentPath(retObj, npmPackageName);
  pathMappingObj[npmPathName] = requirejs ? finalPath : `'${finalPath}'`; // eslint-disable-line
  return pathMappingObj;
}

/**
 * ## _getExchangeCcaPathMapping
 * @private
 * @param {String} buildType
 * @returns {Object}
 */

function _getExchangeCcaPathMapping(buildType, requirejs) {
  let pathMappingObj = {};
  const componentsCache = util.getComponentsCache();
  const exchangeComponents = {};
  Object.keys(componentsCache).forEach((component) => {
    const componentCache = componentsCache[component];
    if (
      util.hasProperty(componentCache, 'isLocal') &&
      !componentCache.isLocal &&
      util.hasProperty(componentCache, 'componentJson') &&
      !util.hasProperty(componentCache.componentJson, 'pack')
    ) {
      exchangeComponents[component] = componentCache;
    }
  });
  if (Object.keys(exchangeComponents).length) {
    Object.keys(exchangeComponents).forEach((exchangeComponent) => {
      const exchangeComponentJson = componentsCache[exchangeComponent].componentJson;
      if (exchangeComponentJson.type === 'reference') {
        pathMappingObj = {
          ...pathMappingObj,
          ..._getReferencePathInternal(buildType, requirejs, exchangeComponentJson)
        };
      } else {
        const version = _getValidVersion(exchangeComponentJson.version);
        let exchangeComponentPath = `${CONSTANTS.JET_COMPOSITE_DIRECTORY}/${exchangeComponent}/${version}`;
        if (buildType === 'release' && _isMinified(exchangeComponent, version)) {
          exchangeComponentPath += '/min';
        }
        pathMappingObj[exchangeComponent] = requirejs ? exchangeComponentPath : `'${exchangeComponentPath}'`;
      }
    });
  }
  return pathMappingObj;
}

function _getValidVersion(version) {
  return !isNaN(version.charAt(0)) ? version : version.substring(1);
}

/**
 * ## _getLocalCcaPathMapping
 * @private
 * @returns {Object}
 */
function _getLocalCcaPathMapping(buildType, requirejs, scriptsFolder) {
  const pathMappingObj = {};
  const configPaths = util.getConfiguredPaths();
  const components = _getLocalComponentArray(scriptsFolder);
  components.forEach((component) => {
    const componentJson = util.getComponentJson({ component });
    const version = util.getComponentVersion({ component });
    //
    // (We only add singleton components and the 'top-level' pack (type: 'pack'))
    //
    // The following are NOT added:
    //   - members of a pack (will have a pack property, e.b. pack: packName)
    //   - reference components (type: reference)
    //   - resource components (type: resource)
    //
    if (!Object.prototype.hasOwnProperty.call(componentJson, 'pack') &&
        !(Object.prototype.hasOwnProperty.call(componentJson, 'type') &&
          ((componentJson.type === 'reference' || componentJson.type === 'resource')))) {
      pathMappingObj[componentJson.name] = path.join(
        configPaths.composites,
        componentJson.name,
        version
      );
      // target minified directory for release builds.
      if (buildType === 'release') {
        // Use minified directory for all components except type: demo
        if (!(Object.prototype.hasOwnProperty.call(componentJson, 'type') &&
              (componentJson.type === 'demo'))) {
          pathMappingObj[componentJson.name] = path.join(pathMappingObj[componentJson.name], 'min');
        }
      }
      pathMappingObj[componentJson.name] = requirejs ? pathMappingObj[componentJson.name] : `'${pathMappingObj[componentJson.name]}'`;
    }
  });
  return pathMappingObj;
}

function _getLocalVComponentPathMapping(buildType, requirejs) {
  const pathMappingObj = {};
  const configPaths = util.getConfiguredPaths();
  const vcomponents = util.getLocalVComponents();
  vcomponents.forEach((component) => {
    const version = util.getVComponentVersion({ component });
    pathMappingObj[component] = path.join(
      configPaths.composites,
      component,
      version
    );
    if (buildType === 'release') {
      pathMappingObj[component] = path.join(pathMappingObj[component], 'min');
    }
    pathMappingObj[component] = requirejs ? pathMappingObj[component] : `'${pathMappingObj[component]}'`;
  });
  return pathMappingObj;
}

function _getLocalComponentArray(scriptsFolder) {
  const basePath = path.join(
    config('paths').src.common,
    scriptsFolder,
    config('paths').composites
  );
  const localCca = [];
  if (util.fsExistsSync(basePath)) {
    const dirList = util.getDirectories(basePath);
    dirList.forEach((dir) => {
      const componentPath = path.join(basePath, dir, 'component.json');
      if (util.fsExistsSync(componentPath)) {
        const componentObj = util.readJsonAndReturnObject(componentPath);
        if (Object.prototype.hasOwnProperty.call(componentObj, 'name') && componentObj.name === dir) localCca.push(dir);
      }
    });
  }

  return localCca;
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
  getPathsMapping: function _getPathsMapping(context, requirejs, es5) {
    const masterJson = util.readPathMappingJson();
    const buildType = context.buildType === 'release' ? 'release' : 'debug';
    const pathMappingObj =
      Object.assign(
        {},
        _getPathMappingObj(buildType, masterJson, requirejs, es5),
        _getExchangeCcaPathMapping(buildType, requirejs),
        _getLocalCcaPathMapping(buildType, requirejs, config('paths').src.javascript),
        _getLocalCcaPathMapping(buildType, requirejs, config('paths').src.typescript),
        _getLocalVComponentPathMapping(buildType, requirejs)
      );
    return pathMappingObj;
  },

  getMasterPathsMapping: function _getMasterPathsMapping(context, component) {
    const masterJson = util.readPathMappingJson();
    const buildType = context.buildType === 'release' ? 'release' : 'debug';
    const pathMappingObj = _getPathMappingObj(buildType, masterJson, true, false);
    // prepend the relative directory position for a component.
    Object.keys(pathMappingObj).forEach((lib) => {
      pathMappingObj[lib] = path.join(
        component ? '../../../' : '../../../../',
        pathMappingObj[lib]
      );
    });
    return pathMappingObj;
  },

  getReferencePath: function _getReferencePath(buildType, requirejs, dependencyComponentJson) {
    return _getReferencePathInternal(buildType, requirejs, dependencyComponentJson);
  },

  updateRJsOptimizerConfig: function _updateRJsOptimizer(context, es5) {
    const masterJson = util.readPathMappingJson();
    const rConfig = es5 ? context.opts.requireJsEs5 : context.opts.requireJs;

    const buildType = context.buildType === 'release' ? 'release' : 'debug';
    const rjsConfig = _getRJsConfig(buildType, masterJson, rConfig, es5);
    return _getCcaRJsConfig(buildType, masterJson, rjsConfig);
  },

  isCdnPath: _isCdnPath
};
