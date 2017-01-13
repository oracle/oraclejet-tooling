/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * # Dependencies
 */

/* 3rd party */
const grunt = require('grunt');

/* Oracle */
const CONSTANTS = require('./constants');
const config = require('./config');
const gruntPlugins = require('./serveGruntPlugins');
const util = require('./util');

/**
 * # ServeHybrid procedure
 *
 * @public
 */

module.exports = (build, resolve) => {
  build()
    .then(gruntPlugins.load)
    .then(cdToCordovaDirectory)
    .then(cordovaClean)
    .then(cordovaServe)
    .then(cordovaRun)
    .then(cdFromCordovaDirectory)
    .then(() => {
      const serveOptions = config.get('serve');
      if (serveOptions.livereload) {
        /* Process can't be killed by calling resolve() */
        gruntPlugins.registerTasks();
        const watchTasks = (serveOptions.sassCompile || serveOptions.sassCompile === undefined)
                           ? 'watch' : 'watch:sourceFiles';
        grunt.tasks(watchTasks);
        gruntPlugins.handleFileChanges();
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
        util.error(error);
      }, 0);
    });
};

/**
 * ## cdToCordovaDirectory
 * Set Cordova directory the current working directory
 *
 * @private
 * @returns {Promise}
 */

function cdToCordovaDirectory() {
  return new Promise((resolve) => {
    process.chdir(config('paths').staging.hybrid);
    resolve();
  });
}

/**
 * ## cdFromCordovaDirectory
 * Set Cordova directory the current working directory
 *
 * @private
 * @returns {Promise}
 */

function cdFromCordovaDirectory() {
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

function cordovaClean() {
  const platform = config.get('platform');
  const destination = config.get('serve').destination;

  if (platform !== 'windows' && destination !== 'browser') {
    return util.spawn('cordova', ['clean', destination === 'browser' ? 'browser' : platform]);
  }
}

/**
 * ## cordovaServe
 *
 * @private
 * @returns {Promise}
 */

function cordovaServe() {
  const serveOptions = config.get('serve');
  if (serveOptions.livereload || serveOptions.destination === 'server-only') {
    return util.spawn('cordova', ['serve', serveOptions.port], 'Static file server running on');
  }
}

/**
 * ## cordovaRunApp
 *
 * @private
 * @returns {Promise}
 */

function cordovaRun() {
  const serveOptions = config.get('serve');
  const destination = serveOptions.destination;
  const destinationTarget = serveOptions.destinationTarget;

  if (destination !== 'server-only') {
    if (destination === 'browser') {
      const params = ['run', 'browser', `--target=${destinationTarget}`];

      return util.spawn('cordova', params, 'Static file server running @');
    } else {
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
        return util.exec(`${'cordova' + ' '}${params.join(' ')}`, 'LAUNCH SUCCESS');
      } else {
        return util.spawn('cordova', params);
      }
    }
  }
}
