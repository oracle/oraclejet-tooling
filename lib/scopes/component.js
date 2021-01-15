#! /usr/bin/env node
/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
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
const url = require('url');

// 3rd party
const archiver = require('archiver');
const extract = require('extract-zip');
const glob = require('glob');

// Oracle
const build = require('../build');
const CONSTANTS = require('../constants');
const exchangeUtils = require('../utils.exchange');
const packLib = require('./pack'); // 'const pack =' has been already used elsewhere, hence packLib
const util = require('../util');

/**
 * ## Variables
 */
const componentsDirPath = CONSTANTS.JET_COMPONENTS_DIRECTORY;

/**
 * # Components
 *
 * @public
 */
const component = module.exports;

/**
 * ## add
 *
 * @public
 * @param {Array} componentNames
 * @param {Object} options
 */
component.add = function (componentNames, options) {
  return new Promise((resolve) => {
    exchangeUtils.getExchangeUrl(); // Ensure it is set before creating jet_components dir
    util.ensureDir(`./${CONSTANTS.JET_COMPONENTS_DIRECTORY}`);

    // The first level function stores user input for the session
    process.env.options = JSON.stringify(options);

    util.loginIfCredentialsProvided()
      .then(() => { // eslint-disable-line
        return exchangeUtils.resolve('add', componentNames, options);
      })
      .then(_executeSolutions)
      .then(() => {
        util.log.success(`Component(s) '${componentNames}' added.`, options);
        resolve();
      })
      .catch((error) => {
        util.log.error(error, true);
      });
  });
};

function _executeSolutions(resolutionServiceResponse) {
  return new Promise((resolve, reject) => {
    if (resolutionServiceResponse.solutions.length === 0) {
      if (resolutionServiceResponse.message) {
        reject(resolutionServiceResponse.message);
      } else {
        reject('Sorry, your request could not be resolved.');
      }
    } else {
      util.log('Updating project components.');
      _applyEnvironmentChangesRemove(resolutionServiceResponse.solutions[0])
        .then((solution) => { // eslint-disable-line
          return _applyEnvironmentChangesAddOrUpdate(solution, 'add');
        })
        .then((solution) => { // eslint-disable-line
          return _applyEnvironmentChangesAddOrUpdate(solution, 'update');
        })
        .then(_applyConfigChanges)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          reject(error);
        });
    }
  });
}

function _applyEnvironmentChangesRemove(solution) {
  return new Promise((resolve) => {
    const changes = solution.environmentChanges;
    if (util.hasProperty(changes, 'remove')) {
      const rmChanges = changes.remove;
      let counter = 0;
      Object.keys(rmChanges).forEach((comp) => {
        const componentDirPath = path.join(componentsDirPath, comp);

        if (typeof rmChanges[comp] === 'string') {
          // Component
          if (fs.existsSync(componentDirPath)) {
            if (fs.existsSync(path.join(componentDirPath, 'types'))) {
              util.removeComponentFromTsconfigPathMapping({ component: comp });
            }
            util.deleteDirSync(componentDirPath);
            counter += 1;
          } else {
            util.log.warning(`Component '${comp}' not found. Skipping.`);
          }
        } else if (typeof rmChanges[comp] === 'object') {
          // Pack
          Object.keys(rmChanges[comp].components).forEach((packComp) => {
            const packComponentDirPath = path.join(componentsDirPath, comp, packComp);

            if (fs.existsSync(packComponentDirPath)) {
              util.deleteDirSync(packComponentDirPath);
              counter += 1;
            } else {
              util.log.warning(`Component '${comp}/${packComp}' not found. Skipping.`);
            }
          });

          // If pack remains empty, delete it
          const packDirs = util.getDirectories(componentDirPath);

          // Find index of the first component
          const index = packDirs.findIndex((dir) => { // eslint-disable-line
            return fs.existsSync(path.join(componentDirPath, dir, CONSTANTS.JET_COMPONENT_JSON));
          });

          // Delete pack
          if (index === -1) {
            if (fs.existsSync(path.join(componentDirPath, 'types'))) {
              util.removeComponentFromTsconfigPathMapping({ component: comp });
            }
            util.log(`Pack '${comp}' removed as it remained empty.`);
            util.deleteDirSync(componentDirPath);
          }
        }
      });
      util.log(`${counter} component(s) removed from project.`);
      resolve(solution);
    } else {
      resolve(solution);
    }
  });
}

function _applyEnvironmentChangesAddOrUpdate(solution, type) {
  return new Promise((resolve, reject) => {
    const changes = solution.environmentChanges;
    if (util.hasProperty(changes, type)) {
      const componentNames = [];
      const envChanges = changes[type];
      let counter = 0;
      Object.keys(envChanges).forEach((comp) => {
        if (typeof envChanges[comp] === 'string') {
          // Component
          componentNames.push(`${comp}@${envChanges[comp]}`);
          counter += 1;
        } else if (typeof envChanges[comp] === 'object') {
          // Pack
          // 1. Add pack itself
          const packDirPath = path.join(componentsDirPath, comp);
          if (fs.existsSync(packDirPath) && type === 'add') {
            // Already exists, add only if versions differ
            const packComponentJsonPath = path.join(packDirPath, CONSTANTS.JET_COMPONENT_JSON);
            const packComponentJson = util.readJsonAndReturnObject(packComponentJsonPath);
            if (packComponentJson.version !== envChanges[comp].version) {
              componentNames.push(`${comp}@${envChanges[comp].version}`);
            } else {
              util.log(`Pack ${comp} already installed. Skipping.`);
            }
          } else {
            // Does not exits yet || Update
            componentNames.push(`${comp}@${envChanges[comp].version}`);
          }

          // 2. Add pack components
          Object.keys(envChanges[comp].components).forEach((packComp) => {
            componentNames.push(`${comp}-${packComp}@${envChanges[comp].components[packComp]}`);
            counter += 1;
          });
        }
      });
      _installComponents(componentNames)
        .then(() => {
          if (componentNames.length > 0) {
            util.log(`${counter} component(s) added to project.`);
          }
        })
        .then(() => {
          resolve(solution);
        })
        .catch((error) => {
          reject(error);
        });
    } else {
      resolve(solution);
    }
  });
}

function _applyConfigChanges(solution) {
  return new Promise((resolve) => {
    util.log('Applying changes to configuration file.');
    const configObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`);
    let components = configObj.components || {};
    const changes = solution.configChanges;

    // Remove
    if (util.hasProperty(changes, 'remove')) {
      const rmChanges = changes.remove;
      Object.keys(rmChanges).forEach((comp) => {
        if (typeof rmChanges[comp] === 'string') {
          // Component
          delete components[comp];
        } else if (typeof rmChanges[comp] === 'object') {
          // Pack
          Object.keys(rmChanges[comp].components).forEach((packComp) => {
            // Condition not to let it crash if user config.json is missing the component
            const cmp = components[comp];
            if (cmp && cmp.components && cmp.components[packComp]) {
              delete components[comp].components[packComp];
            }
          });

          // If pack remains empty, delete it
          if (util.isObjectEmpty(components[comp].components)) {
            delete components[comp];
          }
        }
      });
    }

    // Add
    if (util.hasProperty(changes, 'add')) {
      components = _mergeChanges(components, changes.add);
    }

    // Update
    if (util.hasProperty(changes, 'update')) {
      components = _mergeChanges(components, changes.update);
    }

    // We must reassign as it could be initialised an empty object
    configObj.components = components;
    util.writeFileSync(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`, JSON.stringify(configObj, null, 2));
    util.log('Changes to configuration file applied.');
    resolve();
  });
}

function _mergeChanges(components, changes) {
  const mergedComponents = components;

  Object.keys(changes).forEach((comp) => {
    if (typeof changes[comp] === 'string') {
      // Component
      Object.assign(mergedComponents, { [comp]: changes[comp] });
    } else if (typeof changes[comp] === 'object') {
      // Pack
      const pack = mergedComponents[comp] || {};
      // Merge pack components
      pack.components = pack.components || {};
      Object.assign(pack.components, changes[comp].components);
      // Merge version
      pack.version = changes[comp].version;

      // Merge pack
      mergedComponents[comp] = pack;
    }
  });
  return mergedComponents;
}

/**
 * ## _installComponents
 *
 * @public
 * @param {Array} componentNames
 * @returns {Promise}
 */
function _installComponents(componentNames) {
  return new Promise((resolve, reject) => {
    let i = 0;

    function fn() {
      if (i < componentNames.length) {
        const componentName = componentNames[i];

        _fetchMetadata(componentName)
          .then(_fetchArchive)
          .then(_unpackArchive)
          .then(_installReferenceComponent)
          .then(_shufflePackComponentResources)
          .then(_addToTsconfigPathMapping)
          .then(() => {
            i += 1;
            fn();
          })
          .catch((error) => {
            reject(error);
          });
      } else {
        resolve();
      }
    }
    fn();
  });
}

/**
 * ## _fetchMetadata
 *
 * @private
 * @param {string} componentName
 * @returns {Promise}
 */
function _fetchMetadata(componentName) {
  const config = require('../config'); // eslint-disable-line
  const cachedComponentData = config.get(componentName);
  return new Promise((resolve) => {
    if (cachedComponentData) {
      resolve(cachedComponentData);
    } else {
      exchangeUtils.getComponentMetadata(componentName)
        .then((metadata) => {
          resolve(metadata);
        });
    }
  });
}

/**
 * ## _fetchArchive
 *
 * @private
 * @param {Object} componentMetadata
 * @returns {Promise}
 */
function _fetchArchive(componentMetadata) {
  const metadata = componentMetadata;
  const codeUrl = url.parse(metadata.codeUrl);

  return new Promise((resolve, reject) => {
    util.log(`Fetching '${metadata.name}' bits from Exchange.`);

    util.request({
      useUrl: codeUrl,
    })
      .then((responseData) => {
        const response = responseData.response;
        return exchangeUtils.validateAuthenticationOfRequest(
          response,
        () => { return _fetchArchive(componentMetadata); }, // eslint-disable-line
        () => { // eslint-disable-line
            util.checkForHttpErrors(response, responseData.responseBody);

            util.writeFileSync(`./${metadata.name}.zip`, Buffer.concat(responseData.buffer));
            return metadata;
          }
        );
      })
      .then((data) => {
        resolve(data);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

/**
 * ## _unpackArchive
 *
 * @private
 * @param {Object} componentMetadata
 * @returns {Promise}
 */
function _unpackArchive(componentMetadata) {
  const componentName = componentMetadata.name;
  let componentDirPath = '';

  if (componentMetadata.pack) {
    componentDirPath = path.join(componentsDirPath, componentMetadata.pack, componentName);
  } else {
    componentDirPath = path.join(componentsDirPath, componentName);
  }

  return new Promise((resolve, reject) => {
    // When updating, delete the original one
    if (fs.existsSync(componentDirPath)) {
      if (!componentMetadata.type === 'pack') {
        // 1. Component, just delete dir
        util.deleteDirSync(componentDirPath);
      } else {
        // 2. Pack, delete all files and folders without component.json inside
        // Files
        util.getFiles(componentDirPath).forEach((file) => {
          util.deleteFileSync(path.join(componentDirPath, file));
        });

        // Directories
        util.getDirectories(componentDirPath).forEach((dir) => {
          if (!fs.existsSync(path.join(componentDirPath, dir, CONSTANTS.JET_COMPONENT_JSON))) {
            util.deleteDirSync(path.join(componentDirPath, dir));
          }
        });
      }
    }

    util.log(`Unpacking '${componentName}' archive.`);
    const zipFileName = `${componentName}.zip`;

    extract(zipFileName, {
      dir: path.join(process.cwd(), componentDirPath)
    }, (error) => {
      if (error) {
        reject(error);
      }
      util.deleteFileSync(zipFileName);
      util.log(`Component '${componentName}' archive was successfully unpacked and installed.`);
      resolve(componentMetadata);
    });
  });
}

/**
 * ## _installReferenceComponent
 *
 * @private
 * @param {Object} componentMetadata
 * @returns {Promise}
 */
function _installReferenceComponent(componentMetadata) {
  return new Promise((resolve, reject) => {
    if (componentMetadata.type === 'reference') {
      // Call npm install <componentName>
      const npmPackageName = componentMetadata.component.package;
      const npmPackageVersion = componentMetadata.component.version;
      const npmPackage = `${npmPackageName}@${npmPackageVersion}`;
      util.log(`Installing npm package '${npmPackage}' referenced by '${componentMetadata.name}.'`);
      util.spawn('npm', ['install', npmPackage])
        .then(() => {
          util.log(`Npm package '${npmPackage}' was successfully installed.`);
          resolve(componentMetadata);
        })
        .catch((error) => {
          reject(error);
        });
    } else {
      // Continue doing nothing
      resolve(componentMetadata);
    }
  });
}

/**
 * ## _addToTsconfigPathMapping
 *
 * @private
 * @param {Object} componentMetadata
 * @returns {Promise}
 */
function _addToTsconfigPathMapping(componentMetadata) {
  return new Promise((resolve) => {
    const componentName = componentMetadata.pack || componentMetadata.name;
    const typesDirPath = path.join(
      componentsDirPath,
      componentName,
      'types'
    );
    if (util.fsExistsSync(typesDirPath)) {
      util.addComponentToTsconfigPathMapping({
        component: componentName,
        isLocal: false
      });
    }
    resolve(componentMetadata);
  });
}

/**
 * ## _shufflePackComponentResources
 *
 * Move pack component's min and types folders (if they exist) to
 * <pack>/min and <pack>/types respectively to meet tooling requirements.
 * The packaging / publishing process no longer includes the min and types folders at the
 * pack level due to issues in vb
 * @param {object} componentMetadata
 * @returns {Promise}
 */
function _shufflePackComponentResources(componentMetadata) {
  return new Promise((resolve) => {
    const { pack: componentPack, name: componentName, type } = componentMetadata;
    if (componentPack) {
      // if component belongs to a pack and has a /min folder,
      // move the folder from <pack>/<component>/min to <pack>/min/<component>
      const pathToPack = path.join(componentsDirPath, componentPack);
      const pathToPackComponentMinFolder = path.join(pathToPack, componentName, 'min');
      if (util.fsExistsSync(pathToPackComponentMinFolder)) {
        fs.moveSync(pathToPackComponentMinFolder, path.join(pathToPack, 'min', componentName));
      }
    }
    if (type !== 'pack') {
      // find all *.d.ts files in the none-pack component and move them to
      // <pack>/types/<component> if the component is in a pack and
      // <component>/types if the component is a singleton
      _moveDtsFiles({ componentPack, componentName });
    }
    resolve(componentMetadata);
  });
}

/**
 * ## _moveDtFiles
 *
 * Find all *.d.ts files in a component and move them to <pack>/types/<component> if
 * the component is in a pack and <component>/types if the component
 * is a singleton. This is needed because not all components aggregate
 * their type definition files in the single location ("types" folder)
 * expected by the tooling
 * @param {object} options
 * @param {string} options.componentPack
 * @param {string} options.componentName
 * @returns {void}
 */
function _moveDtsFiles({ componentPack = '', componentName }) {
  if (componentPack) {
    // component is inside a pack
    const componentPackRoot = path.join(componentsDirPath, componentPack);
    const componentRoot = path.join(componentPackRoot, componentName);
    const componentPackTypesFolder = path.join(componentPackRoot, 'types', componentName);
    const componentTypesFolder = path.join(componentRoot, 'types');
    if (util.fsExistsSync(componentTypesFolder) &&
      util.isDirectory(componentTypesFolder)) {
      // <pack>/component>/types found, move all *.d.ts in it to
      // <pack>/types/<component>
      glob.sync('**/*.d.ts', { cwd: componentTypesFolder })
        .forEach((dtsFile) => {
          fs.moveSync(
            path.join(componentTypesFolder, dtsFile),
            path.join(componentPackTypesFolder, dtsFile)
          );
        });
      // if <pack>/<component>/types is empty due to move, delete
      if (!fs.readdirSync(componentTypesFolder).length) {
        fs.removeSync(componentTypesFolder);
      }
    }
    // look for *.d.ts files outside <pack>/<component>/types and copy them to
    // <pack>/types/<component> if an equivalent file is not already present
    glob.sync('**/*.d.ts', { cwd: componentRoot })
      .forEach((dtsFile) => {
        const dtsFileTypesFolderPath = path.join(componentPackTypesFolder, dtsFile);
        if (!fs.existsSync(dtsFileTypesFolderPath)) {
          fs.moveSync(
            path.join(componentRoot, dtsFile),
            dtsFileTypesFolderPath
          );
        }
      });
  } else {
    // component is a singleton
    const componentRoot = path.join(componentsDirPath, componentName);
    const componentTypesFolder = path.join(componentRoot, 'types');
    // look for *.d.ts files outside <component>/types and copy them to
    // <component>/types if an equivalent file is not already present
    glob.sync('**/*.d.ts', { cwd: componentRoot })
      .forEach((dtsFile) => {
        const dtsFileTypesFolderPath = path.join(componentTypesFolder, dtsFile);
        if (!fs.existsSync(dtsFileTypesFolderPath)) {
          fs.moveSync(
            path.join(componentRoot, dtsFile),
            dtsFileTypesFolderPath
          );
        }
      });
  }
}

/**
 * ## list
 * Lists installed components
 *
 * @private
 */
component.list = function () {
  return new Promise((resolve) => {
    // Read components from the config file
    const componentsInConfigFile = [];
    const configObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`);
    if (!util.isObjectEmpty(configObj.components)) {
      Object.keys(configObj.components).forEach((comp) => {
        if (typeof configObj.components[comp] === 'object') {
          // Pack
          Object.keys(configObj.components[comp].components).forEach((packComponent) => {
            componentsInConfigFile.push(`${comp}-${packComponent}`);
          });
        } else {
          componentsInConfigFile.push(comp);
        }
      });
    }

    // Read components by directories
    const componentsByFolder = [];
    if (fs.existsSync(componentsDirPath)) {
      const folderNames = util.getDirectories(componentsDirPath);

      folderNames.forEach((folder) => {
        const componentJson = util.readJsonAndReturnObject(`${componentsDirPath}/${folder}/${CONSTANTS.JET_COMPONENT_JSON}`);

        if (componentJson.type === 'pack') {
          // Components that belongs to pack
          const packFolderNames = util.getDirectories(`${componentsDirPath}/${folder}`);

          packFolderNames.forEach((packFolderName) => {
            const nestedComponentJsonPath = `${componentsDirPath}/${folder}/${packFolderName}/${CONSTANTS.JET_COMPONENT_JSON}`;
            if (fs.existsSync(nestedComponentJsonPath)) {
              componentsByFolder.push(`${folder}-${packFolderName}`);
            }
          });
        } else {
          // Components
          componentsByFolder.push(folder);
        }
      });
    }

    if (componentsByFolder.length === 0 && componentsInConfigFile.length === 0) {
      util.log.success('No components found.');
    }

    util.printList(componentsInConfigFile, componentsByFolder);
    util.log.success('Components listed.');
    resolve();
  });
};

/**
 * ## package
 *
 * @public
 * @param {array} componentNames
 * @param {Object} [options]
 * @return {Promise}
 */
component.package = function (componentNames, options) {
  return new Promise((resolve) => {
    util.ensureParameters(componentNames, CONSTANTS.API_TASKS.PUBLISH);

    // The first level function stores user input for the session
    process.env.options = JSON.stringify(options);
    const opts = options || {};

    // We allow packaging of only a single component
    // If multiple, it would be hard distinguish between
    // single component and a single pack component
    // The syntax follows existing ojet.publish() that provides --pack flag
    // User can script a loop if he wants to package multiple component
    const componentName = componentNames[0];
    let componentPath = _getBuiltComponentPath(componentName, opts);
    const hadBeenBuiltBefore = !!componentPath;

    // If pack name was used as the component name
    // package only pack itself (excluding its dependencies)

    // We need component's metadata to check if type === 'pack'
    // It's never going to be the case for pack's components. As getting metadata
    // of pack's components is more complex (see _getBuiltComponentPath()) we exclude this case
    if (!opts.pack) {
      const componentMetadata = util.getComponentJson({
        component: componentName,
        built: hadBeenBuiltBefore
      });
      // Is it a component of a type 'pack'?
      if (componentMetadata.type === 'pack' &&
        // Pack content is already known, avoid infinite loop. Loop explanation:
        // Under the hood packaging of a pack calls component.package() but with a known content.
        !util.hasProperty(opts, '_contentToArchive')
      ) {
        // Package the pack excluding dependencies
        opts._excludeDependencies = true;
        return packLib.package([componentName], opts);
      }
    }
    // Create archive
    util.ensureDir(CONSTANTS.PACKAGE_OUTPUT_DIRECTORY);
    opts._output = path.join(CONSTANTS.PACKAGE_OUTPUT_DIRECTORY, `${componentName}.zip`);

    // If we are publishing non-pack component, we trigger standard
    // component build ('ojet build component <component-name>'
    // If we are publishing component from a pack, we need to trigger
    // general build ('ojet build') to build a complete pack
    const buildOptions = opts.pack ? {} : { component: componentName };

    // Should we build component or can we skip that initial step?
    const initalPromise = hadBeenBuiltBefore ? Promise.resolve() : build('web', buildOptions);

    return initalPromise
      .then(() => {
        if (!hadBeenBuiltBefore) {
          // Component hasn't been built before triggering 'ojet package component ...'
          // _getBuiltComponentPath returned empty string
          // Hence we build the component in previous promise
          // Now it is built. We need to get path again to replace empty string with existing path
          componentPath = _getBuiltComponentPath(componentName, opts);
        }
      })
      .then(() => { // eslint-disable-line
        return _packArchive(componentName, componentPath, opts);
      })
      .then(() => {
        util.log.success(`Component ${componentName} was packaged.`, opts);
        resolve();
      })
      .catch((error) => {
        util.log.error(error, true);
      });
  });
};

function _getBuiltComponentPath(componentName, opts) {
  const configPaths = util.getConfiguredPaths();
  let packVersion = '';
  let componentVersion = '';

  if (!opts.pack) {
    // Singleton component or pack
    componentVersion = util.getComponentVersion({ component: componentName });
  } else {
    // Component inside pack
    packVersion = util.getComponentVersion({ component: opts.pack });
    componentVersion = util.getComponentVersion({ pack: opts.pack, component: componentName });
  }

  const endDirPath = opts.pack ?
    path.join(opts.pack, packVersion, componentName) :
    path.join(componentName, componentVersion);

  const componentWebDirPath = path.join(
    configPaths.staging.web,
    configPaths.src.javascript,
    configPaths.composites,
    endDirPath
  );

  const componentHybridDirPath = path.join(
    configPaths.staging.hybrid,
    'www',
    configPaths.src.javascript,
    configPaths.composites,
    endDirPath
  );

  const existsInWebDir = fs.existsSync(componentWebDirPath);
  const existsInHybridDir = fs.existsSync(componentHybridDirPath);

  if (!existsInWebDir && !existsInHybridDir) {
    return '';
  }

  return existsInHybridDir ? componentHybridDirPath : componentWebDirPath;
}

/**
 * ## publish
 *
 * @public
 * @param {string} componentName
 * @param {Object} [options]
 */
component.publish = function (componentName, options) {
  return new Promise((resolve) => {
    util.ensureParameters(componentName, CONSTANTS.API_TASKS.PUBLISH);

    // The first level function stores user input for the session
    process.env.options = JSON.stringify(options);
    const opts = options || {};

    // We allow publishing of only a single component
    // If multiple, it would be hard distinguish between
    // single component and a single pack component
    // User can script a loop if he wants to package multiple component
    let componentPath = opts.path || _getBuiltComponentPath(componentName, opts);
    const hadBeenBuiltBefore = !!componentPath;

    // If pack name was used as the component name
    // package only pack itself (excluding its dependencies)

    // We need component's metadata to check if type === 'pack'
    // It's never going to be the case for pack's components. As getting metadata
    // of pack's components is more complex (see _getBuiltComponentPath()) we exclude this case
    if (!opts.pack) {
      // Read the metadata of a first level component
      const componentMetadata = util.getComponentJson({
        component: componentName,
        built: hadBeenBuiltBefore
      });

      // Is it a component of a type 'pack'?
      if (componentMetadata.type === 'pack' &&
        // Pack content is already known, avoid infinite loop. Loop explanation:
        // Under the hood packaging of a pack calls component.package() but with a known content.
        !util.hasProperty(opts, '_contentToArchive')
      ) {
        // Publish the pack excluding dependencies
        opts._excludeDependencies = true;
        return packLib.publish(componentName, opts);
      }
    }

    // If we are publishing non-pack component, we trigger standard
    // component build ('ojet build component <component-name>'
    // If we are publishing component from a pack, we need to trigger
    // general build ('ojet build') to build a complete pack
    const buildOptions = opts.pack ? {} : { component: componentName };

    // Should we build component or can we skip that initial step?
    const initalPromise = hadBeenBuiltBefore ? Promise.resolve() : build('web', buildOptions);

    return initalPromise
      .then(() => {
        if (!hadBeenBuiltBefore) {
          // Component hasn't been built before triggering 'ojet package component'
          // _getBuiltComponentPath returned empty string
          // Hence we build the component in previous promise
          // Now it is built. We need to get path again to replace empty string with existing path
          componentPath = _getBuiltComponentPath(componentName, opts);
        }
      })
      .then(() => { // eslint-disable-line
        return util.loginIfCredentialsProvided();
      })
      .then(() => { // eslint-disable-line
        if (!opts.path) {
          return _packArchive(componentName, componentPath, opts);
        }
        return true;
      })
      .then(() => { // eslint-disable-line
        return exchangeUtils.uploadToExchange(componentName, opts);
      })
      .then(() => {
        const resolvedComponentName = opts.pack ? `'${componentName}' of a pack '${opts.pack}'` : `'${componentName}'`;
        util.log.success(`Component ${resolvedComponentName} was published.`, opts);
        resolve();
      })
      .catch((error) => {
        util.log.error(error, true);
      });
  });
};

/**
 * ## _packArchive
 * Archives component folder
 *
 * @private
 * @param {string} componentName
 * @param {string} componentPath
 * @param {Object} [options]
 * @returns {Promise}
 */
function _packArchive(componentName, componentPath, options) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(options._output ? options._output : './component.zip');
    const archive = archiver('zip');

    output.on('close', () => {
      const resolvedComponentName = options.pack ? `'${componentName}' of a pack '${options.pack}'` : `'${componentName}'`;
      util.log(`Component ${resolvedComponentName} was successfully archived.`);
      resolve();
    });

    archive.on('warning', (error) => {
      util.log.warning(error);
    });

    archive.on('error', (error) => {
      reject(error);
    });

    archive.pipe(output);

    if (options && options._contentToArchive) {
      const customPaths = options._contentToArchive;
      customPaths.dirs.forEach((dir) => {
        archive.directory(path.join(componentPath, dir), dir);
      });
      customPaths.files.forEach((file) => {
        archive.file(path.join(componentPath, file), { name: file });
      });
      customPaths.minFiles.forEach((file) => {
        archive.file(path.join(componentPath, 'min', file), { name: `min/${file}` });
      });
    } else if (options && options.pack) {
      // zip component files
      archive.directory(componentPath, false);
      // include min folder from pack in zip
      const pathToPack = path.join(componentPath, '..');
      const pathToComponentMinFolder = path.join(pathToPack, 'min', componentName);
      if (util.fsExistsSync(pathToComponentMinFolder)) {
        archive.directory(pathToComponentMinFolder, 'min');
      }
      // include types folder from pack in zip
      const pathToComponentTypesFolder = path.join(pathToPack, 'types', componentName);
      if (util.fsExistsSync(pathToComponentTypesFolder)) {
        archive.directory(pathToComponentTypesFolder, 'types');
      }
    } else {
      archive.glob('**/*', {
        cwd: componentPath
      });
    }

    archive.finalize();
  });
}

/**
 * ## remove
 *
 * @public
 * @param {Array} componentNames
 * @param {Boolean} isStrip
 * @param {Object} options
 */
component.remove = function (componentNames, isStrip, options) {
  return new Promise((resolve) => {
    // Skip this if it's strip and there are no components
    if (isStrip && (!componentNames || componentNames.length === 0)) {
      resolve();
      return;
    }
    util.ensureParameters(componentNames, CONSTANTS.API_TASKS.REMOVE);
    exchangeUtils.resolve('remove', componentNames)
      .then(_executeSolutions)
      .then(() => {
        if (componentNames.length !== 0 && !isStrip) {
          util.log.success(`Component(s) '${componentNames}' removed.`, options);
        }
        if (isStrip) {
          util.log.success('Strip project finished.');
        }
        resolve();
      })
      .catch((error) => {
        util.log.error(error, true);
      });
  });
};
