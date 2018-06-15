/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

/**
 * # Dependencies
 */
/* 3rd party */
const fs = require('fs-extra');
const glob = require('glob');

const _ = {};
_.difference = require('lodash.difference');
_.isFunction = require('lodash.isfunction');
_.mergeWith = require('lodash.mergewith');
_.remove = require('lodash.remove');
_.union = require('lodash.union');

/* Node.js native */
const http = require('http');
const https = require('https');
const childProcess = require('child_process');
const path = require('path');
const StringDecoder = require('string_decoder').StringDecoder;
const url = require('url');

/* Oracle */
const CONSTANTS = require('./constants');
/**
 * # Utils
 *
 * @public
 */
const util = module.exports;

util.rootPath = __dirname;

/**
 * ## templatePath
 * Determines the templatePath.
 *
 * @public
 * @param {String} rootDir
 * @returns {String} The path of where this script lives.
 * Getting the src when copying hooks from this module.
 */
util.templatePath = function (rootDir) {
  const templatePath = rootDir || '';
  return path.resolve(__dirname, '..', templatePath);
};

/**
 * ## destPath
 * Determines the destinationPath.
 *
 * @public
 * @param  {String} rootDir
 * @returns {String} The path to appDir directory.
 */
util.destPath = function (rootDir) {
  const destPath = rootDir || '';
  return path.resolve(_getDestCwd(), destPath);
};

/**
 * ## _getDestCwd
 *
 * @private
 * @returns {String}
 */
function _getDestCwd() {
  return process.cwd();
}

/**
 * ## deleteDir
 *
 * @public
 * @param {string} dirPath
 */
util.deleteDir = function (dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = `${dirPath}/${file}`;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        util.deleteDir(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
};

/**
 * ## deleteFile
 *
 * @public
 * @param {string} filePath
 * @param {function} [callback]
 */
util.deleteFile = function (filePath, callback) {
  fs.unlink(filePath, (error) => {
    if (error) {
      throw util.toError(error);
    }
    if (typeof callback === 'function' && callback()) {
      callback();
    }
  });
};

/**
 * ## ensureCatalogUrl
 * Check if catalog url is configured
 *
 * @public
 */
util.ensureCatalogUrl = function () {
  const configObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`);
  if (!configObj['catalog-url']) {
    util.log.error('Catalog url is not configured. Please see \'ojet help configure\' for instructions.');
  }
};

/**
 * ## ensureDir
 * Check if directory exists. If not, create it.
 *
 * @public
 * @param {string} dirPath - Path to check
 */
util.ensureDir = function (dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }
};

util.ensureParameters = function (parameters, apiName) {
  if (typeof parameters === 'undefined' || (typeof parameters === 'object' && parameters.length === 0)) {
    util.log.error(`Please specify parameters for ojet.${apiName}()`);
  }
};

/**
 * ## exec
 * Executes shell commands asynchronously, outputting Buffer.
 *
 * @public
 * @param {string} command - The command to run, with space-separated arguments
 * @param {string} successMessage - If the string appears in output stream, Promise will be resolved
 * @returns {Promise}
 */
util.exec = (command, successMessage) => {
  util.log(`Executing: ${command}`);
  return new Promise((resolve, reject) => {
    const child = childProcess.exec(command, { maxBuffer: 1024 * 500 });
    child.stdout.on('data', (data) => {
      util.log(data);
      if (successMessage && data.indexOf(successMessage) !== -1) {
        resolve();
      }
    });

    child.stderr.on('data', (data) => {
      util.log(data);
    });

    child.on('error', (err) => {
      reject(err);
    });
    // If childProcess invokes multiple proccesses(Cordova run, boot Android emulator).
    // The close event is triggered when all these processes stdio streams are closed.
    child.on('close', (code) => {
      if (code === 0) {
        util.log(`child process exited with code: ${code}`);
        resolve();
      } else {
        if (code === null) resolve();
        reject(`child process exited with code: ${code}`);
      }
    });
  });
};

/**
 * ## isObjectEmpty
 *
 * @param {Object} object
 * @returns {boolean}
 */
util.isObjectEmpty = function (object) {
  if (typeof object === 'object') {
    // Because Object.keys(new Date()).length === 0; we have to do some additional check
    return Object.keys(object).length === 0 && object.constructor === Object;
  }
  return true;
};

/**
 * ## spawn
 * Executes shell commands asynchronously, returning Stream.
 *
 * @public
 * @param {string} command              - The command to run
 * @param {Array} options               - Array of arguments
 * @param {string} [outputString]       - If the string appears in output stream,
 *                                        Promise will be resolved
 * @param {boolean} [logOutputArg=true] - Logs the output stream
 * @returns {Promise}
 */
util.spawn = (command, options, outputString, logOutputArg) => {
  /* unfortunately this is necessary for one to preserve the PATH for windows
   * there is a bug for nodejs (don't recall) dating back to 2012 or 13 and think
   * they won't fix it, since there were comments regarding status update from 2015
   */
  let cmd = '';
  let args = [];
  let logOutput = logOutputArg;
  if (process.platform === 'win32') {
    cmd = 'cmd.exe';
    args = ['/s', '/c', command];
  } else {
    cmd = command;
  }

  /* Join with other options*/
  args = args.concat(options);

  util.log(`Executing: ${cmd} ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    const task = childProcess.spawn(cmd, args);
    const decoder = new StringDecoder('utf8');

    task.stdout.on('data', (data) => {
      const search = decoder.write(data);

      if (logOutput === undefined) {
        logOutput = true;
      }

      if (outputString && search.indexOf(outputString) !== -1) {
        /*
         * We want to log this even when logging is disabled, since the outputString
         * typically contains key information that the user needs to know, eg. the
         * hostname:port in the server-only case.
         */
        util.log(search);
        resolve();
      } else if (logOutput) {
        util.log(search);
      }
    });

    task.stderr.on('data', data => util.log(_toString(data)));

    task.on('error', err => reject(err));

    task.on('close', (code) => {
      if (code === 0) {
        util.log(`child process exited with code: ${code}`);
        resolve();
      } else {
        if (code === null) resolve();
        reject(`child process exited with code: ${code}`);
      }
    });
  });
};

function _toString(bufferOrString) {
  return (Buffer.isBuffer(bufferOrString)) ?
  bufferOrString.toString('utf8') :
  bufferOrString;
}

/**
 * ## toError
 *
 * @public
 * @param {string} [message='Unknown error']
 * @returns {Object} Error message
 */
util.toError = function (message) {
  return new Error(message || 'Unknown error');
};

/**
 * ## log
 * Prints each argument on a new line
 *
 * @public
 */
util.log = function () {
  // Disabling eslint as spread operator is required
  Object.keys(arguments).forEach((arg) => { // eslint-disable-line
    console.log(arguments[arg]); // eslint-disable-line
  });
};

/**
 * ## log.success
 *
 * @public
 * @param {string} message
 */
util.log.success = function (message) {
  util.log(`\x1b[32m${message}\x1b[0m`);
};

/**
 * ## log.warning
 *
 * @public
 * @param {string} message
 */
util.log.warning = function (message) {
  util.log(`\x1b[33mWarning: ${message}\x1b[0m`);
};

/**
 * ## log.error
 *
 * @public
 * @param {string} message
 */
util.log.error = function (message) {
  util.log(`\x1b[31mError: ${message}\x1b[0m`);
  process.exit(1);
};

/**
 * ## validateType
 *
 * @public
 * @param {string} propertyName - Property name
 * @param {*} value             - Property value
 * @param {string} type         - Expected type
 * @returns {error}
 */
util.validateType = (propertyName, value, type) => {
  if (typeof value !== type) { // eslint-disable-line
    // Strings are expected from callers - see JSDoc
    // To pass the eslint rule we would need separate method for every type
    util.log.error(`'${propertyName}' value '${value}' is not valid. Expected: ${type}`);
  }
};

/**
 * ## getValidArraySize
 *
 * @public
 * @param {object} array
 * @returns {number}
 */
util.getValidArraySize = (array) => {
  const size = array.filter(value => value !== undefined).length;

  return size;
};

/**
 * ## fsExist
 * Checks if file/direcotry exists
 *
 * @public
 * @param {string} pathParam    - Path to check
 * @returns {function} callback - Callback
 * @returns {function}          - Callback
 */
util.fsExists = (pathParam, callback) => {
  fs.access(pathParam, fs.F_OK, (err) => {
    if (err) {
      callback(err);
    } else {
      callback();
    }
  });
};

/**
 * ## fsExistSync
 * Checks if file/direcotry exists
 *
 * @public
 * @param {string} pathParam - Path to check
 * @returns {boolean}        - 'true' if path exists, 'false' otherwise
 */
util.fsExistsSync = (pathParam) => {
  try {
    fs.statSync(pathParam);
    return true;
  } catch (err) {
    // file/directory does not exist
    return false;
  }
};

/**
 * ## hasProperty
 *
 * @public
 * @param {Object} object
 * @param {string} propertyName
 * @returns {boolean}
 */
util.hasProperty = function (object, propertyName) {
  return Object.prototype.hasOwnProperty.call(object, propertyName);
};

/**
 * ## hasWhiteSpace
 * Checks if string includes white space (space, tab, carriage return, new line,
 * vertical tab, form feed character)
 *
 * @public
 * @param {string} string
 * @returns {boolean} - 'true' if includes, 'false' otherwise
 */
util.hasWhiteSpace = string => /\s/g.test(string);

function _removeNonFile(matches, cwd) {
  const result = _.remove(matches, (dir) => {
    const fullPath = path.join(cwd, dir);
    return fs.statSync(fullPath).isFile();
  });
  return result;
}

function _processMatch(srcArray, destArray) {
  const resultArray = [];
  for (let i = 0; i < srcArray.length; i++) {
    const element = {
      src: srcArray[i],
      dest: destArray[i]
    };
    resultArray.push(element);
  }
  return resultArray;
}

function _mapFileNamePrefix(matches, prefix, rename) {
  const result = matches.map((name) => {
    if (rename) {
      return _.isFunction(rename) ? rename(prefix, name) : path.join(prefix, rename);
    }

    return path.join(prefix, name);
  });
  return result;
}

function _addFileListPathPrefix(match, dest, cwd, rename) {
  const destMatch = _mapFileNamePrefix(match, dest, rename);
  const srcMatch = _mapFileNamePrefix(match, cwd);
  return _processMatch(srcMatch, destMatch);
}

/**
 * ## getDirectories
 *
 * @public
 * @param {string} source
 * @returns {array}
 */
util.getDirectories = function (source) {
  return fs.readdirSync(source).filter((file) => { // eslint-disable-line
    return util.isDirectory(path.join(source, file));
  });
};

/**
 * ## isDirectory
 *
 * @public
 * @param {string} source
 * @returns {boolean}
 */
util.isDirectory = function (source) {
  return fs.statSync(source).isDirectory();
};

/**
 * ## getFileList
 * Obtain the file list array of objects contain src and dest pairs
 *
 * @public
 * @param {string} buildType - dev or release
 * @param {object} fileList - raw fileList from config
 * @param {object} cwdContext - the object to cwd value
 * @param {object} destContext  - the object to set dest value
 * @returns {array}  - fileListArray
 */
util.getFileList = (buildType, fileList, cwdContext, destContext) => {
  let result = [];
  fileList.filter(_buildTypeMatch, buildType).forEach((file) => {
    const normalizedFile = {
      cwd: _getNonNullPathString(file.cwd, cwdContext),
      dest: _getNonNullPathString(file.dest, destContext),
      src: (typeof file.src === 'string') ? [file.src] : file.src,
      rename: file.rename
    };
    result = result.concat(_getListFromPatternArray(normalizedFile));
  });
  return result;
};

function _buildTypeMatch(file) {
  return (file.buildType === this || !file.buildType);
}

function _getListFromPatternArray(file) {
  let matches = [];
  file.src.forEach((src) => {
    const exclusion = src.indexOf('!') === 0;
    const srcPattern = exclusion ? src.slice(1) : src;

    let match = glob.sync(srcPattern, { cwd: util.destPath(file.cwd) });
    match = _removeNonFile(match, util.destPath(file.cwd));
    if (exclusion) {
      matches = _.difference(matches, match);
    } else {
      matches = _.union(matches, match);
    }
  });
  return _addFileListPathPrefix(matches, file.dest, util.destPath(file.cwd), file.rename);
}

function _getNonNullPathString(filePath, context) {
  return (_.isFunction(filePath) ? filePath(context) : filePath) || '';
}

util.getThemeCssExtention = function (buildType) {
  return buildType === 'release' ? '.min.css' : '.css';
};

util.getJETVersion = () => {
  const packageJsonPath = util.destPath('node_modules/@oracle/oraclejet/package.json');
  let version = fs.readJsonSync(packageJsonPath).version;
  // npm 5 will put long url
  if (version.length > 5) {
    version = version.replace(new RegExp('(.*oraclejet-)(.*).tgz'), '$2');
  }
  return version;
};

/**
 * ## getPathComponents
 * Decomposes the path to the prefix, src directory and suffix.
 * Returns an object with 3 properties - 'beg' includes the path prefix,
 * 'mid' is the src folder (src, src-hybrid, src-web), 'end' is the path suffix.
 *
 * @public
 * @param {string} filePath - file path to process
 * @returns {object}        - decomposed path
 */
util.getPathComponents = (filePath) => {
  const config = require('./config'); // eslint-disable-line global-require
  let token = config('paths').src.hybrid;
  let index = filePath.lastIndexOf(token);
  if (index < 0) {
    token = config('paths').src.web;
    index = filePath.lastIndexOf(token);
    if (index < 0) {
      token = config('paths').src.common;
      index = filePath.lastIndexOf(token);
      if (index < 0) {
        index = 0;
        token = '';
      }
    }
  }
  const pathComponents =
    {
      beg: filePath.substring(0, index),
      mid: token,
      end: filePath.substring(index + token.length)
    };
  return pathComponents;
};

util.mergeDefaultOptions = (options, defaultConfig) => {
// function customizer(objValue, srcValue, key, obj, src) {
// todo: check caller's params
  function customizer(objValue, srcValue, key) {
  // do not merge for fileList or files, override with values in config
    if (srcValue instanceof Array) {
      if (key === 'fileList' || 'files') {
        return srcValue;
      }
    }
    return undefined;
  }
  return _.mergeWith({}, defaultConfig, options, customizer);
};

util.mergePlatformOptions = (options, platform) => {
  if ((platform === 'web') && options.web) {
    return util.mergeDefaultOptions(options.web, options);
  } else if ((platform !== 'web') && options.hybrid) {
    return util.mergeDefaultOptions(options.hybrid, options);
  }
  return options;
};

util.getAllThemes = () => {
  // scan both appDir/src/themes and appDir/themes directories
  // merge them
  const config = require('./config'); // eslint-disable-line global-require
  const themesDir = util.destPath(path.join(config.get('paths').src.themes));
  const themesSrcDir = util.destPath(path.join(config.get('paths').src.common, config.get('paths').src.themes));

  const allThemes = _.union(_getThemesFileList(themesDir), _getThemesFileList(themesSrcDir));
  return allThemes.filter((themeDir) => {
    if (themeDir === CONSTANTS.DEFAULT_THEME) {
      return false;
    }
    return themeDir.indexOf('.') === -1;
  });
};

function _getThemesFileList(Dir) {
  return util.fsExistsSync(Dir) ? fs.readdirSync(Dir) : [];
}

/**
 * ## cloneObject
 *
 * @public
 * @param {Object} original
 * @returns {Object}
 */
util.cloneObject = function (original) {
  return Object.assign({}, original);
};

/**
 * ## checkForHttpErrors
 *
 * @public
 * @param {Object} serverResponse
 * @param {string} serverResponseBody
 * @param {function} [doBeforeThrowCallback] - e.g. delete temporary files
 */
util.checkForHttpErrors = function (serverResponse, serverResponseBody, doBeforeThrowCallback) {
  // Throw for 4xx or 5xx http codes
  const code = serverResponse.statusCode.toString();
  if (['4', '5'].indexOf(code.charAt(0)) > -1) {
    if (typeof doBeforeThrowCallback === 'function') {
      doBeforeThrowCallback();
    }
    let errors = '';

    let resp;
    try {
      resp = JSON.parse(serverResponseBody);
    } catch (e) {
      resp = serverResponseBody;
    }

    if (typeof resp === 'object') {
      resp.errors.forEach((error) => {
        const catalog = url.parse(process.env.catalogUrl);
        const errorPath = `${catalog.path}exceptions/${error.id}`;
        const errorlink = `${catalog.host}${errorPath.replace('//', '/')}`;
        errors += `${error.message}. More info: ${errorlink}${resp.errors.length > 1 ? '\n' : ''}`;
      });
      throw util.log.error(errors);
    } else {
      throw util.log.error(resp);
    }
  }
};

/**
 * ## isCCASassFile
 *
 * @public
 * @param {String} filePath
 * @returns {Boolean}
 */
util.isCcaSassFile = function (filePath) {
  const jetCCA = new RegExp(CONSTANTS.JET_COMPOSITE_DIRECTORY);
  return jetCCA.test(filePath);
};

function _getInstalledPlatforms(cordovaPath) {
  try {
    const platforms = fs.readdirSync(path.join(cordovaPath, 'platforms'));
    return platforms.filter(value => value !== 'browser');
  } catch (error) {
    throw error;
  }
}

/**
 * ## getDefaultPlatform
 * if single platform, return that platform
 *
 * @public
 * @returns {string}
 */

util.getDefaultPlatform = () => {
  const config = require('./config'); // eslint-disable-line global-require
  config.loadOraclejetConfig();
  const pathConfig = config.getConfiguredPaths();
  const isHybrid = fs.existsSync(path.resolve(pathConfig.staging.hybrid,
    CONSTANTS.CORDOVA_CONFIG_XML));
  const isAddHybrid = fs.existsSync(path.resolve(pathConfig.src.web))
                      || fs.existsSync(path.resolve(pathConfig.src.hybrid));

  if (isHybrid) {
    const platforms = _getInstalledPlatforms(pathConfig.staging.hybrid);
    // if only one platform is installed, default to that one
    if (platforms.length === 1 && !isAddHybrid) {
      return platforms[0];
    }
    // if multiple platforms are installed, throw error
    const supportedPlatforms = CONSTANTS.SUPPORTED_PLATFORMS.toString().replace(/,/g, '||');
    util.log.error(`Command is missing platform. Please specify one of "<${supportedPlatforms}>"`);
  }
  return 'web';
};

/**
 * ## readPathMappingJsonFile
 *
 * @public
 */
util.readPathMappingJson = () => {
  const config = require('./config'); // eslint-disable-line global-require
  config.loadOraclejetConfig(config('platform'));
  const pathConfig = config.getConfiguredPaths();
  const location = `${pathConfig.src.common}/${pathConfig.src.javascript}/${CONSTANTS.PATH_MAPPING_JSON}`;
  return fs.readJsonSync(location);
};

/**
 * ## readJsonAndReturnObject
 *
 * @public
 * @param {string} path
 * @returns {Object} object
 */
util.readJsonAndReturnObject = function (pathToFile) {
  let object = {};
  if (fs.existsSync(pathToFile)) {
    const file = fs.readFileSync(pathToFile, 'utf8');
    try {
      object = JSON.parse(file);
      // If came to here, then valid json
    } catch (e) {
      util.log.error(`File '${pathToFile}' is not of type 'json'.`);
    }
  } else {
    util.toError(`File path '${pathToFile}' not found.`);
  }
  return object;
};

/**
 * ## request
 * https://nodejs.org/dist/latest-v6.x/docs/api/http.html
 * https://nodejs.org/dist/latest-v6.x/docs/api/https.html
 *
 * @public
 * @param {Object} [options]           - List: https://nodejs.org/dist/latest-v6.x/docs/api/http.html#http_http_request_options_callback
 * @param {function} callback
 * @param {string || undefined} [body]
 * @param {Object} [multipartFormData]
 */
util.request = function (options, callback, body, multipartFormData) {
  let cb = callback;
  let opts = options;

  let protocol = {};

  if (typeof opts === 'string') {
    // Url case
    const urlSplit = opts.split('://');
    protocol = urlSplit[0] === 'https:' ? https : http;
  } else {
    // Options case

    // Make options optional
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }

    // If catalog url defined, use it as the default
    if (fs.existsSync(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`)) {
      const file = fs.readFileSync(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`, 'utf8');
      const configObj = JSON.parse(file);
      const catalogUrl = configObj['catalog-url'];
      if (catalogUrl) {
        process.env.catalogUrl = catalogUrl;
        const defaults = url.parse(catalogUrl);
        if (defaults.path && opts.path) {
          opts.path = (defaults.path + opts.path).replace('//', '/');
        }
        opts = Object.assign(defaults, opts);
      }
    }

    protocol = opts.protocol === 'https:' ? https : http;
  }

  const request = protocol.request(opts, (response) => {
    cb(response);
  });

  request.on('error', (error) => {
    if (error.code === 'ECONNREFUSED') {
      util.log.error('Could not connect to defined url.\nPlease check your proxy setting and configure Catalog url \'ojet help configure\'');
    } else {
      throw util.toError(`Problem with request: ${error}`);
    }
  });

  if (body) {
    request.write(body);
    request.end();
  } else if (multipartFormData) {
    multipartFormData.pipe(request);
  } else {
    request.end();
  }
};

/**
 * ## getLibVersionsObj
 *
 * @public
 */
util.getLibVersionsObj = () => {
  const versionsObj = {
    ojs: _getVersionFromNpm('oraclejet'),
    ojL10n: _getVersionFromNpm('oraclejet'),
    ojtranslations: _getVersionFromNpm('oraclejet'),
    jquery: _getVersionFromNpm('jquery'),
    'jqueryui-amd': _getVersionFromNpm('jquery-ui'),
    hammerjs: _getVersionFromNpm('hammerjs'),
    knockout: _getVersionFromNpm('knockout')
  };
  return versionsObj;
};

function _getVersionFromNpm(libPath) {
  if (libPath === 'oraclejet') return util.getJETVersion();
  const packageJSON = fs.readJsonSync(`node_modules/${libPath}/package.json`);
  return packageJSON.version;
}

/**
 * Map the tooling theme skin to JET distribution
 * @param  {String} skin name
 * @returns {String} skin name
 */
util.mapToSourceSkinName = function (skin) {
  switch (skin) {
    case 'web':
      return 'alta';
    case 'ios':
      return 'alta-ios';
    case 'android':
      return 'alta-android';
    case 'windows':
      return 'alta-windows';
    case 'common':
      return 'common';
    default:
      return skin;
  }
};
