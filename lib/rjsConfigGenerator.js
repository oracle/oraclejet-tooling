/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
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
  const pluginLibs = ['text', 'css', 'normalize', 'css-builder', 'ojL10n'];
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
 * ## _getCcaPathMapping
 * @private
 * @param {String} buildType
 * @returns {Object}
 */
function _getCcaPathMapping(buildType, requirejs) {
  let pathMappingObj = {};
  const dependenciesObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`).components;

  if (!dependenciesObj) return pathMappingObj;

  Object.keys(dependenciesObj).forEach((dependency) => {
    let dependencyPath = `${CONSTANTS.JET_COMPOSITE_DIRECTORY}/${dependency}`;
    const dependencyComponentJsonPath = `./${CONSTANTS.JET_COMPONENTS_DIRECTORY}/${dependency}/${CONSTANTS.JET_COMPONENT_JSON}`;
    const dependencyComponentJson = util.readJsonAndReturnObject(dependencyComponentJsonPath);
    if (dependencyComponentJson.type === 'reference') {
      pathMappingObj = _getReferencePathInternal(buildType, requirejs, dependencyComponentJson);
    } else {
      const version = _getValidVersion(dependencyComponentJson.version);
      dependencyPath += `/${version}`;
      if (buildType === 'release' && _isMinified(dependency, version)) {
        dependencyPath += '/min';
      }
      pathMappingObj[dependency] = requirejs ? dependencyPath : `'${dependencyPath}'`;
    }
  });
  return pathMappingObj;
}

/**
 * ## _getReferencePathMapping
 * @private
 * @param {Object} dependency
 * @param {Boolean} requirejs
 * @returns {Object}
 *
 * Return a pathMappingObj that contains all reference components.
 * The approach used to discover the reference components is to traverse
 * the JET_COMPONENTS_DIRECTORY.
 * This approach ensures that all reference components are discovered.
 *
 * For example, the oj-sample-calendar component will pull in two reference components,
 * oj-ref-calendar and oj-ref-moment.
 * These two reference components will be returned in the pathMappingObj and
 * subsequently injected into the main.js pathMapping.
 *
 *  "fullcalendar":"libs/fullcalendar/dist",
 *  "moment":"libs/moment/moment.min"
 *
*/
function _getReferencePathMapping(buildType, requirejs) {
  const pathMappingObj = {};
  const componentList = util.getDirectories(`./${CONSTANTS.JET_COMPONENTS_DIRECTORY}`);
  componentList.forEach((component) => {
    const componentDirPath = `./${CONSTANTS.JET_COMPONENTS_DIRECTORY}/${component}/${CONSTANTS.JET_COMPONENT_JSON}`;
    const componentJson = util.readJsonAndReturnObject(`${componentDirPath}`);
    if (componentJson.type === 'reference') {
      const npmPackageName = componentJson.package;
      // For reference components, the pathMappingObject property is set to:
      // (a) paths.name (if it exists), otherwise (b) the package name.
      const npmPathName = (componentJson.paths && componentJson.paths.name) || npmPackageName;
      const retObj = util.getNpmPckgInitFileRelativePath(componentJson, buildType);
      const finalPath = _constructComponentPath(retObj, npmPackageName);
      pathMappingObj[npmPathName] = requirejs ? finalPath : `'${finalPath}'`;
    }
  });
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
  const ccaVersionObj = config('componentVersionObj') || {};
  const basePath = path.join(
    config('paths').src.common,
    scriptsFolder,
    config('paths').composites
  );
  const components = _getLocalComponentArray(scriptsFolder);
  components.forEach((componentDir) => {
    const componentPath = path.join(componentDir, 'component.json');
    const componentJson = util.readJsonAndReturnObject(path.join(basePath, componentPath));
    const version = Object.prototype.hasOwnProperty.call(componentJson, 'version') ?
      componentJson.version : '1.0.0';
    ccaVersionObj[componentJson.name] = version;
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
      pathMappingObj[componentJson.name] = path.join(config('paths').composites, componentPath, '..', version);
      // target minified directory for release builds.
      if (buildType === 'release') {
        pathMappingObj[componentJson.name] = path.join(pathMappingObj[componentJson.name], 'min');
      }
      pathMappingObj[componentJson.name] = requirejs ? pathMappingObj[componentJson.name] : `'${pathMappingObj[componentJson.name]}'`;
    }
  });
  config('componentVersionObj', ccaVersionObj);
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
        _getCcaPathMapping(buildType, requirejs),
        _getReferencePathMapping(buildType, requirejs),
        _getLocalCcaPathMapping(buildType, requirejs, config('paths').src.javascript),
        _getLocalCcaPathMapping(buildType, requirejs, config('paths').src.typescript)
      );
    return pathMappingObj;
  },

  getMasterPathsMapping: function _getMasterPathsMapping(context) {
    const masterJson = util.readPathMappingJson();
    const buildType = context.buildType === 'release' ? 'release' : 'debug';
    const pathMappingObj = _getPathMappingObj(buildType, masterJson, true, false);
    // prepend the relative directory position for a component.
    Object.keys(pathMappingObj).forEach((lib) => {
      pathMappingObj[lib] = path.join('../../../../', pathMappingObj[lib]);
    });
    return pathMappingObj;
  },

  getMasterPathsMappingSingleton: function _getMasterPathsMappingSingleton(context) {
    const masterJson = util.readPathMappingJson();
    const buildType = context.buildType === 'release' ? 'release' : 'debug';
    const pathMappingObj = _getPathMappingObj(buildType, masterJson, true, false);
    // prepend the relative directory position for a component.
    Object.keys(pathMappingObj).forEach((lib) => {
      pathMappingObj[lib] = path.join('../../../', pathMappingObj[lib]);
    });
    return pathMappingObj;
  },

  getReferencePathMappingExternal: function _getReferencePathMappingExternal(buildType, requirejs) {
    return _getReferencePathMapping(buildType, requirejs);
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
  }
};
