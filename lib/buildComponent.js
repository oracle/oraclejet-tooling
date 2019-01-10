/**
  Copyright (c) 2015, 2019, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const UglifyJS = require('uglify-es');
const config = require('./config');
const CONSTANTS = require('./constants');
const path = require('path');
const util = require('./util');
const fs = require('fs-extra');
const glob = require('glob');
const defaultOption = require('./defaultconfig');
const hookRunner = require('./hookRunner');

function _uglifyComponent(componentPath) {
  return new Promise((resolve, reject) => {
    try {
      const destPath = _getComponentDest(componentPath);
      const files = glob.sync('**/*.js', { cwd: destPath });
      const uglifyOptions = defaultOption.build.uglify(config('paths')).options;
      files.forEach((file) => {
        const dest = path.join(destPath, file);
        const data = _getUglyCode(dest, uglifyOptions);
        if (data.error) reject(data.error);
        fs.writeFileSync(dest, data.code);
      });
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function _getComponentDest(componentPath) {
  return path.join(componentPath, 'min');
}

function _getUglyCode(file, uglifyOptions) {
  const code = fs.readFileSync(file, 'utf-8');
  return UglifyJS.minify(code, uglifyOptions);
}

function _copyScriptsToDest(componentPath) {
  const destPath = _getComponentDest(componentPath);
  fs.removeSync(destPath);
  // avoid recursively copy the min directory
  const filter = function (src) {
    return !/min/.test(src);
  };

  fs.copySync(componentPath, destPath, { filter });
}

function _getComponentPath(component) {
  const basePath = path.join(config('paths').src.common,
    config('paths').src.javascript, config('paths').composites);
  const componentPath = path.join(basePath, component);
  if (!util.fsExistsSync(componentPath)) {
    util.log.error(`The component ${component} is not found`);
  }
  return componentPath;
}

function _getComponentJsonObj(componentPath) {
  const file = path.resolve(componentPath, 'component.json');
  if (util.fsExistsSync(file)) {
    return fs.readJsonSync(file);
  }
  return {};
}

function _copyToStaging(component) {
  const srcPath = _getComponentPath(component);
  const destBase = path.join(config('paths').staging.web,
    config('paths').src.javascript, config('paths').composites);
  const componentJson = util.readJsonAndReturnObject(path.join(srcPath,
    CONSTANTS.JET_COMPONENT_JSON));
  if (!util.hasProperty(componentJson, 'version')) {
    util.log.error(`Missing property 'version' in '${component}' component's/pack's definition file.`);
  }
  const destPath = path.join(destBase, component, componentJson.version);
  util.deleteDir(path.join(destBase, component));
  fs.copySync(srcPath, destPath);
}

module.exports = function buildComponent(component) {
  return new Promise((resolve, reject) => {
    const componentPath = _getComponentPath(component);
    const context = { componentConfig: _getComponentJsonObj(componentPath) };
    _copyScriptsToDest(componentPath);
    _uglifyComponent(componentPath)
      .then(_copyToStaging(component))
      .then(hookRunner('after_component_build', context))
      .then(data => resolve(data))
      .catch(err => reject(err));
  });
};
