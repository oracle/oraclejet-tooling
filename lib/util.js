/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * # Dependencies
 */

const path = require('path');
const fs = require('fs-extra');
const CONSTANTS = require("./constants");
const _isFunction = require('lodash.isfunction');
const _difference = require('lodash.difference');
const _union = require('lodash.union');
const _remove = require('lodash.remove');
const _mergeWith = require('lodash.mergewith');
const glob = require('glob');

let childProcess = require('child_process');
let StringDecoder = require('string_decoder').StringDecoder;

/**
 * # Usage example
 *
 * ```
 * let util = require('./util');
 *
 * util.exec('cordova clean ios');
 * ```
 */

let util = module.exports = {};

util.rootPath = __dirname;

/**
 * # API
 * ## templatePath
 * Determines the templatePath.
 *
 * @public 
 * @param  {String} rootDir 
 * @returns {String} The path of where this script lives. 
 * Getting the src when copying hooks from this module.
 */

util.templatePath = function (rootDir) {
  const templatePath = rootDir ? rootDir : '';
  return path.resolve(__dirname, '..', templatePath);
};

/**
 * # Private methods
 * ## _getDestCwd
 *
 * @private 
 * @returns {String} TBD
 */

function _getDestCwd() {
  return process.cwd();
}

/**
 * ## destPath
 * Determines the destinationPath.
 *
 * @public 
 * @param  {String} rootDir 
 * @returns {String} The path to appDir directory. 
 */

util.destPath = function (rootDir) {
  const destPath = rootDir ? rootDir : '';
  return path.resolve(_getDestCwd(), destPath);
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
 * @param {string} command        - The command to run
 * @param {Array} options         - Array of arguments
 * @param {string} [outputString] - If the string appears in output stream, Promise will be resolved
 * @param {boolean} [logger=true] - Logs the output stream
 * @returns {Promise}
 */

util.spawn = (command, options, outputString, logger) => 
{
  /* unfortunately this is necessary for one to preserve the PATH for windows
   * there is a bug for nodejs (don't recall) dating back to 2012 or 13 and think
   * they won't fix it, since there were comments regarding status update from 2015
   */
  let cmd = '';
  let args = [];
  if (process.platform === "win32")
  {
    cmd = 'cmd.exe';
    args = ['/s', '/c', command];
  }
  else
  {
    cmd = command;
  }
  
  /* Join with other options*/ 
  args = args.concat(options);
  
  console.log('Executing: ' + cmd + ' ' + args.join(' '));
  
  return new Promise((resolve, reject) =>
  {
    let task = childProcess.spawn(cmd, args);
    const decoder = new StringDecoder('utf8');

    task.stdout.on('data', (data) =>
    {
      let search = decoder.write(data);
      
      if (logger === undefined && logger != false) {
        logger = true;
      }
      
      if (outputString && search.indexOf(outputString) !== -1)
      {
        /* 
         * We want to log this even when logging is disabled, since the outputString
         * typically contains key information that the user needs to know, eg. the 
         * hostname:port in the server-only case.
         */ 
        console.log(search);
        resolve();
      } 
      else if (logger)
      {
        console.log(search);
      }
    });

    task.stderr.on('data', data => console.log(_toString(data)));

    task.on('error', err => reject(err));

    task.on('close', (code) =>
    {
      if (code === 0)
      {
        console.log('child process exited with code: ' + code);
        resolve();  
      }
      else 
      {
        reject('child process exited with code: ' + code);
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
 * ## error
 * Throws error
 *
 * @public 
 * @param {string} [message] - Error message
 */
util.error = (message) => 
{
  message = message || 'Unknown error';
  throw new Error(message);
};

/**
 * ## info
 * Log info
 *
 * @public
 * @param {string} message - Error message
 */

util.info = (message) =>
{
  console.log('\x1b[32m', '[Info] ' + message ,'\x1b[0m');
};

/**
 * ## validateType
 *
 * @public 
 * @param {string} propertyName - Property name
 * @param {*} value             - Property value
 * @param {string} type         - Expected type
 * @returns {boolean || error}
 */

util.validateType = (propertyName, value, type) =>
{
  if (typeof value === type)
  {
    return true;
  }
  else
  {
    util.error('\'' + propertyName + '\' value \'' + value + '\' is not valid. Expected: ' + type)
  }
};

/**
 * ## getValidArraySize
 *
 * @public
 * @param {object} array
 * @returns {number}
 */

util.getValidArraySize = (array) =>
{
  const size = array.filter(function(value) 
  {
    return value !== undefined 
  }).length;
  
  return size; 
};

/**
 * ## fsExist
 * Checks if file/direcotry exists
 *
 * @public
 * @param {string} path - Path to check
 * @returns {function}  - Callback
 */

util.fsExists = (path, callback) =>
{
  fs.access(path, fs.F_OK, (err) => 
  {
    if (err) 
    {
      callback(err);
    } 
    else 
    {
      callback();
    }
  });
};

/**
 * ## fsExistSync
 * Checks if file/direcotry exists
 *
 * @public
 * @param {string} path - Path to check
 * @returns {boolean}   - 'true' if path exists, 'false' otherwise
 */

util.fsExistsSync = (path) =>
{
  try
  {
    fs.statSync(path);
    return true;
  }
  catch (err)
  {
    // file/directory does not exist
    return false;
  }  
};

/**
 * ## hasWhiteSpace
 * Checks if string includes white space (space, tab, carriage return, new line, vertical tab, form feed character)
 *
 * @public
 * @param {string} string
 * @returns {boolean} - 'true' if includes, 'false' otherwise
 */
util.hasWhiteSpace = (string) =>
{
  return /\s/g.test(string);
};

function _removeNonFile(matches, cwd) {
  const result = _remove(matches, dir => {
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

function _mapFileNamePrefix(matches, prefix) {
  const result = matches.map((name) => path.join(prefix, name));
  return result;
}

function _addFileListPathPrefix(match, dest, cwd) {
  const destMatch = _mapFileNamePrefix(match, dest);
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
  for (const file of fileList) {
    if (file.buildType === buildType || !file.buildType) {
      let matches = [];
      let dest;
      let cwd;
      for (let src of file.src) {
        const exclusion = src.indexOf('!') === 0;
        cwd = file.cwd;
        dest = file.dest;
        cwd = (_isFunction(file.cwd) ? cwd(cwdContext) : cwd) || '';
        dest = (_isFunction(file.dest) ? dest(destContext) : dest ) || '';
        if (exclusion) { src = src.slice(1); }

        let match = glob.sync(src, { cwd: util.destPath(cwd) });
        match = _removeNonFile(match, util.destPath(cwd));
        if (exclusion) {
          matches = _difference(matches, match);
        } else {
          matches = _union(matches, match);
        }
      }
      const prefixedPaths = _addFileListPathPrefix(matches, dest, util.destPath(cwd));
      result = result.concat(prefixedPaths);
    }
  }
  return result;
};

util.getThemeCssExtention = (buildType) => {
  return buildType==='release' ? '.min.css' : '.css';
};

util.getJETVersion = () => {
  let bowerJSON = util.destPath('bower_components/oraclejet/bower.json');
  bowerJSON = fs.readJsonSync(bowerJSON);
  return bowerJSON.version;
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

util.getPathComponents = (filePath) =>
{
  const config = require("./config");
  let token = config("paths").src.hybrid;
  let index = filePath.indexOf(token);  
  if (index < 0)
  {
    token = config("paths").src.web;
    index = filePath.indexOf(token);
    if (index < 0)
    {
      token = config("paths").src.common;
      index = filePath.indexOf(token);
      if (index < 0)
      {
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
  }
  return pathComponents;
};

util.mergeDefaultOptions = (options,defaultConfig) => {
  function customizer(objValue, srcValue, key, obj, src) {
  // do not merge for fileList or files, override with values in config
    if (srcValue instanceof Array) {
      if (key === 'fileList' || 'files') {
        return srcValue;
      }
    }
  }
  return _mergeWith({}, defaultConfig, options, customizer);
}

util.getAllThemes = () => {
  //scan both appDir/src/themes and appDir/themes directories
  //merge them
  const config = require("./config");
  const themesDir = util.destPath(path.join(config.get("paths").src.themes));
  const themesSrcDir = util.destPath(path.join(config.get("paths").src.common,config.get("paths").staging.themes));  
  let allThemes = _union(_getThemesFileList(themesDir), _getThemesFileList(themesSrcDir));
  return allThemes.filter((themeDir) => {
    if (themeDir === CONSTANTS.DEFAULT_THEME) {
      return false;
    } else {
      return themeDir.indexOf('.') === -1;
    }
  });
}

function _getThemesFileList(Dir) {
  return util.fsExistsSync(Dir) ? fs.readdirSync(Dir) : [];
}