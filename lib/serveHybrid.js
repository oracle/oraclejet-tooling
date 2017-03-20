/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * # Dependencies
 */

/* Oracle */
const config = require('./config');
const util = require('./util');
const CONSTANTS = require('./constants');
const serveWatch = require('./serve/watch');

/**
 * # ServeHybrid procedure
 *
 * @public
 * @param {function} build - build action (build or not)
 * @param {Object} resolve
 */
module.exports = (build, resolve) => {
  build()
    .then(_cdToCordovaDirectory)
    .then(_cordovaClean)
    .then(_cordovaServe)
    .then(_cordovaRun)
    .then(_cdFromCordovaDirectory)
    .then(() => {
      const serveOptions = config.get('serve');
      if (serveOptions.livereload) {
        serveWatch(serveOptions.watch, serveOptions.livereloadPort);
      } else if (serveOptions.destination !== 'browser' && serveOptions.destination !== 'server-only') {
        /* If serving to Browser or running in headless mode, process can't be killed by resolve()
         as this would kill static web server */
        resolve();
      }
    })
    .catch((error) => {
      // Can not throw in promise catch handler
      // http://stackoverflow.com/questions/30715367/why-can-i-not-throw-inside-a-promise-catch-handler
      setTimeout(() => {
        throw util.toError(error);
      }, 0);
    });
};

/**
 * # Private functions
 * ## _cdToCordovaDirectory
 * Set Cordova directory the current working directory
 *
 * @private
 * @returns {Promise}
 */
function _cdToCordovaDirectory() {
  return new Promise((resolve) => {
    process.chdir(config('paths').staging.hybrid);
    resolve();
  });
}

/**
 * ## _cdFromCordovaDirectory
 * Set Cordova directory the current working directory
 *
 * @private
 * @returns {Promise}
 */
function _cdFromCordovaDirectory() {
  return new Promise((resolve) => {
    process.chdir('..');
    resolve();
  });
}

/**
 * ## codrovaClean
 * Cleanup project from build artifactsProcessing logic TBD...
 *
 * @private
 * @returns {Promise}
 */
function _cordovaClean() {
  const platform = config.get('platform');
  const destination = config.get('serve').destination;

  if (platform !== 'windows' && destination !== 'browser') {
    return util.spawn('cordova', ['clean', destination === 'browser' ? 'browser' : platform]);
  }
  return null;
}

/**
 * ## _cordovaServe
 *
 * @private
 * @returns {Promise}
 */
function _cordovaServe() {
  const serveOptions = config.get('serve');
  if (serveOptions.livereload || serveOptions.destination === 'server-only') {
    return util.spawn('cordova', ['serve', serveOptions.port], 'Static file server running on');
  }
  return null;
}

/**
 * ## _cordovaRun
 *
 * @private
 * @returns {Promise}
 */
function _cordovaRun() {
  const serveOptions = config.get('serve');
  const destination = serveOptions.destination;
  const destinationTarget = serveOptions.destinationTarget;

  if (destination !== 'server-only') {
    if (destination === 'browser') {
      const params = ['run', 'browser', '--', `--target=${destinationTarget}`];
      const port = serveOptions.port;
      if (port) {
        params.push(`--port=${port}`);
      }

      return util.spawn('cordova', params, 'Static file server running @');
    }
    const params = ['run'];
    const platform = config.get('platform');

    params.push(platform);

    if (destinationTarget) {
      params.push(`--target=${destinationTarget}`);
    } else {
      // Destination can be only 'emulator' or 'device'
      params.push(`--${destination}`);
    }

    const buildConfig = config.get('serve').buildConfig;
    if (buildConfig) {
      params.push(`--buildConfig=${buildConfig}`);
    }

    const buildType = config.get('serve').buildType;
    if (buildType === 'release') {
      params.push(CONSTANTS.RELEASE_FLAG);
    } else {
      params.push(CONSTANTS.DEBUG_FLAG);
    }

    const platformOptions = serveOptions.platformOptions;
    if (platformOptions) {
      params.push('--');
      params.push(platformOptions);
    }

    if (platform === 'android') {
      // If spawned, for an unknown reason the command is not resolved properly
      // the last log message after booting Android emulator is LAUNCH SUCCESS
      // Return the promise to fix a bug when cold starting Android emulator
      return util.exec(`${'cordova '}${params.join(' ')}`, 'LAUNCH SUCCESS');
    }
    return util.spawn('cordova', params);
  }
  return null;
}
