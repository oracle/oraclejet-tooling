#! /usr/bin/env node
/**
  Copyright (c) 2015, 2019, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

/**
 * ## Dependencies
 */
// Node
const fs = require('fs');
const FormData = require('form-data');
const homedir = require('os').homedir();
const path = require('path');
const readline = require('readline');
const Writable = require('stream').Writable;

// Oracle
const CONSTANTS = require('./constants');
const util = require('./util');

/**
 * # Utils
 *
 * @public
 */
const exchangeUtils = module.exports;
let requestObject = {};

/**
 * ## getComponentMetadata
 *
 * @private
 * @param {string} componentName
 * @returns {Promise}
 */
exchangeUtils.getComponentMetadata = function (componentName) {
  const requestedVersion = util.getRequestedComponentVersion(componentName);
  const plainComponentName = util.getPlainComponentName(componentName);

  const pathBase = `/components/${plainComponentName}`;
  const requestPath = requestedVersion ? `${pathBase}/versions/${requestedVersion}` : pathBase;
  return new Promise((resolve, reject) => {
    util.log(`Fetching '${plainComponentName}' metadata from Exchange.`);

    util.request({
      path: requestPath
    })
    .then((responseData) => {
      const response = responseData.response;
      const responseBody = responseData.responseBody;
      return exchangeUtils.validateAuthenticationOfRequest(
        response,
        () => { return exchangeUtils.getComponentMetadata(componentName); }, // eslint-disable-line
        () => {
          util.checkForHttpErrors(response, responseBody);

          util.log(`Component '${plainComponentName}' metadata successfully fetched.`);
          const metadata = util.convertJsonToObject(responseBody);

          // Cache metadata
          const config = require('./config'); // eslint-disable-line
          config(`${componentName}@${metadata.version}`, metadata);
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
};

/**
 * ## _getConfig
 *
 * @private
 */
function _getConfig() {
  return util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`).components;
}

/**
 * ## _getEnvironment
 *
 * @private
 */
function _getEnvironment() {
  const jetCompsDir = `./${CONSTANTS.JET_COMPONENTS_DIRECTORY}`;
  const compJson = CONSTANTS.JET_COMPONENT_JSON;
  const componentsDirectories = util.getDirectories(jetCompsDir);
  const environment = {};
  componentsDirectories.forEach((componentDir) => {
    const componentJsonPath = path.join(jetCompsDir, componentDir, compJson);
    const componentJson = util.readJsonAndReturnObject(componentJsonPath);

    if (componentJson.type === 'pack') {
      environment[componentDir] = {
        version: componentJson.version,
        components: {}
      };
      const packComponentsDirectories = util.getDirectories(path.join(jetCompsDir, componentDir));

      packComponentsDirectories.forEach((packComponentDir) => {
        const compJsonPath = path.join(jetCompsDir, componentDir, packComponentDir, compJson);
        if (fs.existsSync(compJsonPath)) {
          const packComponentJson = util.readJsonAndReturnObject(compJsonPath);

          environment[componentDir].components[packComponentJson.name] = packComponentJson.version;
        }
      });
    } else {
      environment[componentJson.name] = componentJson.version;
    }
  });

  return environment;
}

/**
 * ## _getChanges
 *
 * @private
 * @param {string} changeType
 * @param {Array} componentNames
 * @param {Object} options
 * @returns {Promise}
 */
function _getChanges(changeType, componentNames, options) {
  return new Promise((resolve, reject) => {
    let i = 0;
    let firstPackName = '';

    function fn() {
      if (i < componentNames.length) {
        const componentName = componentNames[i];

        const requestedVersion = util.getRequestedComponentVersion(componentName);
        const plainComponentName = util.getPlainComponentName(componentName);

        if (changeType === 'add' && options && options['pack-version']) {
          exchangeUtils.getComponentMetadata(componentName)
            .then((metadata) => {
              // Add component to changes property
              requestObject.changes[changeType][plainComponentName] = requestedVersion || '*';

              // If pack, add also pack to changes property
              const packName = metadata.pack;
              if (packName) {
                if (changeType === 'add' && options && options['pack-version']) {
                  if (firstPackName === '' || firstPackName === packName) {
                    firstPackName = packName;
                    requestObject.changes[changeType][packName] = options['pack-version'];
                  } else {
                    reject(`Component ${componentName} does not belong to a ${firstPackName} pack.`);
                  }
                } else {
                  requestObject.changes[changeType][packName] = '*';
                }
              }
            })
            .then(() => {
              i += 1;
              fn();
            })
            .catch((error) => {
              reject(error);
            });
        } else {
          // Add component to changes property
          requestObject.changes[changeType][plainComponentName] = requestedVersion || '*';
          i += 1;
          fn();
        }
      } else {
        resolve();
      }
    }
    fn();
  });
}

/**
 * ## resolveDependencies
 *
 * @public
 * @returns {Promise}
 */
exchangeUtils.resolveDependencies = function () {
  return new Promise((resolve, reject) => {
    util.log('Resolving dependencies.');

    util.request({
      method: 'PUT',
      path: '/dependencyResolver',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
    }, JSON.stringify(requestObject))
      .then((responseData) => {
        const response = responseData.response;
        const responseBody = responseData.responseBody;
        return exchangeUtils.validateAuthenticationOfRequest(
          response,
          () => { return exchangeUtils.resolveDependencies(); }, // eslint-disable-line
          () => {
            util.checkForHttpErrors(response, responseBody);

            const responseBodyCopy = util.convertJsonToObject(responseBody);
            if (responseBodyCopy.solutions && responseBodyCopy.solutions.length === 0) {
              util.log.warning('Requested component(s)/version(s) or their dependencies cannot be found in Exchange or are in conflict with already installed components.');
            } else {
              util.log('Dependencies resolved.');
            }
            return responseBodyCopy;
          });
      })
      .then((resp) => {
        resolve(resp);
      })
      .catch((error) => {
        reject(error);
      });
  });
};

/**
 * ## getAccessToken
 *
 * @private
 * @param {string} user
 * @param {string} pass
 * @returns {Promise}
 */
exchangeUtils.getAccessToken = function (user, pass) {
  // Web case - Authorization Code Grant Type
  // http://docs.oracle.com/en/cloud/paas/identity-cloud/idcsb/AuthCodeGT.html

  // CLI case - Resource Owner Password Credentials Grant Type
  return new Promise((resolve, reject) => {
    const basicAuthCredentials = `${user || ''}:${pass || ''}`;
    const credentialsBuffer = new Buffer.from(basicAuthCredentials); // eslint-disable-line
    const base64data = credentialsBuffer.toString('base64');

    util.request({
      method: 'GET',
      path: '/auth/token',
      headers: {
        Authorization: `Basic ${base64data}`
      }
    })
    .then((responseData) => {
      const response = responseData.response;
      const responseBody = responseData.responseBody;

      if (util.isVerbose()) {
        util.log('Access token:');
        util.log(responseBody);
      }

      util.checkForHttpErrors(response, responseBody);
      // ToDo: post 7.2 repeat login instead throwing
      if (response.statusCode === 401) {
        util.log.error('Authorization failed. Please try signing in again.');
      }
      resolve(responseBody);
    })
    .catch((error) => {
      reject(error);
    });
  });
};

exchangeUtils.getAccessTokenFromFS = () => {
  const authInfo = exchangeUtils.readAuthInfoFromFS();
  return util.isObjectEmpty(authInfo) ? '' : `${authInfo.token_type} ${authInfo.access_token}`;
};

/**
 * ## getExchangeUrl
 *
 * @public
 * @returns {string} | @throws
 */
exchangeUtils.getExchangeUrl = () => {
  const env = process.env;
  // Check cache
  const cachedExchangeUrl = env.exchangeUrl;
  if (cachedExchangeUrl) {
    return cachedExchangeUrl;
  }
  const configObj = util.getOraclejetConfigJson();
  const exchangeUrl = configObj[CONSTANTS.EXCHANGE_URL_PARAM];
  if (exchangeUrl) {
    // Put to cache
    env.exchangeUrl = exchangeUrl;
    return exchangeUrl;
  }
  util.log.error('Exchange not configured. Please configure with \'ojet configure --exchange-url=<url>\'.');
  return false;
};

/**
 * ## login
 *
 * @private
 * @returns {Promise}
 */
exchangeUtils.login = function () {
  return new Promise((resolve, reject) => {
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

        exchangeUtils.getAccessToken(user, pass)
          .then((response) => {
            if (util.isVerbose()) {
              util.log('Access token successfully retrieved.');
            }
            resolve(response);
          })
          .catch((error) => {
            reject(error);
          });
      });
      mutableStdout.muted = true;
    });
  });
};

/**
 * ## readAccessTokenFromFile
 *
 * @public
 * @returns Object | @throws
 */
exchangeUtils.readAuthInfoFromFS = () => {
  const env = process.env;
  const exchangeUrl = exchangeUtils.getExchangeUrl();

  const cachedAccessTokenMap = env.accessTokenMap;
  if (cachedAccessTokenMap) {
    return JSON.parse(cachedAccessTokenMap)[exchangeUrl];
  }
  const accessTokenMap = util.readJsonAndReturnObject(
    path.join(homedir, CONSTANTS.EXCHANGE_TOKEN_STORE_DIR, CONSTANTS.EXCHANGE_TOKEN_STORE_FILE),
    true
  );
  if (accessTokenMap && accessTokenMap[exchangeUrl]) {
    // Token storage file already exists
    // Cache
    env.accessTokenMap = JSON.stringify(accessTokenMap);
    return accessTokenMap[exchangeUrl];
  }
  // Token storage file does not exist
  return {};
};

/**
 * ## resolve
 *
 * @public
 * @param {string} changeType
 * @param {Array} componentNames
 * @param {Object} options
 * @returns {Promise}
 */
exchangeUtils.resolve = function (changeType, componentNames, options) {
  requestObject = {
    // jetVersion: util.getJETVersion(),
    config: _getConfig(),
    environment: _getEnvironment(),
    changes: {
      [changeType]: {}
    }
  };

  return new Promise((resolve, reject) => {
    _getChanges(changeType, componentNames, options)
      .then(exchangeUtils.resolveDependencies)
      .then((solutions) => {
        resolve(solutions);
      })
      .catch((error) => {
        reject(error);
      });
  });
};

/**
 * ## updateAuthInfo
 *
 * @public
 * @param {Object} serverResponse
 */
exchangeUtils.updateAuthInfoFromResponseHeaders = (serverResponse) => {
  const authInfo = exchangeUtils.readAuthInfoFromFS();

  const headers = serverResponse.headers;
  const nextTokenHeaderName = CONSTANTS.EXCHANGE_HEADER_NEXT_TOKEN;
  const tokenExpirationHeaderName = CONSTANTS.EXCHANGE_HEADER_NEXT_TOKEN_EXPIRATION;
  if (headers) {
    if (headers[nextTokenHeaderName]) {
      const tokenSplit = headers[nextTokenHeaderName].split(' ');
      authInfo[CONSTANTS.EXCHANGE_AUTH_ACCESS_TOKEN] = tokenSplit[1];
    }
    if (headers[tokenExpirationHeaderName]) {
      authInfo[CONSTANTS.EXCHANGE_AUTH_EXPIRATION] = headers[tokenExpirationHeaderName];
    }

    // Write to FS if any change detected
    if (headers[nextTokenHeaderName] || headers[tokenExpirationHeaderName]) {
      exchangeUtils.writeAuthInfoToFS(authInfo);
    }
  }
};

/**
 * ## uploadToExchange
 *
 * @public
 * @param {string} componentName
 * @param {Object} options
 * @returns {Promise}
 */
exchangeUtils.uploadToExchange = function (componentName, options) {
  return new Promise((resolve, reject) => {
    const compName = options.pack ? `'${componentName}' of a pack '${options.pack}'` : `'${componentName}'`;

    util.log(`Uploading ${compName} archive to Exchange.`);
    const archivePath = './component.zip';

    // Sending multipart form data
    // https://www.npmjs.com/package/form-data#alternative-submission-methods
    const multipart = new FormData();
    multipart.append('file', fs.createReadStream('./component.zip'));

    const multipartHeaders = multipart.getHeaders();

    util.request({
      method: 'POST',
      headers: multipartHeaders,
      path: '/components?access=PUBLIC',
    }, undefined, multipart)
    .then((responseData) => {
      const response = responseData.response;
      return exchangeUtils.validateAuthenticationOfRequest(
        response,
        () => { return exchangeUtils.uploadToExchange(componentName, options); }, // eslint-disable-line
        () => {
          util.checkForHttpErrors(response, responseData.responseBody, () => {
            util.deleteFile(archivePath);
          });

          const resolvedComponentName = options.pack ? `'${componentName}' of a pack '${options.pack}'` : `'${componentName}'`;
          util.log(`Component ${resolvedComponentName} was successfully uploaded to Exchange.`);
          util.deleteFile(archivePath);
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
};

/**
 * ## validateAuthenticationErrorCode
 *
 * @public
 * @param {Object} serverResponse
 * @returns {Promise}
 */
exchangeUtils.validateAuthenticationErrorCode = function (serverResponse) {
  return new Promise((resolve, reject) => {
    if (serverResponse.statusCode === 401) {
      // Unauthenticated, offer to login
      exchangeUtils.login()
        .then((accessToken) => { // eslint-disable-line
          return exchangeUtils.writeAuthInfoToFS(util.convertJsonToObject(accessToken));
        })
        .then(() => {
          resolve(true);
        })
        .catch((error) => {
          reject(error);
        });
    } else {
      // Do nothing, everything's good
      resolve(false);
    }
  });
};

/**
 * ## validateAuthenticationOfRequest
 *
 * @public
 * @param {Object} response
 * @param {Object} methodToRepeatIfNotAuthenticated
 * @param {function} callback
 * @returns {Promise}
 */
exchangeUtils.validateAuthenticationOfRequest = (
  response,
  methodToRepeatIfNotAuthenticated,
  callback
) => { // eslint-disable-line
  return exchangeUtils.validateAuthenticationErrorCode(response)
    .then((authenticationErrorAppeared) => {
      if (authenticationErrorAppeared) {
        if (util.isVerbose()) {
          util.log('Request required authentication. Repeating request.');
        }

        // Trigger request again
        return methodToRepeatIfNotAuthenticated();
      }
      if (util.isVerbose()) {
        util.log('Request was successfully authenticated.');
      }
      // Execute successful follow-up promise chain
      exchangeUtils.updateAuthInfoFromResponseHeaders(response);
      return callback();
    });
};

exchangeUtils.writeAuthInfoToFS = (authResponse) => {
  const storeDir = path.join(homedir, CONSTANTS.EXCHANGE_TOKEN_STORE_DIR);
  util.ensureDir(storeDir);
  const pathToFile = path.join(storeDir, CONSTANTS.EXCHANGE_TOKEN_STORE_FILE);
  const accessTokenMap = util.readJsonAndReturnObject(pathToFile, true) || {};
  const exchangeUrl = exchangeUtils.getExchangeUrl();

  // accessTokenMap[exchangeUrl] = accessTokenMap[exchangeUrl] ? accessTokenMap[exchangeUrl] || {}
  accessTokenMap[exchangeUrl] = Object.assign(accessTokenMap[exchangeUrl] || {}, authResponse);

  // Write file
  util.writeObjectAsJson(pathToFile, accessTokenMap);

  // Cache new map (so that 'reads' do not need to use File System)
  process.env.accessTokenMap = JSON.stringify(accessTokenMap);
};
