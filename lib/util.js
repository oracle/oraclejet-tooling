/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

/**
 * # Dependencies
 */
/* 3rd party */
const fs = require('fs-extra');
const glob = require('glob');
const terser = require('terser');

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
const exchangeUtils = require('./utils.exchange');
const config = require('./config');

/**
 * # Utils
 *
 * @public
 */
const util = module.exports;

util.rootPath = __dirname;

util.convertJsonToObject = (string) => {
  let obj;
  try {
    obj = JSON.parse(string);
    // If came to here, then valid json
  } catch (e) {
    util.log.error(`String '${string}' is not valid 'json'.`);
  }
  return obj;
};

/**
 * get the minified component path.
 * @private
 * @param {String} path to component
 * @returns the minified componentPath
 */
util.getComponentDest = function (componentPath) { // eslint-disable-line
  return path.join(componentPath, 'min');
};

/**
 * @private
 * @param {Object} context
 * @returns an updated config object.
 */
util.processContextForHooks = function (context) {
  //
  // Assemble the necessary environment variables for writing hooks
  // Create hooks context from context parameter.
  // Note that "ojet build" defines the .platform, .opts, and .buildType properties,
  // while ojet build component" defines the componentConfig property.
  // We ensure idempotence by checking for 'known' properties that
  // could have previously been copied in from opts (see the else if conditions).
  //
  // Allow hooks to modify contents of context by making it the same object
  // We used to copy up and over specific proprties.
  const obj = context;
  if (context) {
    if (context.opts && context.opts.theme) {
      obj.theme = context.opts.theme;
    } else if (context.theme) {
      obj.theme = context.theme;
    }

    if (context.opts && context.opts.userOptions) {
      obj.userOptions = context.opts.userOptions;
    }

    // requireJs properties can now be modified by the user in the before_optimize hook.
    if (context.opts && context.opts.requireJs) {
      obj.requireJs = context.opts.requireJs;
    }

    if (context.opts && context.opts.requireJsEs5) {
      obj.requireJsEs5 = context.opts.requireJsEs5;
    }

    if (context.opts) {
      obj.isRequireJsEs5 = context.opts.isRequireJsEs5;
    }

    // Component requireJs properties can now be modified
    // by the user in the before_component_optimize hook.
    if (context.opts && context.opts.componentRequireJs) {
      obj.componentRequireJs = context.opts.componentRequireJs;
    }

    if (context.opts && context.opts.typescript) {
      obj.typescript = context.opts.typescript;
    }
  }

  const _config = require('./config'); // eslint-disable-line global-require
  const configPaths = _config('paths');
  obj.paths = configPaths;
  return obj;
};

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
 * Recursive removal, still not built-in officially
 *
 * @public
 * @param {string} dirPath
 */
util.deleteDirSync = function (dirPath) {
  if (fs.existsSync(dirPath)) {
    util.readDirSync(dirPath).forEach((file) => {
      const curPath = `${dirPath}/${file}`;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        util.deleteDirSync(curPath);
      } else { // delete file
        util.deleteFileSync(curPath);
      }
    });
    util.deleteFsSync(dirPath, 'dir');
  }
};

/**
 * ## deleteFileSync
 *
 * @public
 * @param {string} dirPath
 */
util.deleteFileSync = function (source) {
  util.deleteFsSync(source, 'file');
};

/**
 * ## deleteFsSync
 * https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_fs_rmdirsync_path
 * https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_fs_unlinksync_path
 *
 * @public
 * @param {string} source
 * @param {'dir' | 'file'} type
 */
util.deleteFsSync = function (source, type) {
  try {
    switch (type) {
      case 'dir':
        fs.rmdirSync(source);
        break;
      case 'file':
        fs.unlinkSync(source);
        break;
      default:
        util.log.error(`Unsupported '${type}' file system type.`);
    }
  } catch (error) {
    util.log.error(error, true);
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
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * ## ensureParameters
 *
 * @public
 * @param {string || Array} parameters
 */
util.ensureParameters = function (parameters, apiName) {
  if (typeof parameters === 'undefined' || (typeof parameters === 'object' && parameters.length === 0)) {
    util.log.error(`Please specify parameters for ojet.${apiName}()`);
  }
};

/**
 * ## ensurePathExists
 *
 * @public
 * @param {Array} parameters
 */
util.ensurePathExists = function (pathTo) {
  if (!fs.fsExists(pathTo)) {
    util.log.error(`${pathTo} does not exists.`);
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
    const child = childProcess.exec(command, { maxBuffer: 1024 * 5000 });
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
  util.log(`${message}`);
};

/**
 * ## log.warning
 *
 * @public
 * @param {string} message
 */
util.log.warning = function (message) {
  util.log(`Warning: ${message}`);
};

/**
 * ## log.error
 *
 * @public
 * @param {string} message
 * @param {boolean} [omitErrorString=false] avoid double 'Error' when node native exception passed
 */
util.log.error = function (message, omitErrorString) {
  const omit = typeof omitErrorString === 'boolean' ? omitErrorString : false;
  util.log(`${omit ? '' : 'Error: '}${message}`);
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

/**
 * ## getDirectories
 *
 * @public
 * @param {string} source
 * @returns {array}
 */
util.getDirectories = function (source) {
  if (fs.existsSync(source)) {
    return util.readDirSync(source).filter((sourceItem) => { // eslint-disable-line
      return util.isDirectory(path.join(source, sourceItem));
    });
  }
  return [];
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
 * ## getFiles
 *
 * @public
 * @param {string} source
 * @returns {array}
 */
util.getFiles = function (source) {
  if (util.fsExistsSync(source)) {
    return util.readDirSync(source).filter((sourceItem) => { // eslint-disable-line
      return util.isFile(path.join(source, sourceItem));
    });
  }
  return [];
};

/**
 * ## isFile
 *
 * @public
 * @param {string} source
 * @returns {boolean}
 */
util.isFile = function (source) {
  return fs.statSync(source).isFile();
};

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

util.getThemeCssExtention = function (buildType, isCdn) {
  const sep = isCdn ? '-' : '.';
  return buildType === 'release' ? `${sep}min.css` : `.css`; // eslint-disable-line quotes
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

util.getInstalledCssPackage = () => {
  let getPackageJson = path.resolve('./node_modules/postcss-calc');
  getPackageJson = fs.existsSync(getPackageJson);
  return getPackageJson;
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
  const configPaths = util.getConfiguredPaths();
  let token = configPaths.src.hybrid;
  let index = filePath.lastIndexOf(token);
  if (index < 0) {
    token = configPaths.src.web;
    index = filePath.lastIndexOf(token);
    if (index < 0) {
      token = configPaths.src.common;
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

/**
 * ## getRequestedComponentVersion
 *
 * @private
 * @param {string} componentName
 * @returns {string || undefined} version
 */
util.getRequestedComponentVersion = (componentName) => {
  const split = componentName.split('@');
  if (split.length > 2) {
    util.log.error('Wrong version specification: "@" can be used only once.');
  }
  const version = split[1];
  return version;
};

/**
 * ## getPlainComponentName
 *
 * @private
 * @param {string} componentName
 * @returns {string} componentName - version specification is trimmed
 */
util.getPlainComponentName = (componentName) => {
  // Trim version specification from the user input
  const versionSymbolIndex = componentName.indexOf('@');

  if (versionSymbolIndex === 0) {
    util.log.error('Missing component name');
  }
  return versionSymbolIndex > 0 ? componentName.substring(0, componentName.indexOf('@')) : componentName;
};

util.mergeDefaultOptions = (options, defaultConfig) => {
// function customizer(objValue, srcValue, key, obj, src) {
// todo: check caller's params
  function customizer(objValue, srcValue, key) {
  // do not merge for fileList or files, override with values in config
    if (srcValue instanceof Array) {
      if (key === 'fileList' || key === 'files') {
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
  // scan both appDir/src/themes and appDir/staged-themes directories
  // merge them
  const _config = require('./config'); // eslint-disable-line global-require
  const configPaths = _config('paths');
  const themesDir = util.destPath(path.join(configPaths.src.themes));
  const themesSrcDir = util.destPath(path.join(configPaths.src.common, configPaths.src.themes));

  const allThemes = _.union(_getThemesFileList(themesDir), _getThemesFileList(themesSrcDir));
  return allThemes.filter((themeDir) => {
    if (themeDir === CONSTANTS.DEFAULT_THEME || themeDir === CONSTANTS.DEFAULT_PCSS_THEME) {
      return false;
    }
    return themeDir.indexOf('.') === -1;
  });
};

function _getThemesFileList(Dir) {
  return util.fsExistsSync(Dir) ? util.readDirSync(Dir) : [];
}

/**
 * ## cloneObject
 *
 * @public
 * @param {Object} original
 * @returns {Object}
 */
util.cloneObject = function (original) {
  // Previously used method: 'return Object.assign({}, original);'
  // only does a shallow copy of the keys and values, similarly to return {...original},
  // meaning if one of the values in the object is another object or an array,
  // then it is the same reference as was on the original object.

  // Since we need a copy to modify UrlRequestOptions.headers.Authorization (object in object) per
  // https://jira.oraclecorp.com/jira/browse/JET-40298
  // we need deep copy an object.
  return JSON.parse(JSON.stringify(original));
};

/**
 * ## checkForHttpErrors
 *
 * @public
 * @param {Object} serverResponse
 * @param {string} serverResponseBody
 * @param {function} [doBeforeErrorCallback] - e.g. delete temporary files
 */
util.checkForHttpErrors = function (serverResponse, serverResponseBody, doBeforeErrorCallback) {
  // Log error for 4xx or 5xx http codes
  // except of 401 (triggers authentication)
  const code = serverResponse.statusCode.toString();
  if (code !== '401' && ['4', '5'].indexOf(code.charAt(0)) > -1) {
    if (typeof doBeforeErrorCallback === 'function') {
      doBeforeErrorCallback();
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
        const exchange = url.parse(process.env.exchangeUrl);
        const errorPath = `${exchange.path}exceptions/${error.id}`;
        const errorlink = `${exchange.host}${errorPath.replace('//', '/')}`;
        errors += `${error.message}. More info: ${errorlink}${resp.errors.length > 1 ? '\n' : ''}`;
      });
      util.log.error(errors);
    } else {
      util.log.error(resp);
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
    const platforms = util.readDirSync(path.join(cordovaPath, 'platforms'));
    return platforms.filter(value => value !== 'browser');
  } catch (error) {
    util.log.error(error);
    return false;
  }
}

/**
 * ## isVerbose
 *
 * @returns {boolean}
 */
util.isVerbose = function () {
  return process.env.verbose !== 'false';
};

/**
 * ## getConfiguredPaths
 *
 * @returns {object} paths
 */
util.getConfiguredPaths = () => {
  let configPaths = config('paths');
  // only load config paths if not already loaded
  if (!configPaths) {
    config.loadOraclejetConfig();
    configPaths = config('paths');
  }
  return configPaths;
};

/**
 * ## getDefaultPlatform
 * if single platform, return that platform
 *
 * @public
 * @returns {string}
 */

util.getDefaultPlatform = () => {
  const _config = require('./config'); // eslint-disable-line global-require
  _config.loadOraclejetConfig();
  const pathConfig = _config.getConfiguredPaths();
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
    // if multiple platforms are installed, log error
    const supportedPlatforms = CONSTANTS.SUPPORTED_PLATFORMS.toString().replace(/,/g, '||');
    util.log.error(`Command is missing platform. Please specify one of "<${supportedPlatforms}>"`);
  }
  return 'web';
};

/**
 * ## getOraclejetConfigJson
 *
 * @public
 * @returns {Object} | @throws
 */
util.getOraclejetConfigJson = () => {
  const configFileName = CONSTANTS.ORACLE_JET_CONFIG_JSON;
  const env = process.env;

  // Check cache
  const cachedConfigObj = env.oraclejetConfigJson;
  if (cachedConfigObj) {
    return JSON.parse(cachedConfigObj);
  }
  const configObj = util.readJsonAndReturnObject(`./${configFileName}`);
  // Put to cache
  env.oraclejetConfigJson = JSON.stringify(configObj);
  return configObj;
};

util.printList = (itemsInConfig, itemsByFolder) => {
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
  itemsByFolder.forEach((comp) => {
    let line = _constructLineOutput(comp, nameMaxLength, space);
    line += `${space}${_addWarningMissingInConfig(comp, itemsInConfig)}`;
    util.log(line);
  });

  // Print components from the config file which are not install
  itemsInConfig.forEach((comp) => {
    if (itemsByFolder.indexOf(comp) === -1) {
      let line = _constructLineOutput(comp, nameMaxLength, space);
      line += `${space}Warning: found in the config file but not installed. Please restore.`;
      util.log(line);
    }
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

/**
 * ## readPathMappingJsonFile
 *
 * @public
 */
util.readPathMappingJson = () => {
  const _config = require('./config'); // eslint-disable-line global-require
  _config.loadOraclejetConfig(_config('platform'));
  const pathConfig = _config.getConfiguredPaths();
  const location = `${pathConfig.src.common}/${pathConfig.src.javascript}/${CONSTANTS.PATH_MAPPING_JSON}`;
  return fs.readJsonSync(location);
};

/**
 * ## readJsonAndReturnObject
 *
 * @public
 * @param {string} file
 * @param {Object} [options]
 * @param {Object | string} [options]
 * @param {string} [options.encoding = 'utf-8']
 * @param {string} [options.suppressNotFoundError]
 * @param {string} [options.flag = 'r'] System flag:
 * https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_file_system_flags
 * @returns {Object} | @throws
 */
util.readJsonAndReturnObject = function (file, options) {
  let object = {};
  const fileContent = util.readFileSync(file, options);
  // If suppressNotFoundError was used in util.readFileSync() options
  // and the file did not exist, const fileContent is undefined.
  // So just return 'undefined' and did not try to parse.
  if (fileContent) {
    try {
      object = JSON.parse(fileContent);
      // If came to here, then valid json
    } catch (e) {
      util.log.error(`File '${file}' is not of type 'json'.`);
    }
    return object;
  }
  return fileContent;
};

/**
 * ## readFileSync
 * Blocking synchronous file read
 *
 * @public
 * @param {string} source
 * @param {Object | string} [options]
 * @param {string} [options.encoding = 'utf-8']
 * @param {string} [options.suppressNotFoundError]
 * @param {string} [options.flag = 'r']
 * @returns content
 */
util.readFileSync = function (source, options) {
  return util.readFsSync(source, 'file', options);
};

/**
 * ## readDirSync
 * Blocking synchronous dir read
 *
 * @public
 * @param {string} source
 * @param {Object | string} [options]
 * @param {string} [options.encoding = 'utf-8']
 * @param {string} [options.suppressNotFoundError]
 * @param {string} [options.withFileTypes = false] Dir read case
 * @returns content
 */
util.readDirSync = function (source, options) {
  return util.readFsSync(source, 'dir', options);
};

/**
 * ## readFsSync
 * Blocking synchronous dir/file read
 * https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_fs_readdirsync_path_options
 * https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_fs_readfilesync_path_options
 *
 * @public
 * @param {string} source
 * @param {'dir' | 'file'} type
 * @param {Object | string} [options]
 * @param {string} [options.encoding = 'utf-8']
 * @param {string} [options.suppressNotFoundError]
 * @param {string} [options.flag = 'r'] File read case
 * @param {string} [options.withFileTypes = false] Dir read case
 * @returns content
 */
util.readFsSync = function (source, type, options) {
  // If options is not defined or an object, merge with defaults
  let opts = options;
  if (typeof opts === 'undefined' || util.isObject(opts)) {
    opts = Object.assign({
      encoding: 'utf-8',
    }, opts);
  }
  let content;
  try {
    switch (type) {
      case 'dir':
        content = fs.readdirSync(source, opts);
        break;
      case 'file':
        content = fs.readFileSync(source, opts);
        break;
      default:
        util.log.error(`Unsupported '${type}' file system type.`);
    }
  } catch (error) {
    if (error.code === 'ENOENT' &&
      util.hasProperty(opts, 'suppressNotFoundError') &&
      opts.suppressNotFoundError) {
      // Exception - do not log info if the source file is
      // Exchange access-token or global url configuration.
      // Access token is not needed as long as authentication is not required
      // e.g. when only consuming from Internal Exchange
      // Logging 'not-found' info for each Exchange request was confusing users.
      if (!source.endsWith(CONSTANTS.EXCHANGE_TOKEN_STORE_FILE) &&
        !source.endsWith(CONSTANTS.EXCHANGE_URL_FILE)
      ) {
        util.log(`Directory/File '${source}' not found. Skipping.`);
      }
    } else {
      util.log.error(`Directory/File '${source}' could not be read. More details: ${error}`);
    }
  }
  return content;
};

/**
 * ## isObject
 *
 * @public
 * @param {any} variable
 * @returns {boolean}
 */
util.isObject = function (variable) {
  return typeof variable === 'object' && variable !== null;
};

/**
 * ## request
 *
 * @public
 * @param {Object|string} options   - List: https://nodejs.org/api/http.html#http_http_request_url_options_callback
 * @param {string|undefined} [body]
 * @param {Object} [multipartFormData]
 * @returns {Promise}
 */
util.request = function (options, body, multipartFormData) {
  return new Promise((resolve, reject) => {
    let opts = options || {};

    // HTTP/HTTPS request
    // https://nodejs.org/api/http.html#http_http_request_url_options_callback
    // https://nodejs.org/api/https.html#https_https_request_options_callback

    // Always add security option
    opts.secure = util.getOptionsProperty('secure');
    // Automatically Add Authorization header
    // Except of the token request
    if (opts.path !== '/auth/token') {
      const token = exchangeUtils.getAccessTokenFromFS();
      // And except of expired token
      if (token) {
        // Add authorization header
        opts.headers = Object.assign(opts.headers || {}, {
          Authorization: token
        });
      }
    }

    if (opts.useUrl) {
      // Overwrite protocol, host, path, port etc. by values from provided url
      opts = Object.assign(opts, url.parse(opts.useUrl));
    } else {
      // If exchange url defined, use it as the default
      const defaults = url.parse(exchangeUtils.getExchangeUrl());
      if (defaults.path && opts.path) {
        // Even we could normalize exchange url on input (ojet configure --exchange-url)
        // we can not prevent user from modifying oraclejetconfig.json manually.
        // That's why we need to check whether it ends with slash here when constructing url
        if (defaults.path.endsWith('/')) {
          defaults.path = defaults.path.substring(0, defaults.path.length - 1);
        }
        // Note: we removed previous '.replace()' method:
        // opts.path = (defaults.path + opts.path).replace('//', '/');
        // because of https://github.com/nodejs/node/issues/18288 saying:
        // http://nodejs.org//foo/bar//baz/ is a valid URL that may have a different meaning from
        // http://nodejs.org/foo/bar/baz/. It would be semantically incorrect to disallow this distinction.
        opts.path = (defaults.path + opts.path);
      }
      opts = Object.assign(defaults, opts);
    }
    const protocol = _validateProtocol(opts.protocol, opts.secure);

    if (util.isVerbose()) {
      const optionsCopy = util.cloneObject(opts);

      if (util.hasProperty(optionsCopy, 'headers')) {
        if (util.hasProperty(optionsCopy.headers, 'Authorization')) {
          // Do not log base64 hash as it is not cryptographically secure
          const authHash = optionsCopy.headers.Authorization;

          // We only want to hide Authorization value when requesting access token with:
          // headers: {Authorization: Basic <base64_hash_value>}
          // as credentials are part of the 'base64_hash_value' and can be decoded.
          //
          // We are not hiding value when using other Authorization types e.g.:
          // headers: {Authorization: Bearer <JWT_access_token_value>}
          // because 'JWT_access_token_value' is completely public information.
          // Our decoded JWT tokens do not include sensitive information.
          const [authType, authValue] = authHash.split(' ');
          if (authType === 'Basic' && authValue) {
            optionsCopy.headers.Authorization = `${authType} ${'*'.repeat(authValue.length)}`;
          }
        }
      }

      util.log('Request options:');
      util.log(optionsCopy);
      util.log('Request body:');
      util.log(body);
    }

    const request = protocol.request(opts, (response) => {
      if (util.isVerbose()) {
        util.log('Response status code:');
        util.log(response.statusCode);
        util.log('Response status message:');
        util.log(response.statusMessage);
        util.log('Response headers:');
        util.log(response.headers);
      }

      let responseBody = '';
      const buffer = [];
      response.on('data', (respBody) => {
        responseBody += respBody;
        buffer.push(respBody);
      });
      response.on('end', () => {
        if (util.isVerbose()) {
          try {
            JSON.parse(responseBody);
            util.log('Response body:');
            util.log(responseBody);
          } catch (e) {
            util.log('Response body could not be parsed. Skipping log.');
          }
        }
        resolve({
          response,
          responseBody,
          buffer
        });
      });
    });

    request.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        reject('Could not connect to defined url.\nPlease check your proxy setting and configure Exchange url \'ojet help configure\'');
      } else {
        reject(`Problem with request: ${error}`);
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
  });
};

util.loginIfCredentialsProvided = () => {
  const username = util.getOptionsProperty('username');
  const password = util.getOptionsProperty('password');

  if (username && password) {
    // Credentials were provided, get and store brand new access token
    // even there might be a one (even valid) stored
    return exchangeUtils.getAccessToken(username, password)
      .then((authInfo) => {
        exchangeUtils.writeAuthInfoToFS(util.convertJsonToObject(authInfo));
      });
  }
  // Credentials not provided, just continue
  return Promise.resolve();
};

util.getOptionsProperty = (property) => {
  const options = process.env.options;
  if (options && options !== 'undefined') {
    return JSON.parse(options)[property];
  }
  return null;
};

/**
 * ## _checkProtocol
 *
 * @private
 * @param {string} requestedProtocol - http || https
 * @param {boolean} [secure='true']  - security option
 * @returns {Object} | @throws       - returns valid protocol or throws error
 */

function _validateProtocol(requestedProtocol, secure) { // eslint-disable-line
  // Cache secure options for the current session
  const env = process.env;
  let secureCopy;
  // Check cache
  if (env.secure) {
    secureCopy = env.secure === 'true'; // Convert to boolean
  } else {
    secureCopy = typeof secure === 'undefined' ? true : secure;
    // Cache
    env.secure = secure; // Convert to string
  }

  if (requestedProtocol === 'https:' || !secureCopy) {
    return requestedProtocol === 'https:' ? https : http;
  }
  util.log.error('HTTP protocol is insecure. Please use HTTPS instead. At your own risk, you can force the HTTP protocol with the —secure=false or {secure: false} option.');
}

/**
 * ## getLibVersionsObj
 *
 * @public
 */
util.getLibVersionsObj = () => {
  const versionsObj = {
    ojcss: _getVersionFromNpm('oraclejet'),
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

/**
 * Map the tooling pcss theme skin to JET distribution
 * @param  {String} skin name
 * @returns {String} skin name
 */
util.mapToPcssSourceSkinName = function (skin) {
  switch (skin) {
    case 'web':
      return 'redwood';
    case 'common':
      return 'common';
    default:
      return skin;
  }
};

util.isPathCCA = function (filePath) {
  const jetCCA = new RegExp(CONSTANTS.JET_COMPOSITE_DIRECTORY);
  return jetCCA.test(filePath);
};

/**
 * ## getDestBase
 *
 * @private
 * @return {string}
 *
 * Return the path to the destination base.
 *
 */
util.getDestBase = function () {
  const _config = require('./config'); // eslint-disable-line
  const configPaths = _config('paths');
  let destBase = null;
  if (fs.existsSync(configPaths.staging.hybrid)) {
    destBase = path.join(
      configPaths.staging.hybrid,
      configPaths.src.javascript,
      configPaths.composites
    );
  } else {
    destBase = path.join(
      configPaths.staging.web,
      configPaths.src.javascript,
      configPaths.composites
    );
  }
  return destBase;
};

/**
 * ## getComponentPath
 *
 * The pack argument should only be provided
 * for a component inside a JET pack. Pack components
 * are treated like singleton components and so the
 * pack name should be provided as the "component" argument
 * and the "pack" argument should be omitted.
 *
 * @private
 * @param {object} options.pack
 * @param {object} options.component
 * @return {string}
 *
 * Return the src path to a web component.
 *
 */
util.getComponentPath = function ({ pack = '', component }) {
  const configPaths = util.getConfiguredPaths();
  const componentJavascriptPath = path.join(
    configPaths.src.common,
    configPaths.src.javascript,
    configPaths.composites,
    pack,
    component
  );
  const componentTypescriptPath = path.join(
    configPaths.src.common,
    configPaths.src.typescript,
    configPaths.composites,
    pack,
    component
  );
  let componentPath;
  if (util.fsExistsSync(componentJavascriptPath)) {
    componentPath = componentJavascriptPath;
  } else if (util.fsExistsSync(componentTypescriptPath)) {
    componentPath = componentTypescriptPath;
  } else {
    util.log.error(`The component ${component} was not found`);
  }
  return componentPath;
};

/**
 * ## getComponentVersion
 *
 * The pack argument should only be provided
 * for a component inside a JET pack. Pack components
 * are treated like singleton components and so the
 * pack name should be provided as the "component" argument
 * and the "pack" argument should be omitted.
 *
 * @private
 * @param {object} options.pack
 * @param {object} options.component
 * @return {string} component version
 */
util.getComponentVersion = function ({ pack = '', component }) {
  const fullComponentName = pack ? `${pack}-${component}` : component;
  const componetsCache = util.getComponentsCache();
  const componentCache = componetsCache[fullComponentName];
  if (componentCache &&
      util.hasProperty(componentCache, 'componentJson' &&
      util.hasProperty(componentCache.componentJson, 'version'))
  ) {
    return componentCache.componentJson.version;
  }
  let version;
  if (util.isVComponent({ pack, component })) {
    version = util.getVComponentVersion({ pack, component });
  } else if (util.isExchangeComponent({ pack, component })) {
    version = util.getExchangeComponentVersion({ pack, component });
  } else {
    version = util.getCompositeComponentVersion({ pack, component });
  }
  componetsCache.componentJson = {
    ...(componetsCache.componentJson || {}),
    version
  };
  return version;
};

/**
 * ## getCompositeComponentVersion
 *
 * @private
 * @param {object} options.pack
 * @param {object} options.component
 * @return {string} composite component version
 */
util.getCompositeComponentVersion = ({ pack, component }) => {
  const componentJson = util.getCompositeComponentJson({ pack, component });
  if (!util.hasProperty(componentJson, 'version')) {
    util.log.error(`Missing property 'version' in '${component}' component's/pack's definition file.`);
  }
  return componentJson.version;
};

/**
 * ## getExchangeComponentVersion
 *
 * @private
 * @param {object} options.pack
 * @param {object} options.component
 * @return {string} exchange component version
 */
util.getExchangeComponentVersion = ({ pack, component }) => {
  const componentJson = util.getExchangeComponentComponentJson({ pack, component });
  if (!util.hasProperty(componentJson, 'version')) {
    util.log.error(`Missing property 'version' in '${component}' component's/pack's definition file.`);
  }
  return componentJson.version;
};

/**
 * ## getJetpackCcaNameFromConfigObj
 *
 * @private
 * @param {string} pathComponentsEnd
 * @return {string}
 *
 * Return the name of a jetpack component.
 *
 * The component config for a jetpack component might look something like this:
 *   {"oj-ref-fullcalendar":"3.9.0",
 *     "oj-ref-moment":"2.22.2",
 *     "oj-ref-showdown":"1.9.0",
 *     "oj-sample":"0.0.28-beta"}
 * We want to extract the name/version from the component config -
 * but the jetpack component name first needs to be discovered.
 * We infer the CCA name (say "oj-sample") - this is accomplished by checking the path for
 * all keys in the config object
 * ("oj-ref-fullcalendar", "oj-ref-moment", "oj-ref-showdown", "oj-sample")
 * Then the calling function can use the key/prop value for the name/version, e.g.,
 * "oj-sample":"0.0.28-beta" will be name/version.
 *
 */
util.getJetpackCompNameFromConfigObj = function (pathComponentsEnd) {
  const componentsCache = util.getComponentsCache();
  const matchingName = Object.keys(componentsCache).find(key => pathComponentsEnd.split(path.sep).indexOf(`${key.toString()}`) !== -1);
  return matchingName;
};

/**
 * ## getNpmPckgInitFileRelativePath
 *
 * @private
 * @param {String} componentJson component json file
 * @param {String} buildType build type
 * @returns {Object} with two fields, npmPckgInitFileRelativePath which is the file path,
 *  and a boolean cdn, which is true if the path is a cdn path.
 *
 * Return the preferred component path.
 * The component path is returned as a relative path.
 *
 * Example path from component.json:
 *
 *  "paths": {
 *    "npm": {
 *      "min": "dist/showdown.min",
 *      "debug": "dist/showdown"
 *     }
 *    "cdn": {
 *      "min": "https://static.oracle.com/cdn/jet/packs/3rdparty/showdown/1.9.0/showdown.min",
 *      "debug": "https://static.oracle.com/cdn/jet/packs/3rdparty/showdown/1.9.0/showdown.min"
 *     }
 *  }
 *
 * The path selected to return is based on the following search pattern:
 *
 *  For ojet build:
 *   1. npm.min
 *   2. npm.debug
 *   3. cdn.debug
 *   4. cdn.min
 *
 *  For ojet build --release:
 *   1. cdn.min
 *   2. cdn.debug
 *   3. npm.min
 *   4. npm.debug
 */
util.getNpmPckgInitFileRelativePath = function (componentJson, buildType) {
  const retObj = {};
  retObj.npmPckgInitFileRelativePath = undefined;
  retObj.npm = true;

  if (!componentJson.paths) return retObj;
  if (buildType === 'release') {
    if (componentJson.paths.cdn !== undefined) {
      retObj.npm = false;
      if (componentJson.paths.cdn.min !== undefined) {
        retObj.npmPckgInitFileRelativePath = componentJson.paths.cdn.min;
      } else if (componentJson.paths.cdn.debug !== undefined) {
        retObj.npmPckgInitFileRelativePath = componentJson.paths.cdn.debug;
      }
    } else if (componentJson.paths.npm !== undefined) {
      if (componentJson.paths.npm.min !== undefined) {
        retObj.npmPckgInitFileRelativePath = componentJson.paths.npm.min;
      } else if (componentJson.paths.npm.debug !== undefined) {
        retObj.npmPckgInitFileRelativePath = componentJson.paths.npm.debug;
      }
    }
  } else {
    if (componentJson.paths.npm !== undefined) { // eslint-disable-line no-lonely-if
      if (componentJson.paths.npm.min !== undefined) {
        retObj.npmPckgInitFileRelativePath = componentJson.paths.npm.min;
      } else if (componentJson.paths.npm.debug !== undefined) {
        retObj.npmPckgInitFileRelativePath = componentJson.paths.npm.debug;
      }
    } else if (componentJson.paths.cdn !== undefined) {
      retObj.npm = false;
      if (componentJson.paths.cdn.debug !== undefined) {
        retObj.npmPckgInitFileRelativePath = componentJson.paths.cdn.debug;
      } else if (componentJson.paths.cdn.min !== undefined) {
        retObj.npmPckgInitFileRelativePath = componentJson.paths.cdn.min;
      }
    }
  }
  return retObj;
};

/**
 * ## isTypescriptFile
 *
 * Returns true if the file path refers to a
 * Typescript file and false otherwise
 *
 * @private
 * @param {object} options
 * @param {string} options.filePath
 * @returns {boolean}
 */
util.isTypescriptFile = function ({ filePath }) {
  return !!filePath.match(/(\.ts|\.tsx)$/);
};

/**
 * ## writeObjectAsJsonFile
 *
 * @public
 * @param {string} file
 * @param {Object} object
 * @param {string} [options.encoding = 'utf-8']
 * @param {string} [options.mode = '0o666']
 * @param {string} [options.flag = 'w'] System flag
 * https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_file_system_flags
 */
util.writeObjectAsJsonFile = (file, object, options) => {
  // Object validation - warning only, empty object written
  if (util.isObjectEmpty(object)) {
    util.log.warning(`Empty object written to ${file}`);
  }

  const compiledObject = JSON.stringify(object || {}, null, 2);
  util.writeFileSync(file, compiledObject, options);
};

/**
 * ## readFileSync
 * Blocking synchronous file write
 * https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_fs_writefilesync_file_data_options
 *
 * @public
 * @param {string} file
 * @param {string | Buffer} data
 * @param {Object | string} [options]
 * @param {string} [options.encoding = 'utf-8']
 * @param {string} [options.mode = '0o666']
 * @param {string} [options.flag = 'w'] System flag
 * https://nodejs.org/dist/latest-v10.x/docs/api/fs.html#fs_file_system_flags
 */
util.writeFileSync = function (file, data, options) {
  try {
    fs.writeFileSync(file, data, options);
  } catch (error) {
    util.log.error(`File '${file}' could not be written. More details: ${error}`);
  }
};

/**
 * ## isTypescriptComponent
 * @private
 * @param {string} option.pack pack name
 * @param {string} option.component component name
 * @returns {boolean} true if the component is written
 * in typescript and false otherwise
 */
util.isTypescriptComponent = function ({ pack = '', component }) {
  const configPaths = util.getConfiguredPaths();
  return util.fsExistsSync(path.join(
    configPaths.src.common,
    configPaths.src.typescript,
    configPaths.composites,
    pack,
    component,
    CONSTANTS.JET_COMPONENT_JSON
  ));
};

/**
 * ## getVComponentVersion
 *
 * Determine the version of the vcomponent.
 *
 * @private
 * @param {string} option.pack pack name
 * @param {string} option.component component name
 * @returns {string|void} VComponent version
 */
util.getVComponentVersion = ({ pack = '', component }) => {
  const configPaths = util.getConfiguredPaths();
  const versionRegex = new RegExp('@ojmetadata version "(?<version>.+)"');
  const pathToVComponent = path.join(
    configPaths.src.common,
    configPaths.src.typescript,
    configPaths.composites,
    pack,
    component,
    `${component}.tsx`
  );
  const vcomponentContent = util.readFileSync(pathToVComponent);
  const matches = versionRegex.exec(vcomponentContent);
  let version = '1.0.0';
  if (matches && matches.groups.version) {
    version = matches.groups.version;
  }
  return version;
};

/**
 * ## isVComponent
 *
 * The current standard is that all vcomponents
 * will have their folder name be the same as the
 * .tsx file name i.e oj-vcomponent will have
 * oj-vcomponent.tsx
 *
 * @private
 * @param {string} option.pack JET pack name
 * @param {string} option.component component name
 * @returns {boolean} true if the component is a
 * vcomponent and false otherwise
 */
util.isVComponent = function ({ pack = '', component }) {
  const configPaths = util.getConfiguredPaths();
  return util.fsExistsSync(path.join(
    configPaths.src.common,
    configPaths.src.typescript,
    configPaths.composites,
    pack,
    component,
    `${component}.tsx`
  ));
};

/**
 * ## isJavascriptComponent
 * @private
 * @param {string} option.pack pack name
 * @param {string} option.component component name
 * @returns {boolean} true if the component is written
 * in javascript and false otherwise
 */
util.isJavascriptComponent = function ({ pack = '', component }) {
  const configPaths = util.getConfiguredPaths();
  return util.fsExistsSync(path.join(
    configPaths.src.common,
    configPaths.src.javascript,
    configPaths.composites,
    pack,
    component,
    CONSTANTS.JET_COMPONENT_JSON
  ));
};

/**
 * ## isExchangeComponent
 *
 * @private
 * @param {string} option.pack JET pack name
 * @param {string} option.component component name
 * @returns {boolean} true if the component is from the
 * exchange and false otherwise
 */
util.isExchangeComponent = ({ pack = '', component }) => {
  if (util.fsExistsSync(
    path.join(CONSTANTS.JET_COMPONENTS_DIRECTORY, pack, component,
      CONSTANTS.JET_COMPONENT_JSON
    ))) {
    return true;
  }
  // External pack component references will have the pack name embedded.
  // If the above path check fails, the component may still be an exchange component.
  const packCompObj = util.chopExchangeComponentName(component);
  if (packCompObj.pack !== '') {
    if (util.fsExistsSync(
      path.join(CONSTANTS.JET_COMPONENTS_DIRECTORY,
        packCompObj.pack, packCompObj.component,
        CONSTANTS.JET_COMPONENT_JSON
      ))) {
      return true;
    }
  }
  return false;
};

/**
 * ## chopExchangeComponentName
 *
 * @private
 * @param {string} component component name
 * @returns {object} with pack and component properties
 *
 * External pack component references will have the pack name embedded.
 * For example, oj-dynamic-form refers to the component form in pack oj-dynamic.
 * This routine will return {pack: oj-dynamic, component: form} given oj-dynamic-form.
 */
util.chopExchangeComponentName = (component) => {
  // Get all external pack names.
  const externPacks = util.getExchangePacks();
  // Check if the component name begins with a pack name.
  let matchedPack = null;
  externPacks.some((p) => {
    if (component.startsWith(p)) {
      matchedPack = p;
      return true;
    }
    return false;
  });
  if (matchedPack) {
    const externalComponentName = component.slice(matchedPack.length + 1);
    if (util.fsExistsSync(path.join(CONSTANTS.JET_COMPONENTS_DIRECTORY,
      matchedPack, externalComponentName, CONSTANTS.JET_COMPONENT_JSON
    ))) {
      return { pack: matchedPack, component: externalComponentName };
    }
  }
  return { pack: '', component };
};

/**
 * ## isExchangePack
 *
 * @private
 * @param {string} option.component component name
 * @returns {boolean} true if the name is a pack downloaded from the exchange
 *
 * This command is used to issue warnings - for example, we warn
 * if the user inadvertently lists an external pack name as a dependency.
 *
 *
 * Example: checking oraclejetconfig.json for an external pack name.
 *
 * If this were the returned json .components
 *  "demo-analog-clock": "^1.0.4",
 *  "oj-dynamic": {
 *    "components": {
 *       "form": "^9.0.0-alpha10"
 *     }
 *   }
 *
 * The Object.keys(externalComponentObj) would be ["demo-analog-clock", "oj-dynamic"]
 * So we check if both:
 *  - the name parameter matches indexOf, and
 *  - and it also has a .components subfield.
 *
 * This indicates that the name parameter is a pack name.
 *
 */
util.isExchangePack = (name) => {
  const externalComponentObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`).components;
  if (externalComponentObj) {
    if (Object.keys(externalComponentObj).indexOf(name) !== -1 &&
        externalComponentObj[name].components) {
      return true;
    }
  }
  return false;
};


/**
 * ## getExchangePacks
 *
 * @private
 * @returns {Array} Array of pack names (which have been downloaded from the exchange)
 *
 */
util.getExchangePacks = () => {
  const externalComponentObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`).components;
  const returnPacks = [];
  if (externalComponentObj) {
    Object.keys(externalComponentObj).forEach((componentOrPack) => {
      if (externalComponentObj[componentOrPack].components) {
        // If we have a .component sub field, then the variable
        // componentOrPack is a pack name
        returnPacks.push(componentOrPack);
      }
    });
  }
  return returnPacks;
};

/**
 * ## runPromisesInSeries
 * Run functions that return promises in sequence
 * i.e only run the next function after the previous
 * one resolves
 * @private
 * @param {Array} promiseFunctions array containing funcitons that
 * return promises
 * @param {Object} initiaValue initial value passed to first promise function
 * @returns {Promise} promise chain that runs
 * in sequence
 */
util.runPromisesInSeries = (promiseFunctions, initialValue = {}) => (
  promiseFunctions.reduce(
    (prev, next) => prev.then(next),
    Promise.resolve(initialValue)
  )
);

/**
 * ## runPromiseIterator
 * Run a single promise function iteratively (and synchronously) over an array of input parameters.
 * The first parameter is an array and serves as both an iterator and also as a series of
 * different input parameters to the promise function (second parameter).
 * @private
 * @param {args} array of args that are used with the second promiseFn param
 * @param {promiseFn} a Promise function
 * @returns {Promise} promise chain that runs in sequence
 */
util.runPromiseIterator = function (args, promiseFn) {
  if (!Array.isArray(args)) {
    return Promise.reject(new Error('runPromiseIterator expects an array as first parameter'));
  }
  if (args.length === 0) {
    return Promise.resolve();
  }
  return args.reduce((p, item) => { // eslint-disable-line arrow-body-style
    return p.then(() => promiseFn(item));
  }, Promise.resolve());
};

/**
 * ## getLocalCompositeComponentJsonPaths
 *
 * Get paths to local composite component's component.json
 * files
 *
 * @private
 * @param {boolean} options.built whether to get component.json
 * path from src or built folder
 * @returns {Array} array containing paths to
 * component.json files if any
 */
util.getLocalCompositeComponentJsonPaths = ({ built = false }) => {
  const componentJsonPaths = [];
  const componentsCache = util.getComponentsCache();
  Object.keys(componentsCache).forEach((component) => {
    const componentCache = componentsCache[component];
    const { isLocal, isVComponent, srcPath, builtPath, componentJson } = componentCache;
    if (isLocal && !isVComponent && !util.hasProperty(componentJson, 'pack')) {
      if (built) {
        componentJsonPaths.push(path.join(
          builtPath,
          CONSTANTS.JET_COMPONENT_JSON
        ));
      } else {
        componentJsonPaths.push(path.join(
          srcPath,
          CONSTANTS.JET_COMPONENT_JSON
        ));
      }
    }
  });
  return componentJsonPaths;
};

/**
 * ## isTypescriptApplication
 * @private
 * @returns {boolean} true if the host application
 * is written in typescript
 */
util.isTypescriptApplication = () => (
  util.fsExistsSync(CONSTANTS.TSCONFIG)
);

/**
 * ## getTypescriptComponentsSourcePath
 *
 * @private
 * @returns {string} path to typescript components
 */
util.getTypescriptComponentsSourcePath = () => {
  const configPaths = util.getConfiguredPaths();
  return path.join(
    configPaths.src.common,
    configPaths.src.typescript,
    configPaths.composites
  );
};

/**
 * ## getLocalComponentPathMappings
 *
 * Look through src/ts/jet-composites and create
 * path mappings that point to the staging location
 * of the components
 *
 * @private
 * @param {Object} options.context build context
 * @returns {Object} local component path mappings
 */
util.getLocalComponentPathMappings = ({ context }) => {
  const configPaths = util.getConfiguredPaths();
  const componentsBasePath = util.getTypescriptComponentsSourcePath();
  const pathMappings = {};
  if (util.fsExistsSync(componentsBasePath)) {
    util.getDirectories(componentsBasePath).forEach((component) => {
      pathMappings[`${component}/*`] = [util.pathJoin(
        '.',
        context.opts.stagingPath,
        configPaths.src.typescript,
        configPaths.composites,
        component,
        util.getComponentVersion({ component }),
        '*'
      )];
    });
  }
  return pathMappings;
};

/**
 * ## getExchangeComponentPathMappings
 *
 * Look through /jet_components and create
 * path mappings for components with a /types folder that point to
 * theirt staging location
 *
 * @private
 * @param {Object} options.context build context
 * @returns {Object} exchange component path mappings
 */
util.getExchangeComponentPathMappings = ({ context }) => {
  const configPaths = util.getConfiguredPaths();
  const componentsBasePath = path.join(CONSTANTS.JET_COMPONENTS_DIRECTORY);
  const pathMappings = {};
  if (util.fsExistsSync(componentsBasePath)) {
    util.getDirectories(componentsBasePath).forEach((component) => {
      if (util.fsExistsSync(path.join(componentsBasePath, component, 'types'))) {
        pathMappings[`${component}/*`] = [util.pathJoin(
          '.',
          context.opts.stagingPath,
          configPaths.src.javascript,
          configPaths.composites,
          component,
          util.getComponentVersion({ component }),
          'types',
          '*'
        )];
      }
    });
  }
  return pathMappings;
};

/**
 * ## shouldNotRunTypescriptTasks
 * Determine if build process should not run
 * tasks
 * @private
 * @param {object} context build context
 * @returns {boolean} true if should not run Typescript tasks,
 * false otherwise
 */
util.shouldNotRunTypescriptTasks = context => !util.isTypescriptApplication() ||
  !!context.opts.notscompile;

/**
 * ## getSourceScriptsFolder
 * Get application's source scripts folder
 * @private
 * @returns {string} either ts or js
 */
util.getSourceScriptsFolder = () => {
  const configPaths = util.getConfiguredPaths();
  return util.isTypescriptApplication() ?
    configPaths.src.typescript : configPaths.src.javascript;
};

/**
 * ## getComponentPathFromThemingFileFest
 *
 * Get path data for the component that the theming
 * file (pcss or scss) belongs to e.g
 *
 * dest = web/js/jet-composites/oj-foo/css/oj-foo-styles.scss results
 * in an object = {
 *  componentPath: 'web/js/jet-composites/oj-foo/1.0.0/',
 *  subfolders: 'css'
 * }
 *
 * @private
 * @param {string} options.dest destination path for theming file
 * @param {boolean} options.isReleaseBuild
 * @returns {object} object containing the path to the component that theming
 * file belongs to and the subfolders between the theming file and the component
 * root
 */
util.getComponentPathFromThemingFileDest = ({ dest, isReleaseBuild }) => {
  const configPaths = util.getConfiguredPaths();
  const { pack, component, subFolders } = util.getComponentInformationFromFilePath({
    filePath: dest,
    filePathPointsToSrc: false
  });
  const componentPath = util.generatePathToComponentRoot({
    pack,
    component,
    root: configPaths.staging.stagingPath,
    scripts: configPaths.src.javascript,
    min: isReleaseBuild
  });
  return {
    componentPath,
    subFolders: util.pathJoin(subFolders)
  };
};

/**
 * ## isWebComponent
 *
 * Determine if the provided component name is
 * a valid JET web component
 *
 * @private
 * @param {string} pack pack name
 * @param {string} component component name
 * @returns {boolean} whether the provided component name is
 * a valid component
 */
util.isWebComponent = ({ pack, component }) => (
  util.isTypescriptComponent({ pack, component }) ||
  util.isJavascriptComponent({ pack, component }) ||
  util.isVComponent({ pack, component })
);

/**
 * ## getVComponentsInFolder
 *
 * Get vcomponents in the given folder by searching for sub folders
 * with a matching *.tsx file i.e folder/subfolder/subfolder.tsx
 *
 * @private
 * @returns {Array} array with vcomponent names if found
 */
util.getVComponentsInFolder = ({ folder }) => {
  const vcomponents = [];
  const files = glob.sync(path.join(folder, '*/*.tsx'));
  files.forEach((filepath) => {
    const file = path.basename(filepath, '.tsx');
    const subfolder = path.basename(path.dirname(filepath));
    if (file === subfolder) {
      vcomponents.push(subfolder);
    }
  });
  return vcomponents;
};

/**
 * ## getLocalVComponents
 *
 * Get local vcomponents by searching src/ts/jet-composites
 * for folders that have a matching *.tsx file
 *
 * @private
 * @returns {Array} array with vcomponent names if found
 */
util.getLocalVComponents = () => {
  const configPaths = util.getConfiguredPaths();
  return util.getVComponentsInFolder({
    folder: path.join(
      configPaths.src.common,
      configPaths.src.typescript,
      configPaths.composites
    )
  });
};


/**
 * ## getLocalVComponentsComponentJsonPaths
 *
 * Get paths to local vcomponent's component.json
 * files
 *
 * @private
 * @returns {string[]} array with local vcomponent component.json
 * paths
 */
util.getLocalVComponentsComponentJsonPaths = () => {
  const componentJsonPaths = [];
  const componentsCache = util.getComponentsCache();
  Object.keys(componentsCache).forEach((component) => {
    const componentCache = componentsCache[component];
    const { isLocal, isVComponent, builtPath, componentJson } = componentCache;
    if (isLocal && isVComponent && !util.hasProperty(componentJson, 'pack')) {
      componentJsonPaths.push(path.join(
        builtPath,
        CONSTANTS.JET_COMPONENT_JSON
      ));
    }
  });
  return componentJsonPaths;
};

/**
 * ## getVComponentComponentJson
 *
 * Determine if the provided component name is
 * a valid component
 *
 * @private
 * @param {object} option.context build context
 * @param {string} option.pack name of JET pack
 * @param {string} option.component name of vcomponent
 * @param {boolean} option.built whether the vcomponent has been built
 * @returns {object} vcomponent component.json
 */
util.getVComponentComponentJson = ({ context, pack = '', component, built = false }) => {
  if (!built) {
    return {
      name: component,
      version: util.getComponentVersion({ pack, component })
    };
  }
  const configPaths = util.getConfiguredPaths();
  const stagingPath = context ?
    context.opts.stagingPath : configPaths.staging.stagingPath;
  const pathToBuiltVComponentJson = path.join(
    util.generatePathToComponentRoot({
      pack,
      component,
      root: stagingPath,
      scripts: configPaths.src.javascript
    }),
    CONSTANTS.JET_COMPONENT_JSON
  );
  return util.readJsonAndReturnObject(pathToBuiltVComponentJson);
};

/**
 * ## pointTypescriptPathMappingsToStaging
 *
 * Update typescript path mappings to point to the
 * staging directory i.e ./src/ts/* becomes ./<staging>/ts/*
 *
 * @private
 * @param {object} option.context build context
 * @param {object} option.pathMappings current path mappings
 * @returns {object} updated path mappings
 */
util.pointTypescriptPathMappingsToStaging = ({ context, pathMappings }) => {
  const updatedPathMappings = {};
  const sourceFolderRegex = new RegExp('^(\\.\\/)*src\\/');
  const stagingFolderPrefix = `./${context.opts.stagingPath}/`;
  Object.keys(pathMappings).forEach((key) => {
    updatedPathMappings[key] = pathMappings[key].map(mapping =>
      (mapping.replace(sourceFolderRegex, stagingFolderPrefix))
    );
  });
  return updatedPathMappings;
};

/**
 * ## addComponentToTsconfigPathMapping
 *
 * If in a typescript application, create a path mapping for the component
 * in the tsconfig.json file
 *
 * @param {string} options.component
 * @param {boolean} options.isLocal
 */
util.addComponentToTsconfigPathMapping = ({ component, isLocal }) => {
  if (util.isTypescriptApplication()) {
    const configPaths = util.getConfiguredPaths();
    const tsconfigJsonPath = path.join('.', CONSTANTS.TSCONFIG);
    const tsconfigJson = util.readJsonAndReturnObject(tsconfigJsonPath);
    const srcFolder = configPaths.src.common;
    const compositesFolder = configPaths.composites;
    const typescriptFolder = configPaths.src.typescript;
    const pathMapping = `${component}/*`;
    const typesPath = isLocal ?
      `./${srcFolder}/${typescriptFolder}/${compositesFolder}/${component}/*` :
      `./${CONSTANTS.JET_COMPONENTS_DIRECTORY}/${component}/types/*`;
    if (!tsconfigJson.compilerOptions.paths[pathMapping]) {
      tsconfigJson.compilerOptions.paths = {
        ...(tsconfigJson.compilerOptions.paths || {}),
        [pathMapping]: [typesPath]
      };
      util.writeObjectAsJsonFile(tsconfigJsonPath, tsconfigJson);
    }
  }
};

/**
 * ## removeComponentFromTsconfigPathMapping
 *
 * @param {string} options.component
 */
util.removeComponentFromTsconfigPathMapping = ({ component }) => {
  if (util.isTypescriptApplication()) {
    const tsconfigJsonPath = path.join('.', CONSTANTS.TSCONFIG);
    const tsconfigJson = util.readJsonAndReturnObject(tsconfigJsonPath);
    const pathMapping = `${component}/*`;
    if (tsconfigJson.compilerOptions.paths[pathMapping]) {
      delete tsconfigJson.compilerOptions.paths[pathMapping];
      util.writeObjectAsJsonFile(tsconfigJsonPath, tsconfigJson);
    }
  }
};

/**
 * ## pathJoin
 *
 * Provide a consistent way of joining paths
 * thats independent of the OS i.e avoid using
 * path/to/resource over path\to\resource
 *
 * @returns {string} joined path
 */
util.pathJoin = (...paths) => (paths.filter(_path => !!_path).join('/'));

/**
 * ## isJETPack
 *
 * Determine if component or componentJson represents
 * a JET Pack
 * @param {string} pack
 * @param {object} componentJson
 * @returns {boolean}
 */
util.isJETPack = ({ pack, componentJson }) => {
  let _componentJson = {};
  if (componentJson) {
    _componentJson = componentJson;
  } else if (pack) {
    _componentJson = util.getComponentJson({ component: pack });
  }
  return util.hasProperty(_componentJson, 'type') && _componentJson.type === 'pack';
};

/**
 * ## getVComponentsInJETPack
 *
 * Get vcomponents inside JET pack by searching src/ts/jet-composites/<pack>
 * for folders that have a matching *.tsx file
 *
 * @private
 * @returns {Array} array with vcomponent names if found
 */
util.getVComponentsInJETPack = ({ pack }) => (
  util.getVComponentsInFolder({
    folder: util.getComponentPath({ component: pack })
  })
);

/**
 * ## getCompositeComponentJson
 *
 * @private
 * @param {String} options.pack
 * @param {String} options.component
 * @param {boolean} built whether to get component.json from /src or /<staging>
 * @returns {object} component.json file
 */
util.getCompositeComponentJson = ({ pack, component }) => (
  util.readJsonAndReturnObject(path.join(
    util.getComponentPath({ pack, component }),
    CONSTANTS.JET_COMPONENT_JSON
  ))
);

/**
 * ## getExchangeComponentComponentJson
 *
 * @private
 * @param {String} options.pack
 * @param {String} options.component
 * @returns {object} component.json file
 */
/**
 * ## getExchangeComponentComponentJson
 *
 * @private
 * @param {String} options.pack
 * @param {String} options.component
 * @returns {object} component.json file
 */
util.getExchangeComponentComponentJson = ({ pack = '', component }) => {
  if (util.fsExistsSync(
    path.join(CONSTANTS.JET_COMPONENTS_DIRECTORY,
      pack, component, CONSTANTS.JET_COMPONENT_JSON))) {
    return util.readJsonAndReturnObject(path.join(
      CONSTANTS.JET_COMPONENTS_DIRECTORY,
      pack, component,
      CONSTANTS.JET_COMPONENT_JSON));
  }
  const packCompObj = util.chopExchangeComponentName(component);
  if (packCompObj.pack !== '') {
    if (util.fsExistsSync(
      path.join(CONSTANTS.JET_COMPONENTS_DIRECTORY,
        packCompObj.pack, packCompObj.component,
        CONSTANTS.JET_COMPONENT_JSON
      ))) {
      return util.readJsonAndReturnObject(path.join(
        CONSTANTS.JET_COMPONENTS_DIRECTORY,
        packCompObj.pack, packCompObj.component,
        CONSTANTS.JET_COMPONENT_JSON));
    }
  }
  return null;
};

/**
 * ## getComponentJson
 *
 * @private
 * @param {object} options.context
 * @param {String} options.pack
 * @param {String} options.component
 * @param {boolean} options.built whether to get component.json from /src or /<staging>
 * @returns {object} component.json file
 */
util.getComponentJson = ({ context, pack, component, built }) => {
  if (util.isVComponent({ component, pack })) {
    return util.getVComponentComponentJson({ context, pack, component, built });
  } else if (util.isExchangeComponent({ pack, component })) {
    return util.getExchangeComponentComponentJson({ pack, component });
  }
  return util.getCompositeComponentJson({ pack, component });
};

/**
 * ## Replace content with expression
 * @param {string} content need to to be replaced
 * @param {expression} token literal which need to be matched
 * @param {string} Value string which need to be replaced
 */
util.regExReplace = (content, token, value) => {
  const regEx = new RegExp(token, 'g');
  return content.replace(regEx, value);
};

/**
 * ## minifyFiles
 *
 * Minifies an array of files using the
 * minification options provided
 *
 * @private
 * @param {object} options
 * @param {string[]} options.files list of files to minify
 * @param {object} options.options options to pass to minifier (terser)
 * @param {boolean} options.generateSourceMaps determine whether to generate
 * source maps for the minified files
 * @param {boolean} options.minify should terser be run
 */
util.minifyFiles = ({ files, options, generateSourceMaps, minify }) => (
  new Promise((resolve, reject) => {
    try {
      files.forEach((file) => {
        const destDir = file.dest;
        const code = util.readFileSync(file.src);
        const filename = path.parse(file.src).base;
        const sourceMap = generateSourceMaps ?
          { filename, url: `${filename}.map` } :
          false;
        const data = minify ? terser.minify(code, { ...options, sourceMap }) : { code };
        if (data.error) throw data.error;
        fs.outputFileSync(util.destPath(destDir), data.code);
        if (data.map) fs.outputFileSync(util.destPath(`${destDir}.map`), data.map);
      });
      resolve();
    } catch (error) {
      reject(error);
    }
  })
);

/**
 * ## getComponentsCahe
 *
 * Get components cache which maps each component's
 * full name to a map containing its componentJson, import name
 * etc
 * @returns {object} components cache
 */
util.getComponentsCache = () => (config('componentsCache') || {});

/**
 * ## getComponentInformationFromFilePath
 *
 * Get pack, component and subFolders from a
 * component file path e.g src/jet-composites/oj-pack/oj-foo/resources/config.json
 * will result in { pack: "oj-pack", component: "oj-foo", subFolders: ["resources"]}
 *
 * @param {object} options
 * @param {string} options.filePath
 * @param {boolean} options.filePathPointsToSrc
 * @returns {object} { pack, component, subFolders }
 */
util.getComponentInformationFromFilePath = ({ filePath, filePathPointsToSrc }) => {
  const configPaths = util.getConfiguredPaths();
  const basePath = filePathPointsToSrc ? configPaths.src.common : configPaths.staging.stagingPath;
  const javascriptBase = path.join(
    basePath,
    configPaths.src.javascript,
    configPaths.composites
  );
  const typescriptBase = path.join(
    basePath,
    configPaths.src.typescript,
    configPaths.composites
  );
  // go from (src|<staging>)/(js|ts)/jet-composites/<component>/* to
  // to <component>/* e.g. web/ts/jet-composites/oj-foo/loader.ts to
  // oj-foo
  const componentPath = path.normalize(filePath).startsWith(javascriptBase) ?
    path.dirname(path.relative(javascriptBase, filePath)) :
    path.dirname(path.relative(typescriptBase, filePath));
  const [componentRoot, ...subFolders] = componentPath.split(path.sep);
  let pack;
  let component;
  if (subFolders.length && util.isWebComponent({ pack: componentRoot, component: subFolders[0] })) {
    // componentPath corresponds to a pack component e.g oj-pack/oj-foo/loader.ts
    // results in componetRoot = oj-pack & subFolers[0] = oj-foo (pack component)
    // first subfolder corresponds to the pack component name so remove it from subFolders
    pack = componentRoot;
    component = subFolders.shift();
  } else {
    // componentPath corresponds to a singleton component e.g oj-foo/loader results
    // in componentRoot = oj-foo
    component = componentRoot;
  }
  return {
    pack,
    component,
    subFolders
  };
};

/**
 * ## getComponentBasePaths
 *
 * Returns a component's source and destination
 * base paths. It is primarily used by copy and minify tasks.
 * When copying, our source should always be src.common. When
 * minifying, our source shouuld always be staging.stagingPath
 *
 * @private
 * @param {object} context build context
 * @param {string} component component name
 * @param {boolean} minify whether base paths are for minify
 * task
 * @returns {string} result.srcBase -  component source's base path
 * @returns {string} result.destBase -  component destination's base path
 */
util.getComponentBasePaths = ({ context, component, minify = false }) => {
  // we always minify from the staging dir and copy from the src dir
  const srcBaseRoot = minify ? context.opts.stagingPath : config('paths').src.common;
  const isTypescriptComponent = util.isTypescriptComponent({ component }) ||
    util.isVComponent({ component });
  const scriptsSource = isTypescriptComponent ?
    config('paths').src.typescript : config('paths').src.javascript;
  // we always minify using javascript files. for copying, it
  // depends on whether the component is ts or js based
  const baseScripts = minify ? config('paths').src.javascript : scriptsSource;
  const srcBase = path.join(
    srcBaseRoot,
    baseScripts,
    config('paths').composites
  );
  const destBase = path.join(
    context.opts.stagingPath,
    baseScripts,
    config('paths').composites
  );
  return {
    srcBase,
    destBase
  };
};

/**
 * ##getLocalComponentJsonPaths
 *
 * Get paths to local component's component.json
 * files
 *
 * @param {object} options
 * @param {boolean} options.built whether to get component.json
 * path from src or built folder
 * @returns {string[]} local component component.json
 * paths
 */
util.getLocalComponentJsonPaths = ({ built }) => ([
  ...util.getLocalCompositeComponentJsonPaths({ built }),
  ...util.getLocalVComponentsComponentJsonPaths()
]);

/**
 * ## generatePathToComponentRoot
 *
 * Generate a path to the component root e.g
 * <root>/<scripts>/jet-composites/<pack>/<version>/<component>
 * if pack is passed or <root>/<scripts>/jet-composites/<component>/<version>
 * otherwise. A "versioned" paramter (true by default) can be passed to
 * generate a path with a version or not
 *
 * @param {object} options
 * @param {string} options.pack
 * @param {string} options.component
 * @param {string} options.root
 * @param {string} options.scripts
 * @param {boolean} options.versioned
 * @param {boolean} options.min
 */
util.generatePathToComponentRoot = ({
  pack,
  component,
  root,
  scripts,
  versioned = true,
  min = false
}) => {
  const configPaths = util.getConfiguredPaths();
  const baseComponentPath = path.join(
    root,
    scripts,
    configPaths.composites
  );
  return pack ? path.join(
    baseComponentPath,
    pack,
    versioned ? util.getComponentVersion({ component: pack }) : '',
    min ? 'min' : '',
    component
  ) : path.join(
    baseComponentPath,
    component,
    versioned ? util.getComponentVersion({ component }) : '',
    min ? 'min' : ''
  );
};
