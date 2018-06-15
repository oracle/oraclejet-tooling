#! /usr/bin/env node
/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

/**
 * ## Dependencies
 */
// Node
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const readline = require('readline');
const url = require('url');
const Writable = require('stream').Writable;

// 3rd party
const archiver = require('archiver');
const extract = require('extract-zip');
const FormData = require('form-data');

// Oracle
const CONSTANTS = require('../constants');
const util = require('../util');

/**
 * ## Variables
 */
const componentsDirPath = './src/js/jet-composites/';

/**
 * # Components
 *
 * @public
 */
const component = module.exports;
// Saving parents because installing circular dependencies would cause troubles
let parentChain = [];

/**
 * ## add
 *
 * @public
 * @param {Array} componentNames
 */
component.add = function (componentNames) {
  return new Promise((resolve) => {
    util.ensureCatalogUrl();
    util.ensureDir(`./src/js/${CONSTANTS.JET_COMPOSITE_DIRECTORY}/`);

    // Install all first level components
    _installComponents(componentNames, true, resolve);
  });
};

/**
 * ## _installComponents
 *
 * @public
 * @param {Array} componentNames
 * @param {boolean} isFirstLevelComponent - to know whether to write to config file or not
 * @param {function} resolve              - resolve the wrapping Promise component.add()
 */
function _installComponents(componentNames, isFirstLevelComponent, resolve) {
  let i = 0;

  // Recursive installation of components
  function fn() {
    if (i < componentNames.length) {
      if (isFirstLevelComponent) {
        // Always reset with the first level dependency installation
        parentChain = [componentNames[i]];
      }

      const componentName = componentNames[i];
      const requestedVersion = _getRequestedVersion(componentName);
      const plainComponentName = _getPlainComponentName(componentName);
      const componentDirPath = componentsDirPath + plainComponentName;

      if ((requestedVersion && isFirstLevelComponent) || !fs.existsSync(componentDirPath)) {
        // Version specified && is first level component => override without prompting ||
        // Version not specified, but the component is not installed yet => install the latest
        _installComponent(componentName, isFirstLevelComponent, fn);
      } else {
        // Prompt the user if:
        // Version not specified for the first level component which is already installed ||
        // Installing dependency which is already installed
        _validateComponentPresenceAndVersion(componentName, fn, (compName) => {
          _installComponent(compName, isFirstLevelComponent, fn, i);
        });
      }
      i += 1;
    } else {
      util.log(`Component(s) '${componentNames}' installation finished.`);
      resolve();
    }
  }
  fn();
}

/**
 * ## _installComponent
 *
 * @public
 * @param {string} componentName
 * @param {boolean} isFirstLevelComponent - to know whether to write to config file or not
 * @param {function} callback
 * @param {number} [i]                    - loop number for handling circular dependency detection
 */

function _installComponent(componentName, isFirstLevelComponent, callback, i) {
  // Handle circular dependency detection array
  if (!isFirstLevelComponent) {
    _checkForCircularDependency(componentName);
    if (i && i > 0) {
      parentChain.pop();
    }
    parentChain.push(componentName);
  }

  function _addComponentNameToList(componentMetadata) {
    if (isFirstLevelComponent) {
      return new Promise((resolve) => {
        const compName = componentMetadata.name;
        const configObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`);
        configObj.composites = configObj.composites || {};
        configObj.composites[compName] = componentMetadata.version;
        fs.writeFileSync(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`, JSON.stringify(configObj, null, 2));
        util.log(`Component '${compName}' was added to components config file.`);
        resolve(componentMetadata);
      });
    }
    return new Promise((resolve) => {
      resolve(componentMetadata);
    });
  }

  // Installation - splitting the promise chain to make _addComponentNameToList conditional
  const initialPromiseChain = _fetchMetadata(componentName)
    .then(_fetchArchive)
    .then(_unpackArchive)
    .then(_addComponentNameToList);

  // Installation - the second part of the proimse chain
  initialPromiseChain.then(_fetchResolvedDependenciesList)
    .then(_installDependencies)
    .then(() => {
      util.log(`Component '${_getPlainComponentName(componentName)}' was added to project.`);
      if (typeof callback === 'function') {
        callback();
      }
    })
    .catch((error) => {
      util.log.error(error);
    });
}

function _validateComponentPresenceAndVersion(componentName, skip, install) {
  const plainComponentName = _getPlainComponentName(componentName);
  const localVersion = _checkForLocalComponentVersion(plainComponentName);

  // Get the available version
  _fetchMetadata(componentName)
    .then((metadata) => {
      if (localVersion === metadata.version) {
        util.log(`Component '${componentName}@${localVersion} already installed. Skipping.`);
        skip();
      } else {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: false
        });
        const instruction = "Please type '1' to keep local version, '2' to override with requested version, 'q' to cancel installation.\n";

        rl.question(`\n\x1b[33mConflict: '${plainComponentName}' already installed.\x1b[0m
1. Local version: ${plainComponentName}@${localVersion}
2. Requested version: ${plainComponentName}@${metadata.version}
${instruction}`, (choice) => {
          _processConflict(rl, choice, instruction);
        });
      }

      function _processConflict(rl, choice, instruction) {
        switch (choice) {
          case '1': {
            util.log('Local version will be kept.');
            rl.close();
            skip();
            break;
          }
          case '2': {
            util.log('Requested version will be installed.');
            rl.close();
            install(componentName);
            break;
          }
          case 'q':
            util.log.warning('Process was canceled.');
            process.exit(0);
            break;
          default: {
            rl.question(instruction, (nextChoiceAttempt) => {
              _processConflict(rl, nextChoiceAttempt, instruction);
            });
          }
        }
      }
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
  const requestedVersion = _getRequestedVersion(componentName);
  const plainComponentName = _getPlainComponentName(componentName);

  const pathBase = `/components/${plainComponentName}`;
  const requestPath = requestedVersion ? `${pathBase}/versions/${requestedVersion}` : pathBase;
  return new Promise((resolve) => {
    util.log(`Fetching '${plainComponentName}' metadata from Catalog ...`);

    util.request({
      path: requestPath,
    }, (response) => {
      let responseBody = '';
      response.on('data', (respBody) => {
        responseBody += respBody;
      });
      response.on('end', () => {
        util.checkForHttpErrors(response, responseBody);

        util.log(`Component '${plainComponentName}' metadata successfully fetched.`);

        const metadata = JSON.parse(responseBody);

        resolve(metadata);
      });
    });
  });
}

/**
 * ## _getRequestedVersion
 *
 * @private
 * @param {string} componentName
 * @returns {string || undefined} version
 */
function _getRequestedVersion(componentName) {
  const split = componentName.split('@');
  if (split.length > 2) {
    throw util.toError('Wrong version specification: "@" can be used only once.');
  }
  const version = split[1];
  return version;
}

/**
 * ## _getPlainComponentName
 *
 * @private
 * @param {string} componentName
 * @returns {string} componentName - version specification is trimmed
 */
function _getPlainComponentName(componentName) {
  // Trim version specification from the user input
  const versionSymbolIndex = componentName.indexOf('@');

  if (versionSymbolIndex === 0) {
    throw util.toError('Missing component name');
  }
  return versionSymbolIndex > 0 ? componentName.substring(0, componentName.indexOf('@')) : componentName;
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
  const connection = url.parse(metadata.codeUrl);

  return new Promise((resolve) => {
    util.log(`Fetching '${metadata.name}' bits from Catalog ...`);
    const protocol = connection.protocol === 'https:' ? https : http;

    protocol.get(connection, (response) => {
      const buffers = [];
      response.on('data', (body) => {
        buffers.push(body);
      });
      response.on('end', () => {
        fs.writeFileSync(`./${metadata.name}.zip`, Buffer.concat(buffers));
        resolve(metadata);
      });
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
  const componentDirPath = componentsDirPath + componentName;
  // If component already exists, remove it
  if (fs.existsSync(componentDirPath)) {
    util.deleteDir(componentDirPath);
  }

  return new Promise((resolve) => {
    util.log(`Unpacking '${componentName}' archive ...`);
    const zipFileName = `${componentName}.zip`;

    extract(zipFileName, {
      dir: path.join(process.cwd(), componentDirPath)
    }, (error) => {
      if (error) {
        throw util.toError(error);
      }
      util.deleteFile(zipFileName, () => {
        util.log(`Component '${componentName}' archive was successfully unpacked and installed.`);
        resolve(componentMetadata);
      });
    });
  });
}

/**
 * ## _fetchResolvedDependenciesList
 *
 * @private
 * @param {Object} componentMetadata
 * @returns {Promise}
 */
function _fetchResolvedDependenciesList(componentMetadata) {
  const metadata = componentMetadata;
  return new Promise((resolve) => {
    util.request({
      path: `/components/${metadata.name}/versions/${metadata.version}/compositeDependencies`,
    }, (response) => {
      let responseBody = '';
      response.on('data', (respBody) => {
        responseBody += respBody;
      });
      response.on('end', () => {
        util.checkForHttpErrors(response, responseBody);

        util.log(`Component '${metadata.name}' resoloved dependencies list successfully fetched.`);

        metadata.resolvedDependencies = JSON.parse(responseBody);

        resolve(metadata);
      });
    });
  });
}

/**
 * ## _installDependencies
 *
 * @private
 * @param {Object} componentMetadata
 * @returns {Promise}
 */
function _installDependencies(componentMetadata) {
  return new Promise((resolve) => {
    const dependenciesObj = componentMetadata.resolvedDependencies;
    if (util.isObjectEmpty(dependenciesObj)) {
      util.log(`Component '${componentMetadata.name}' has no dependencies. Continuing.`);
      resolve();
    } else {
      const dependencies = [];
      Object.keys(dependenciesObj).forEach((key) => {
        if (util.hasProperty(dependenciesObj[key], 'availableVersion')) {
          dependencies.push(`${key}@${dependenciesObj[key].availableVersion}`);
        } else {
          dependencies.push(`${key}@${dependenciesObj[key].requiredVersion}`);
        }
      });
      _installComponents(dependencies, false, resolve);
    }
  });
}

/**
 * ## _checkForCircularDependency
 *
 * @private
 * @param {string} dependencyName
 */
function _checkForCircularDependency(dependencyName) {
  const plainComponentName = _getPlainComponentName(dependencyName);
  // Prevent circular dependencies
  parentChain.forEach((comp) => {
    const parentPlainComponentName = _getPlainComponentName(comp);

    if (plainComponentName === parentPlainComponentName) {
      util.log.error(`Circular dependency '${plainComponentName}' detected.`);
    }
  });
}

/**
 * ## _checkForLocalComponentVersion
 *
 * @private
 * @param {string} componentName
 * @returns {string} version
 */
function _checkForLocalComponentVersion(componentName) {
  try {
    const comp = util.readJsonAndReturnObject(`${componentsDirPath}${componentName}/component.json`);
    return comp.version;
  } catch (error) {
    throw util.toError(`Can not read '${componentName}' component.json config file.`);
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
    if (!util.isObjectEmpty(configObj.composites)) {
      Object.keys(configObj.composites).forEach((key) => {
        componentsInConfigFile.push(key);
      });
    }

    // Read components by directories
    let componentsByFolder = [];
    if (fs.existsSync(componentsDirPath)) {
      componentsByFolder = util.getDirectories(componentsDirPath);
    }

    if (componentsByFolder.length === 0 && componentsInConfigFile.length === 0) {
      util.log.success('No components found.');
    }

    // Output variables
    const nameMaxLength = 30;
    const space = ' ';

    // Print headline
    const headlineName = 'name';
    const headlineNote = 'note';
    let headline = '';
    const headlineNameSpaces = nameMaxLength - headlineName.length;
    if (headlineNameSpaces < 0) {
      headline += `<${headlineName.substring(0, nameMaxLength - 2)}>`;
    } else {
      headline += `<${headlineName}>${space.repeat(headlineNameSpaces - 2)}`;
    }
    headline += `${space}<${headlineNote}>`;
    util.log(headline);

    // Print components list
    componentsByFolder.forEach((comp) => {
      let line = _constructLineOutput(comp, nameMaxLength, space);
      line += `${space}${_addWarningMissingInConfig(comp, componentsInConfigFile)}`;
      util.log(line);
    });

    // Print components from the config file which are not install
    componentsInConfigFile.forEach((comp) => {
      if (componentsByFolder.indexOf(comp) === -1) {
        let line = _constructLineOutput(comp, nameMaxLength, space);
        line += `${space}Warning: found in the config file but not installed. Please restore.`;
        util.log(line);
      }
    });

    util.log.success('Components listed.');
    resolve();
  });
};

/**
 * ## _constructLineOutput
 *
 * @private
 * @param {string} componentName
 * @param {number} nameMaxLength
 * @param {string} space
 * @returns {string}
 */
function _constructLineOutput(componentName, nameMaxLength, space) {
  const componentNameSpaces = nameMaxLength - componentName.length;
  if (componentNameSpaces < 0) {
    return `${componentName.substring(0, nameMaxLength)}`;
  }
  return `${componentName}${space.repeat(componentNameSpaces)}`;
}

/**
 * ## _addWarningMissingInConfig
 *
 * @private
 * @param {string} componentName
 * @param {Array} componentsInConfigFile
 * @returns {string}
 */
function _addWarningMissingInConfig(componentName, componentsInConfigFile) {
  if (componentsInConfigFile.indexOf(componentName) === -1) {
    return 'Local component or installed as dependency. Not found in the config file.';
  }
  return '';
}

let token = '';

/**
 * ## publish
 *
 * @param {string} componentName
 * @param {Object} [options]
 * @public
 */
component.publish = function (componentName, options) {
  return new Promise((resolve) => {
    util.ensureParameters(componentName, CONSTANTS.API_TASKS.PUBLISH);

    if (!fs.existsSync(componentsDirPath + componentName)) {
      util.log.error(`Component '${componentName}' not found in the project.`);
    }

    const user = options.username;
    const pass = options.password;
    if (user && typeof user !== 'boolean' &&
      pass && typeof pass !== 'boolean') {
      _getAccessToken(user, pass, (accessToken) => {
        token = accessToken;
        _publish(componentName, () => {
          resolve();
        });
      });
    } else {
      _login((accessToken) => {
        token = accessToken;
        _publish(componentName, () => {
          resolve();
        });
      });
    }
  });
};

/**
 * ## _getAccessToken
 *
 * @private
 * @param {string} user
 * @param {string} pass
 * @param {function} callback
 */
function _getAccessToken(user, pass, callback) {
  // Web case - Authorization Code Grant Type
  // http://docs.oracle.com/en/cloud/paas/identity-cloud/idcsb/AuthCodeGT.html

  // CLI case - Resource Owner Password Credentials Grant Type
  const body = `username=${user}&password=${pass}`;

  util.request({
    method: 'POST',
    path: '/auth/token'
  }, (response) => {
    let responseBody = '';
    response.on('data', (respBody) => {
      responseBody += respBody;
    });
    response.on('end', () => {
      util.checkForHttpErrors(response, responseBody);
      callback(responseBody);
    });
  }, body);
}

/**
 * ## _publish
 *
 * @param {string} parameter - Component name
 * @param {function} callback
 * @private
 */
function _publish(parameter, callback) {
  _packArchive(parameter)
    .then(_uploadToCatalog)
    .then(() => {
      util.log.success(`Component '${parameter}' was uploaded to catalog.`);
      callback();
    })
    .catch((error) => {
      util.log.error(error);
    });
}

/**
 * ## _login
 *
 * @param {function} callback
 * @private
 */
function _login(callback) {
  const mutableStdout = new Writable({
    write(chunk, encoding, cb) {
      if (!this.muted) {
        process.stdout.write(chunk, encoding);
      }
      cb();
    }
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: mutableStdout,
    terminal: true
  });

  rl.question('Username: ', (user) => {
    rl.question('Password: ', (pass) => {
      mutableStdout.muted = false;
      util.log('\n');
      rl.close();

      _getAccessToken(user, pass, (accessToken) => {
        util.log('Access token successfully retreived.');
        callback(accessToken);
      });
    });
    mutableStdout.muted = true;
  });
}

/**
 * ## _packArchive
 * Archives component folder
 *
 * @private
 * @param {string} componentName
 * @returns {Promise}
 */
function _packArchive(componentName) {
  const componentDirPath = componentsDirPath + componentName;
  return new Promise((resolve) => {
    const output = fs.createWriteStream(`./${componentName}.zip`);
    const archive = archiver('zip');

    output.on('close', () => {
      util.log(`Component '${componentName}' was successfully archived.`);
      resolve(componentName);
    });

    archive.on('warning', (error) => {
      util.log.warning(error);
    });

    archive.on('error', (error) => {
      throw util.toError(error);
    });

    archive.pipe(output);
    archive.glob('**/*', {
      cwd: componentDirPath
    });
    archive.finalize();
  });
}

/**
 * ## _uploadToCatalog
 *
 * @private
 * @param {string} componentName
 * @returns {Promise}
 */
function _uploadToCatalog(componentName) {
  return new Promise((resolve) => {
    util.log(`Uploading '${componentName}' archive to catalog ...`);
    const archivePath = `./${componentName}.zip`;

    // Sending multipart form data
    // https://www.npmjs.com/package/form-data#alternative-submission-methods
    const multipart = new FormData();
    multipart.append('name', componentName);
    multipart.append('file', fs.createReadStream(`./${componentName}.zip`));

    const multipartHeaders = multipart.getHeaders();
    const customHeaders = {
      Authorization: `${token}`
    };
    const headers = Object.assign(multipartHeaders, customHeaders);

    util.request({
      method: 'POST',
      headers,
      path: '/components?access=PUBLIC',
    }, (response) => {
      let responseBody = '';
      response.on('data', (respBody) => {
        responseBody += respBody;
      });
      response.on('end', () => {
        util.checkForHttpErrors(response, responseBody, () => {
          util.deleteFile(archivePath);
        });
        util.log(`Component '${componentName}' was successfully uploaded to catalog.`);
        util.deleteFile(archivePath, () => {
          resolve();
        });
      });
    }, undefined, multipart);
  });
}

/**
 * ## remove
 *
 * @public
 * @param {Array} componentNames
 * @param {Boolean} isStrip
 */
component.remove = function (componentNames, isStrip) {
  return new Promise((resolve) => {
    util.ensureParameters(componentNames, CONSTANTS.API_TASKS.REMOVE);

    componentNames.forEach((parameter) => {
      const deleteCmpDir = componentsDirPath + parameter;

      if (fs.existsSync(deleteCmpDir)) {
        _checkComponentDependencies(parameter);
        util.deleteDir(deleteCmpDir);
      } else {
        util.log.warning(`Component '${parameter}' does not exists. Skipping.`);
      }
      _removeComponentNameFromList(parameter, isStrip);
    });

    if (componentNames.length !== 0 && !isStrip) {
      util.log.success(`Component(s) '${componentNames}' removed.`);
    }
    if (isStrip) util.log.success('Strip project finished.');
    resolve();
  });
};

/**
 * ## _checkComponentDependencies
 *
 * @param {string} componentName
 * @private
 */
function _checkComponentDependencies(componentName) {
  const componentConfigFile = `${componentsDirPath}${componentName}/component.json`;
  const configObj = util.readJsonAndReturnObject(componentConfigFile);

  if (util.hasProperty(configObj, 'compositeDependencies')) {
    util.log.warning(`'${componentName}'s' dependencies were not removed.`);
  }
}

/**
 * ## _updateComponentList
 *
 * @param {string} action
 * @param {string} componentName
 * @private
 */
function _removeComponentNameFromList(componentName, isStrip) {
  if (isStrip) return;
  const configObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`);

  if (util.hasProperty(configObj, 'composites')) {
    if (util.hasProperty(configObj.composites, componentName)) {
      delete configObj.composites[componentName];
      fs.writeFileSync(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`, JSON.stringify(configObj, null, 2));
      util.log(`Component ${componentName} was removed from the config file.`);
    } else {
      util.log.warning(`Component '${componentName}' not found in config file. Skipping.`);
    }
  } else {
    util.log.warning(`Component list not found in the config file, component '${componentName}' could not be removed from the list. Skipping.`);
  }
}
