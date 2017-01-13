/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const CONSTANTS = require('./constants');
const exec = require('child_process').exec;
const indexHtmlInjector = require('./indexHtmlInjector');
const buildCommon = require('./buildCommon');
const path = require('path');
const util = require('./util');
const fs = require('fs-extra');

function _injectScriptTags(context) {
  console.log('injecting index.html with cordova script...');
  return indexHtmlInjector.injectScriptTags(context);
}

function _invokeCordovaPrepare(context) {
  console.log('invoke cordova prepare.....');
  const platform = context.platform;
  let cwd = context.opts.stagingPath;
  cwd = path.resolve(cwd, '..');

  return new Promise((resolve, reject) => {
    const cmd = `cordova prepare ${platform}`;
    const cmdOpts = { cwd: util.destPath(cwd), stdio: [0, 'pipe', 'pipe'], maxBuffer: 1024 * 20000};
    const cordova = exec(cmd, cmdOpts, (error) => {
      if (error) {
        console.log(error);
        reject(error);
      }
      console.log('cordova prepare finished....');
      resolve(context);
    });

    cordova.stdout.on('data', (data) => {
      console.log(data);
    });
  });
}

function _getCordovaBuildType(target) {
  return (target === 'release') ? CONSTANTS.RELEASE_FLAG : CONSTANTS.DEBUG_FLAG;
}

function _getCordovaBuildConfig(bConfig) {
  let resultConfig;
  if (bConfig) {
    const bcPath = path.isAbsolute(bConfig) ? bConfig : util.destPath(bConfig);
    if (!fs.existsSync(bcPath)) {
      throw new Error(`Please ensure location of buildConfig is correct, current : ${bcPath}`);
    }

    resultConfig = `--buildConfig=${bcPath}`;
  }

  return resultConfig;
}

function _getCordovaBuildDestination(destination) {
  return `--${destination}`;
}

function _getCordovaPlatformOptions(platformOptions) {
  return (platformOptions) ? `-- ${platformOptions}` : '';
}

function _invokeCordovaCompile(context) {
  console.log('invoke cordova compile.....');
  const platform = context.platform;
  const opts = context.opts;
  let cwd = opts.stagingPath;
  cwd = path.resolve(cwd, '..');

  const buildType = _getCordovaBuildType(context.buildType);
  const buildConfig = _getCordovaBuildConfig(opts.buildConfig);
  const buildDestination = _getCordovaBuildDestination(opts.destination);
  const platformOptions = _getCordovaPlatformOptions(opts.platformOptions);

  return new Promise((resolve, reject) => {
    let cmd = `cordova compile ${platform} ${buildType} ${buildDestination}`;
    if (buildConfig) cmd += ` ${buildConfig}`;
    if (platformOptions) cmd += ` ${platformOptions}`;
    const cmdOpts = { cwd: util.destPath(cwd), stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 20000 };
    const cordova = exec(cmd, cmdOpts, (error) => {
      if (error) reject(error);
      console.log('Cordova compile finished....');
      resolve(context);
    });

    cordova.stdout.on('data', (data) => {
      console.log(data);
    });
  });
}

function _runCordovaBuildTasks(context) {
  return new Promise((resolve, reject) => {
    const opts = context.opts;
    if (opts.buildForServe) {
      resolve(context);
    } else {
      _invokeCordovaPrepare(context)
      .then(_invokeCordovaCompile)
      .then((data) => resolve(data))
      .catch(err => reject(err));
    }
  });
}

function _runCommonBuildTasks(context) {
  return new Promise((resolve, reject) => {
    buildCommon.clean(context)
      .then(buildCommon.copy)
      .then(buildCommon.sass)
      .then(buildCommon.copyThemes)
      .then(buildCommon.injectTheme)
      .then(_injectScriptTags)
      .then(buildCommon.injectPaths)
      .then((data) => resolve(data))
      .catch(err => reject(err));
  });
}

function _runReleaseBuildTasks(context) {
  return new Promise((resolve, reject) => {
    const opts = context.opts;
    if (opts.buildType !== 'release') {
      resolve(context);
    } else {
      buildCommon.uglify(context)
        .then(buildCommon.requireJs)
        .then(buildCommon.cleanTemp)
        .then((data) => resolve(data))
        .catch(err => reject(err));
    }
  });
}

module.exports = function buildHybrid(buildType, platform, opts) {
  const context = { buildType, platform, opts };

  return new Promise((resolve, reject) => {
    _runCommonBuildTasks(context)
      .then(_runReleaseBuildTasks)
      .then(_runCordovaBuildTasks)
      .then((data) => resolve(data))
      .catch(err => reject(err));
  });
};
