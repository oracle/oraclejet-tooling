/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';
const path = require('path');
const util = require('./util');
const fs = require('fs-extra');

function _writeSassResultToFile(options, result) {
  if (options.sourceMap) {
    fs.ensureFileSync(options.outFile + '.map');
    fs.outputFileSync(options.outFile + '.map', result.map);
  }
  fs.ensureFileSync(options.outFile);
  fs.outputFileSync(options.outFile, result.css);
}

function _getSassTaskPromise(options, context) {
  const sass = require('node-sass');
  return new Promise((resolve, reject) => {
    sass.render(options, (err, result) => {
      if (err) {
        console.log(err);
       reject(err);
      } else {
      _writeSassResultToFile(options, result);
      console.log('sass compile\n from ' + options.file+ '\n to    '+ options.outFile +' finished..');
      resolve(context);
      }
    });
  })
}

function _getSassDest(buildType, dest) {
  let name = path.basename(dest, '.scss');
  let ext = util.getThemeCssExtention(buildType);
  return util.destPath(path.join(path.dirname(dest),  name + ext));
}



function _getSassPromises(context) {
  const opts = context.opts;
  const buildType = context.buildType;
  let result = [];
  let sassOpts = _getSassTaskOptions(buildType);
  // compile only the changed theme during livereload
  if (context.changedTheme && context.changedTheme.compile) {
    result = _getSassTask(context.changedTheme, opts, buildType, sassOpts, context, result);
  } else {
    // compile the default theme
    if(opts.theme.compile){
      result = _getSassTask(opts.theme, opts, buildType, sassOpts, context, result);
    };  
    // compile additional multi themes
    if (opts.themes) {
      opts.themes.forEach((singleTheme) => {
        if(singleTheme.compile) {
          result = _getSassTask(singleTheme, opts, buildType, sassOpts, context, result);
        }
      })
    };

  }
  return result;
}

function _getSassTaskOptions (buildType) {
  let sassOpts;
  if (buildType === 'release') {
    sassOpts = {
      outputStyle: 'compressed'
    }
  } else {
    sassOpts = {
      outputStyle: 'nested', 
      sourceMap: true
    }
  }
  return sassOpts;
}

function _getSassTask(theme, opts, buildType, sassOpts, context, promiseList) {
  const fileList = util.getFileList(buildType, opts.sass.fileList, {theme}, {theme});
  for (let file of fileList) {
    let src = file.src;
    let dest = _getSassDest(buildType, file.dest);
    if (!src || path.basename(src)[0] === '_') {
      // do nothing if the file name starts with underscore
    } else {
      let fileOpts = {
        file: src,
        outFile: dest 
      }
      sassOpts = Object.assign({precision: 10}, sassOpts, fileOpts);
      promiseList.push(_getSassTaskPromise(sassOpts, context));
    }
  }
  return promiseList;
}

module.exports = {
  getPromises: (context) => {
    return _getSassPromises(context);
  }  
}
