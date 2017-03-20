/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
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
const childProcess = require('child_process');
const path = require('path');
const StringDecoder = require('string_decoder').StringDecoder;

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
 * ## exec
 * Executes shell commands asynchronously, outputting Buffer.
 *
 * @public
 * @param {string} command - The command to run, with space-separated arguments
 * @param {string} successMessage - If the string appears in output stream, Promise will be resolved
 * @returns {Promise}
 */
util.exec = (command, successMessage) => {
  console.log(`Executing: ${command}`);
  return new Promise((resolve, reject) => {
    const child = childProcess.exec(command, { maxBuffer: 1024 * 500 });
    child.stdout.on('data', (data) => {
      console.log(data);
      if (successMessage && data.indexOf(successMessage) !== -1) {
        resolve();
      }
    });

    child.stderr.on('data', (data) => {
      console.log(data);
    });

    child.on('error', (err) => {
      reject(err);
    });
    // If childProcess invokes multiple proccesses(Cordova run, boot Android emulator).
    // The close event is triggered when all these processes stdio streams are closed.
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`child process exited with code: ${code}`);
        resolve();
      } else {
        reject(`child process exited with code: ${code}`);
      }
    });
  });
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

  console.log(`Executing: ${cmd} ${args.join(' ')}`);

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
        console.log(search);
        resolve();
      } else if (logOutput) {
        console.log(search);
      }
    });

    task.stderr.on('data', data => console.log(_toString(data)));

    task.on('error', err => reject(err));

    task.on('close', (code) => {
      if (code === 0) {
        console.log(`child process exited with code: ${code}`);
        resolve();
      } else {
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
 * ## info
 * Log info
 *
 * @public
 * @param {string} message
 */
util.info = (message) => {
  console.log(`\x1b[32mJET Info: ${message}\x1b[0m`);
};

/**
 * ## logModuleName
 *
 * @public
 */

util.logModuleName = (function () {
  let executed = false;
  return function () {
    if (!executed) {
      executed = true;
      console.log('\x1b[42m Oracle JET Tooling \x1b[0m');
    }
  };
}());

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
    throw util.toError(`'${propertyName}' value '${value}' is not valid. Expected: ${type}`);
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
  const packageJsonPath = util.destPath('node_modules/oraclejet/package.json');
  return fs.readJsonSync(packageJsonPath).version;
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
  let index = filePath.indexOf(token);
  if (index < 0) {
    token = config('paths').src.web;
    index = filePath.indexOf(token);
    if (index < 0) {
      token = config('paths').src.common;
      index = filePath.indexOf(token);
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
  const themesSrcDir = util.destPath(path.join(config.get('paths').src.common, config.get('paths').staging.themes));

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
