#! /usr/bin/env node
/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/

'use strict';

/**
 * ## Dependencies
 */
// Node
const fs = require('fs-extra');
const path = require('path');

// Oracle
const build = require('../build');
const CONSTANTS = require('../constants');
const component = require('./component');
const exchangeUtils = require('../utils.exchange');
const util = require('../util');
const generateComponentsCache = require('../buildCommon/generateComponentsCache');

// Module variables
const packDirBlacklist = ['min', 'types'];

/**
 * # Components
 *
 * @public
 */
const pack = module.exports;

/**
 * ## add
 *
 * @public
 * @param {Array} packNames
 * @return {Promise}
 */
pack.add = function (packNames, options) {
  return new Promise((resolve, reject) => {
    exchangeUtils.getExchangeUrl(); // Ensure it is set before creating jet_components dir
    const configPaths = util.getConfiguredPaths();
    util.ensureDir(`./${configPaths.exchangeComponents}`);

    // The first level function stores user input for the session
    process.env.options = JSON.stringify(options);

    let i = 0;

    function fn() {
      if (i < packNames.length) {
        const packName = packNames[i];

        exchangeUtils.getComponentMetadata(packName)
          .then((metadata) => { // eslint-disable-line
            return new Promise((res, rej) => {
              if (metadata.type === 'pack') {
                const packDependenciesObject = metadata.component.dependencies;

                // Array of serialized component names to be added <component>@[<version>]
                const serializedComponentNames = [];

                // Add pack [with version]
                serializedComponentNames.push(`${packName}`);

                // Add pack's components with versions
                // (When adding pack, we always want specific version of a component)
                Object.keys(packDependenciesObject).forEach((packComponentName) => {
                  serializedComponentNames.push(`${packComponentName}@${packDependenciesObject[packComponentName]}`);
                });

                component.add(serializedComponentNames, Object.assign(options, {
                  _suppressMsgColor: true,
                })).then(() => {
                  res();
                });
              } else {
                rej(`'${packName}' is not a pack.`);
              }
            });
          })
          .then(() => {
            i += 1;
            fn();
          })
          .catch((error) => {
            util.log.error(error, true);
            reject();
          });
      } else {
        util.log.success(`Pack(s) '${packNames}' added.`);
        resolve();
      }
    }
    fn();
  });
};

/**
 * ## create
 *
 * @public
 * @param {string} packName
 * @return {Promise}
 */
pack.create = function (packName) {
  return new Promise((resolve) => {
    util.ensureParameters(packName, CONSTANTS.API_TASKS.CREATE);

    const configPaths = util.getConfiguredPaths();
    const sourceScriptsFolder = util.getSourceScriptsFolder();
    const jetCompositesDirPath = path.join(
      process.cwd(),
      configPaths.src.common,
      sourceScriptsFolder,
      configPaths.components
    );
    const packDirPath = path.join(jetCompositesDirPath, packName);
    // Check if already exists
    if (fs.existsSync(packDirPath)) {
      util.log.error(`Pack '${packName}' already exits.`);
    } else {
      // Make pack directory
      util.ensureDir(packDirPath);

      // Add pack's component.json
      const packComponentJsonTemplatePath = path.join(__dirname, '../templates/pack', CONSTANTS.JET_COMPONENT_JSON);
      const packComponentJson = util.readJsonAndReturnObject(packComponentJsonTemplatePath);
      packComponentJson.name = packName;
      packComponentJson.jetVersion = `^${util.getJETVersion()}`;
      const filename = path.join(packDirPath, CONSTANTS.JET_COMPONENT_JSON);
      util.writeFileSync(filename, JSON.stringify(packComponentJson, null, 2));
      // Add path mapping for pack in tsconfig.json if in typescript app
      util.addComponentToTsconfigPathMapping({
        component: packName,
        isLocal: true
      });
      util.log.success(`Pack '${packName}' successfully created.`);
      resolve();
    }
  }).catch((error) => {
    util.log.error(error, true);
  });
};

/**
 * ## list
 * Lists installed packs
 *
 * @public
 * @return {Promise}
 */
pack.list = function () {
  return new Promise((resolve) => {
    const configPaths = util.getConfiguredPaths();
    // Read packs from the config file
    const packsInConfigFile = [];
    const configObj = util.getOraclejetConfigJson();
    if (!util.isObjectEmpty(configObj.components)) {
      Object.keys(configObj.components).forEach((comp) => {
        if (typeof configObj.components[comp] === 'object') {
          packsInConfigFile.push(`${comp}`);
        }
      });
    }

    // Read packs by directories
    const packsByFolder = [];
    const componentsDirPath = configPaths.exchangeComponents;
    if (fs.existsSync(componentsDirPath)) {
      const folderNames = util.getDirectories(componentsDirPath);

      folderNames.forEach((folderName) => {
        const componentJson = util.readJsonAndReturnObject(`${componentsDirPath}/${folderName}/${CONSTANTS.JET_COMPONENT_JSON}`);

        if (componentJson.type === 'pack') {
          packsByFolder.push(folderName);
        }
      });
    }

    if (packsByFolder.length === 0 && packsInConfigFile.length === 0) {
      util.log.success('No components found.');
    }

    util.printList(packsInConfigFile, packsByFolder);
    util.log.success('Packs listed.');
    resolve();
  }).catch((error) => {
    util.log.error(error, true);
  });
};

/**
 * ## package
 *
 * @public
 * @param {array} packNames
 * @param {Object} [options]
 * @return {Promise}
 */
pack.package = function (packNames, options) {
  return new Promise((resolve) => {
    util.ensureParameters(packNames, CONSTANTS.API_TASKS.PUBLISH);

    // The first level function stores user input for the session
    process.env.options = JSON.stringify(options);

    const opts = options || {};

    // We allow packaging of only a single pack
    // User can script a loop if he wants to package multiple packs
    const packName = packNames[0];

    // Get path to pack
    const configPaths = util.getConfiguredPaths();
    const packPath = util.getComponentPath({ component: packName });
    const packComponentJsonPath = path.join(packPath, CONSTANTS.JET_COMPONENT_JSON);
    const packComponentJson = util.readJsonAndReturnObject(packComponentJsonPath);
    const packVersion = packComponentJson.version;

    // Get path to built pack
    const packWebDirPath = path.join(configPaths.staging.web, configPaths.src.javascript,
      configPaths.components, packName, packVersion);
    const packHybridDirPath = path.join(configPaths.staging.hybrid, 'www', configPaths.src.javascript,
      configPaths.components, packName, packVersion);
    let existsInWebDir = fs.existsSync(packWebDirPath);
    let existsInHybridDir = fs.existsSync(packHybridDirPath);

    // Should we build pack or can we skip that initial step?
    let builtPackPath = '';
    if (existsInWebDir || existsInHybridDir) {
      builtPackPath = existsInHybridDir ? packHybridDirPath : packWebDirPath;
    }
    const hadBeenBuiltBefore = !!builtPackPath;

    // Available pack components names for packaging
    const builtPackComponentNamesAndVersions = [];
    const builtPackComponentNames = [];
    let builtPackDirs = []; // Directories that are part of a pack, but are not its components.

    function readBuiltPackComponents() {
      // Read dependencies from the componentCache.
      // Note that the component cache tolerates missing .tsx directives
      opts.stagingPath = configPaths.staging.stagingPath;
      const context = { opts };
      const componentsCache = generateComponentsCache({ context });
      const builtPackComponentJson = componentsCache[packName].componentJson;
      Object.keys(builtPackComponentJson.dependencies).forEach((packComponentName) => {
        // Remove pack name from the full component name
        const shortComponentName = packComponentName.replace(`${packName}-`, '');
        const builtPackComponentComponentJsonPath = path.join(
          builtPackPath,
          shortComponentName,
          CONSTANTS.JET_COMPONENT_JSON
        );
        if (fs.existsSync(builtPackComponentComponentJsonPath)) {
          builtPackComponentNames.push(shortComponentName);
          builtPackComponentNamesAndVersions.push({
            [shortComponentName]:
            util.readJsonAndReturnObject(builtPackComponentComponentJsonPath).version
          });
        } else {
          util.log(`Pack component\'s descriptor ${builtPackComponentComponentJsonPath}' not found. This component won't be published. Skipping.`); // eslint-disable-line
        }
      });

      builtPackDirs = util.getDirectories(builtPackPath);

      // Save pack directories (not components, types or min folder)
      builtPackDirs = builtPackDirs.filter((packDir) => { // eslint-disable-line
        return builtPackComponentNames.indexOf(packDir) === -1 &&
          packDirBlacklist.indexOf(packDir) === -1;
      });
    }

    function packageBuiltPackComponents() {
      return new Promise((res, rej) => {
        let i = 0;
        function fn() { // eslint-disable-line
          if (i < builtPackComponentNames.length) {
            component.package([builtPackComponentNames[i]], Object.assign(opts, {
              pack: packName
            }))
              .then(() => {
                i += 1;
                fn();
              })
              .catch((error) => {
                rej(error);
              });
          } else {
            res();
          }
        }
        fn();
      });
    }

    // If packing only a pack without dependencies using package component <packName>
    // return just resolved Promise
    const packageBuiltComponents = opts._excludeDependencies ?
      () => { return Promise.resolve(); } // eslint-disable-line
      : packageBuiltPackComponents;

    // Should we build component or can we skip that initial step?
    let initialPromise;
    if (hadBeenBuiltBefore) {
      initialPromise = Promise.resolve();
    } else {
      opts.buildType = 'release';
      initialPromise = build('web', opts);
    }

    initialPromise
      .then(() => {
        if (!hadBeenBuiltBefore) {
          // Pack hasn't been built before triggering 'ojet package pack ...'
          // Hence we build the component in previous promise
          // Now it is built. We need to get path again to replace empty string with existing path
          existsInWebDir = fs.existsSync(packWebDirPath);
          existsInHybridDir = fs.existsSync(packHybridDirPath);

          builtPackPath = existsInHybridDir ? packHybridDirPath : packWebDirPath;
        }
      })
      .then(() => { // eslint-disable-line
        // Do not log info 'Archiving pack was archived' in case we are packaging
        // only pack itself as a standalone component (without dependencies)
        // Case: ojet package component <pack_name>
        if (!opts._excludeDependencies) {
          util.log(`Archiving pack '${packName}'.`);
        }
        return readBuiltPackComponents();
      })
      .then(() => { // eslint-disable-line
        return packageBuiltComponents();
      })
      .then(() => {
        // Package pack
        if (opts.pack) { delete opts.pack; }
        return component.package([packName], Object.assign(opts, {
          _contentToArchive: {
            dirs: builtPackDirs,
            files: util.getFiles(builtPackPath),
            minFiles: util.getFiles(path.join(builtPackPath, 'min'))
          }
        }));
      })
      .then(() => {
        if (!opts._excludeDependencies) {
          // Do not log info 'Archiving pack was archived' in case we are packaging
          // only pack itself as a standalone component (without dependencies)
          // Case: ojet package component <pack_name>
          util.log(`Pack '${packName}' was archived.`);
        }
        resolve();
      })
      .catch((error) => {
        util.log.error(error, true);
      });
  });
};

/**
 * ## publish
 *
 * @public
 * @param {string} packName
 * @param {Object} [options]
 * @return {Promise}
 */
pack.publish = function (packName, options) {
  return new Promise((resolve) => {
    util.ensureParameters(packName, CONSTANTS.API_TASKS.PUBLISH);

    // The first level function stores user input for the session
    process.env.options = JSON.stringify(options);

    const opts = options || {};

    const packPath = util.getComponentPath({ component: packName });
    const packComponentJsonPath = path.join(packPath, CONSTANTS.JET_COMPONENT_JSON);
    const packComponentJson = util.readJsonAndReturnObject(packComponentJsonPath);
    const packVersion = packComponentJson.version;

    // Get path to built pack
    const configPaths = util.getConfiguredPaths();

    const packWebDirPath = path.join(configPaths.staging.web, configPaths.src.javascript,
      configPaths.components, packName, packVersion);
    const packHybridDirPath = path.join(configPaths.staging.hybrid, 'www', configPaths.src.javascript,
      configPaths.components, packName, packVersion);
    let existsInWebDir = fs.existsSync(packWebDirPath);
    let existsInHybridDir = fs.existsSync(packHybridDirPath);

    // Should we build pack or can we skip that initial step?
    let builtPackPath = '';
    if (existsInWebDir || existsInHybridDir) {
      builtPackPath = existsInHybridDir ? packHybridDirPath : packWebDirPath;
    }
    const hadBeenBuiltBefore = !!builtPackPath;

    // Should we build component or can we skip that initial step?
    const initalPromise = hadBeenBuiltBefore ? Promise.resolve() : build('web', {
      sassCompile: true,
      pcssCompile: true
    });

    return initalPromise
      .then(() => {
        if (!hadBeenBuiltBefore) {
          // Pack hasn't been built before triggering 'ojet package pack ...'
          // Hence we build the component in previous promise
          // Now it is built. We need to get path again to replace empty string with existing path
          existsInWebDir = fs.existsSync(packWebDirPath);
          existsInHybridDir = fs.existsSync(packHybridDirPath);

          builtPackPath = existsInHybridDir ? packHybridDirPath : packWebDirPath;
        }
      })
      .then(() => { // eslint-disable-line
        // Always clear 'temp' directory before publishing
        if (fs.existsSync(CONSTANTS.PUBLISH_TEMP_DIRECTORY)) {
          fs.emptyDirSync(CONSTANTS.PUBLISH_TEMP_DIRECTORY);
        }
        // Use 'ojet package' to prepare files
        // Put files into 'temp' directory instead 'dist' as they'll be deleted after published
        return this.package([packName], Object.assign(opts, {
          _useTempDir: true,
        }));
      })
      .then(() => util.loginIfCredentialsProvided())
      .then(() => {
        util.log(`Publishing pack '${packName}'.`);
        return exchangeUtils.uploadToExchange(packName, Object.assign(opts, {
          _batchUpload: true,
        }));
      })
      .then(() => {
        util.log.success(`Pack '${packName}' was published.`);
        resolve();
      })
      .catch((error) => {
        util.log.error(error, true);
      });
  });
};

/**
 * ## remove
 *
 * @public
 * @param {Array} packNames
 * @param {Object} [options]
 * @return {Promise}
 */
pack.remove = function (packNames, options) {
  return new Promise((resolve, reject) => {
    let i = 0;

    function fn() {
      if (i < packNames.length) {
        const configPaths = util.getConfiguredPaths();
        const packName = packNames[i];
        const packPath = `${configPaths.exchangeComponents}/${packName}`;

        if (fs.existsSync(packPath)) {
          const packComponentNames = [];
          const packDirs = util.getDirectories(packPath);

          packDirs.forEach((packDir) => {
            const packComponentComponentJsonPath =
              path.join(packPath, packDir, CONSTANTS.JET_COMPONENT_JSON);
            if (fs.existsSync(packComponentComponentJsonPath)) {
              const packComponentComponentJson =
                util.readJsonAndReturnObject(packComponentComponentJsonPath);
              packComponentNames.push(`${packComponentComponentJson.pack}-${packComponentComponentJson.name}@${packComponentComponentJson.version}`);
            }
          });

          component.remove(packComponentNames, null, Object.assign(options, {
            _suppressMsgColor: true,
          }))
            .then(() => {
              i += 1;
              fn();
            })
            .catch((error) => {
              reject(error);
            });
        } else {
          util.log.error(`Pack '${packName}' not found.`);
          i += 1;
          fn();
        }
      } else {
        util.log.success(`Pack(s) '${packNames}' removed.`);
        resolve();
      }
    }
    fn();
  });
};
