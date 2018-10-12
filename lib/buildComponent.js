/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const UglifyJS = require('uglify-es');
const config = require('./config');
const path = require('path');
const util = require('./util');
const fs = require('fs-extra');
const glob = require('glob');
const defaultOption = require('./defaultconfig');

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

function _copyToStaging(component) {
  const componentPath = _getComponentPath(component);
  const destPath = path.join(config('paths').staging.web,
    config('paths').src.javascript, config('paths').composites, component);
  console.log(destPath);
  fs.copySync(componentPath, destPath);
}

module.exports = function buildComponent(component) {
  return new Promise((resolve, reject) => {
    const componentPath = _getComponentPath(component);
    _copyScriptsToDest(componentPath);
    _uglifyComponent(componentPath)
      .then(() => {
        _copyToStaging(component);
        util.log(`Component ${component} build is finished.`);
        resolve();
      })
      .catch(err => reject(err));
  });
};
