#! /usr/bin/env node
/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

/**
 * ## Dependencies
 */
// Node
const fs = require('fs');
const path = require('path');

// Oracle
const build = require('../build');
const CONSTANTS = require('../constants');
const component = require('./component');
const exchangeUtils = require('../utils.exchange');
const util = require('../util');

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
    util.ensureExchangeUrl();
    util.ensureDir(`./${CONSTANTS.JET_COMPONENTS_DIRECTORY}`);

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

                component.add(serializedComponentNames, {
                  _suppressMsgColor: true,
                }).then(() => {
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
    util.ensureParameters(packName, CONSTANTS.API_TASKS.PUBLISH);

    const configPaths = util.getConfiguredPaths();
    const sourceScriptsFolder = util.getSourceScriptsFolder();
    const jetCompositesDirPath = path.join(
      process.cwd(),
      configPaths.src.common,
      sourceScriptsFolder,
      configPaths.composites
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
      fs.writeFileSync(filename, JSON.stringify(packComponentJson, null, 2));
      util.log.success(`Pack '${packName}' successfully created.'`);
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
    // Read packs from the config file
    const packsInConfigFile = [];
    const configObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`);
    if (!util.isObjectEmpty(configObj.components)) {
      Object.keys(configObj.components).forEach((comp) => {
        if (typeof configObj.components[comp] === 'object') {
          packsInConfigFile.push(`${comp}`);
        }
      });
    }

    // Read packs by directories
    const packsByFolder = [];
    const componentsDirPath = CONSTANTS.JET_COMPONENTS_DIRECTORY;
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
    const packPath = util.getComponentPath(packName);
    const packComponentJsonPath = path.join(packPath, CONSTANTS.JET_COMPONENT_JSON);
    const packComponentJson = util.readJsonAndReturnObject(packComponentJsonPath);
    const packVersion = packComponentJson.version;

    // Get path to built pack
    const packWebDirPath = path.join(configPaths.staging.web, configPaths.src.javascript,
      configPaths.composites, packName, packVersion);
    const packHybridDirPath = path.join(configPaths.staging.hybrid, 'www', configPaths.src.javascript,
      configPaths.composites, packName, packVersion);
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
      const builtPackComponentJsonPath = path.join(builtPackPath, CONSTANTS.JET_COMPONENT_JSON);
      const builtPackComponentJson = util.readJsonAndReturnObject(builtPackComponentJsonPath);

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
          util.log(`Pack component's descriptor ${builtPackComponentComponentJsonPath}' not found. This component won't be published. Skipping.`);
        }
      });

      builtPackDirs = util.getDirectories(builtPackPath);

      // Save pack directories (not components)
      builtPackDirs = builtPackDirs.filter((packDir) => { // eslint-disable-line
        return builtPackComponentNames.indexOf(packDir) === -1;
      });
    }

    function packageBuiltPackComponents() {
      return new Promise((res, rej) => {
        let i = 0;
        function fn() { // eslint-disable-line
          if (i < builtPackComponentNames.length) {
            component.package([builtPackComponentNames[i]], Object.assign(opts, {
              pack: packName,
              _output: path.join(CONSTANTS.PACKAGE_OUTPUT_DIRECTORY, `${builtPackComponentNames[i]}.zip`),
              _suppressMsgColor: true
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
    const initialPromise = hadBeenBuiltBefore ? Promise.resolve() : build('web', {
      buildType: 'release'
    });

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
            files: util.getFiles(builtPackPath)
          },
          _suppressMsgColor: true,
        }));
      })
      .then(() => {
        util.log.success(`Pack '${packName}' was packaged.`, Object.assign(opts, {
          _suppressMsgColor: false,
        }));
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

    const packPath = util.getComponentPath(packName);
    const packComponentJsonPath = path.join(packPath, CONSTANTS.JET_COMPONENT_JSON);
    const packComponentJson = util.readJsonAndReturnObject(packComponentJsonPath);
    const packVersion = packComponentJson.version;

    // Get path to built pack
    const configPaths = util.getConfiguredPaths();

    const packWebDirPath = path.join(configPaths.staging.web, configPaths.src.javascript,
      configPaths.composites, packName, packVersion);
    const packHybridDirPath = path.join(configPaths.staging.hybrid, 'www', configPaths.src.javascript,
      configPaths.composites, packName, packVersion);
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
      const builtPackComponentJsonPath = path.join(builtPackPath, CONSTANTS.JET_COMPONENT_JSON);
      const builtPackComponentJson = util.readJsonAndReturnObject(builtPackComponentJsonPath);

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
          util.log(`Pack component's descriptor ${builtPackComponentComponentJsonPath}' not found. This component won't be published. Skipping.`);
        }
      });

      builtPackDirs = util.getDirectories(builtPackPath);

      // Save pack directories (not components)
      builtPackDirs = builtPackDirs.filter((packDir) => { // eslint-disable-line
        return builtPackComponentNames.indexOf(packDir) === -1;
      });
    }

    // Should we build component or can we skip that initial step?
    const initalPromise = hadBeenBuiltBefore ? Promise.resolve() : build('web', {});

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
        return readBuiltPackComponents();
      })
      .then(() => { // eslint-disable-line
        return util.loginIfCredentialsProvided();
      })
      .then(() => { // eslint-disable-line
        // Performing verification of pack to reduce possible errors
        return _verifyPack(packName, packVersion);
      })
      .then(() => { // eslint-disable-line
        // Exclude dependencies?
        // Perform verification of pack components to reduce possible errors
        return opts._excludeDependencies ?
          () => { return Promise.resolve(); } // eslint-disable-line
          : _verifyPackComponents(packName, builtPackComponentNamesAndVersions);
      })
      .then((packComponentNamesToPublish) => { // eslint-disable-line
        // Exclude dependencies?
        return opts._excludeDependencies ?
          () => { return Promise.resolve(); } // eslint-disable-line
          : new Promise((res, rej) => {
            let i = 0;
            function fn() {
              if (i < packComponentNamesToPublish.length) {
                const packComponentName = packComponentNamesToPublish[i];

                component.publish(packComponentName, Object.assign(opts, {
                  pack: packName,
                  _suppressMsgColor: true
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
      })
      .then(() => { // eslint-disable-line
        // Publish pack
        if (opts.pack) { delete opts.pack; }
        return component.publish(packName, Object.assign(opts, {
          _contentToArchive: {
            dirs: builtPackDirs,
            files: util.getFiles(packPath)
          },
          _suppressMsgColor: true,
        }));
      })
      .then(() => {
        util.log.success(`Pack '${packName}' was published.`, Object.assign(opts, {
          _suppressMsgColor: false,
        }));
        resolve();
      })
      .catch((error) => {
        util.log.error(error, true);
      });
  });
};

/**
 * ## _verifyPack
 *
 * @private
 * @param {string} packName
 * @param {string} packVersion
 * @return {Promise}
 */
function _verifyPack(packName, packVersion) {
  return new Promise((resolve, reject) => {
    util.request({
      path: path.join('components', packName, 'versions')
    })
    .then((responseData) => {
      const responseBody = responseData.responseBody;
      const response = responseData.response;
      return exchangeUtils.validateAuthenticationOfRequest(
        response,
        () => { return _verifyPack(packName, packVersion); }, // eslint-disable-line
        () => {
          if (response.statusCode.toString() !== '404') {
            // Pack already exists...
            util.checkForHttpErrors(response, responseBody);

            const availableVersions = JSON.parse(responseBody);
            if (availableVersions.items.indexOf(packVersion) !== -1) {
              util.log.error(`Pack '${packName}@${packVersion}' is already published. Please update its version.`);
            }
          }
        }
      );
    })
    .then(() => {
      resolve();
    })
    .catch((error) => {
      reject(error);
    });
  });
}

/**
 * ## _verifyPackComponents
 *
 * @private
 * @param {string} packName
 * @param {Object} packComponentNamesAndVersions
 * @return {Promise}
 */
function _verifyPackComponents(packName, packComponentNamesAndVersions) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const packComponentNamesToPublish = [];
    function fn() {
      if (i < packComponentNamesAndVersions.length) {
        const currentPackComponent = packComponentNamesAndVersions[i];
        const packComponentShortName = Object.keys(currentPackComponent)[0];
        const packComponentFullName = `${packName}-${packComponentShortName}`;
        const packComponentVersion = currentPackComponent[packComponentShortName];
        util.request({
          path: path.join('components', packComponentFullName, 'versions')
        })
        .then((responseData) => {
          const responseBody = responseData.responseBody;
          const response = responseData.response;
          return exchangeUtils.validateAuthenticationOfRequest(
            response,
            () => { // eslint-disable-line
              return _verifyPackComponents(packName, packComponentNamesAndVersions);
            },
            () => {
              if (response.statusCode.toString() === '404') {
                // Component does not exists yet, continue ...
                packComponentNamesToPublish.push(packComponentShortName);
              } else {
                util.checkForHttpErrors(response, responseBody);

                const availableVersions = JSON.parse(responseBody);
                if (availableVersions.items.indexOf(packComponentVersion) !== -1) {
                  util.log(`Component '${packComponentShortName}@${packComponentVersion}' of a pack '${packName}' is already published. Skipping.`);
                } else {
                  packComponentNamesToPublish.push(packComponentShortName);
                }
              }
              i += 1;
              fn();
            }
          );
        })
        .catch((error) => {
          reject(error);
        });
      } else {
        resolve(packComponentNamesToPublish);
      }
    }
    fn();
  });
}

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
        const packName = packNames[i];
        const packPath = `${CONSTANTS.JET_COMPONENTS_DIRECTORY}/${packName}`;

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
