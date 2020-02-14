/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const util = require('./util');
const fs = require('fs-extra');
const path = require('path');

function _getPcssPromises(context) {
  // compile only the changed theme during livereload
  // if (context.changedTheme && context.changedTheme.compile) {
  //   return _getSassTasks(context.changedTheme, context);
  // }
  // console.log(context.changedCcaTheme);
  // if (context.changedCcaTheme) {
  //   console.log(`CCA ${context.changedCcaTheme} Changed...`);
  //   return _getCcaSassTasks(context, true);
  // }

  return _getDefaultPcssThemeTasks(context);
}

function _getDefaultPcssThemeTasks(context) {
  const opts = context.opts;
  // compile the default theme
  let taskArray = [];
  if (opts.theme.compile) {
    taskArray = taskArray.concat(_getPcssTasks(opts.theme, context));
  }

  // // if svg is enabled, re-compile Alta
  // if ((opts.svg) && opts.theme.name === CONSTANT.DEFAULT_THEME) {
  //   taskArray = taskArray.concat(_getAltaSassTasks(opts.theme, context));
  // }

  // compile additional multi themes
  if (opts.themes) {
    opts.themes.forEach((singleTheme) => {
      if (singleTheme.compile) {
        taskArray = taskArray.concat(_getPcssTasks(singleTheme, context));
      }
    });
  }

  // // compile cca
  // if (opts.sassCompile) {
  //   taskArray = taskArray.concat(_getCcaSassTasks(context, false));
  // }

  return taskArray;
}

function _getPcssTasks(theme, context) {
  let fileList = _getPcssThemeFileList(context.opts.pcss.fileList);
  fileList = util.getFileList(context.buildType, fileList, { theme }, { theme });
  return _getPcssTasksFromFileList(theme, fileList, context, false);
}

function _getPcssThemeFileList(fileList) {
  return fileList.filter(fileObj => !util.isCcaSassFile(fileObj.cwd));
}

function _getPcssDest(buildType, dest) {
  const name = path.basename(dest, '.scss');
  const ext = util.getThemeCssExtention(buildType);
  const pcssDest = util.destPath(path.join(path.dirname(dest), `${name}-cssvars${ext}`));

  // if (util.isCcaSassFile(dest)) {
  //   const base = path.join(config('paths').staging.stagingPath, config('paths').src.javascript,
  //                config('paths').composites);
  //   const topDir = path.parse(path.relative(base, dest)).dir;
  //   const components = glob.sync('**/component.json', { cwd: path.join(base, topDir) });
  //   // is standalone component
  //   if (components.length === 1) {
  //     pcssDest = util.destPath(path.join(base, topDir, components[0], '..', name + ext));
  //   } else {
  //     const componentJsonPath = path.join(base, topDir, 'component.json');
  //     const packVersion = util.fsExistsSync(componentJsonPath) ?
  //       util.readJsonAndReturnObject(componentJsonPath).version : '1.0.0';
  //     pcssDest = util.destPath(path.join(base, topDir, packVersion, name + ext));
  //   }
  // }
  return pcssDest;
}

function _writePcssResultToFile(options, result) {
  if (options.sourceMap) {
    fs.ensureFileSync(`${options.outFile}.map`);
    fs.outputFileSync(`${options.outFile}.map`, result.map);
  }
  fs.ensureFileSync(options.outFile);
  fs.outputFileSync(options.outFile, result.css);
}

function _writeCustomizedCss(postcss, gplugin, outFile, destFile, option) {
  return new Promise((resolve, reject) => {
    let processoption = {};
    // set the from property to undefined to avoid postcss warning
    if (!option) {
      processoption = {
        parser: postcss,
        from: undefined
      };
    } else {
      processoption = {
        processors: [
          gplugin({ browsers: 'last 2 Edge major versions, last 2 chrome major version, last 2 firefox major version, firefox esr, ie 11, last 2 safari major version, last 2 ios major version' })
        ],
        parser: postcss,
        from: undefined
      };
    }
    postcss(gplugin)
    .process(outFile, processoption)
    .then((result) => {
      fs.ensureFileSync(destFile);
      fs.outputFileSync(destFile, result.css);
      resolve();
    })
    .catch(err => reject(err));
  });
}

function _getPcssTaskPromise(options, context) {
  const sass = require('node-sass'); // eslint-disable-line
  const postcss = require('postcss'); // eslint-disable-line
  const customProperties = require('postcss-custom-properties'); // eslint-disable-line
  const pcssCalc = require('postcss-calc'); // eslint-disable-line
  const autoPrefix = require('autoprefixer'); // eslint-disable-line
  return new Promise((resolve, reject) => {
    sass.render(options, (err, result) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        _writePcssResultToFile(options, result);
        console.log(`Pcss compile\n From => ${options.file}\n To =>    ${options.outFile} finished..`);
        // compile custom property css to variable converted to value css
        const css = fs.readFileSync(options.outFile, 'utf-8');
        const fileName = path.basename(options.file, '.scss');
        const processFile = util.destPath(path.join(path.dirname(options.outFile), `${fileName}.css`));
        new Promise((resolve, reject) => { // eslint-disable-line
          _writeCustomizedCss(postcss, customProperties, css, processFile);
          console.log(`Pcss custom property compile\n From => ${options.outFile}\n To =>    ${processFile} finished..`);
          resolve();
        })
        .then(() => {
          _writeCustomizedCss(postcss, pcssCalc, css, options.outFile);
          console.log(`Pcss calc compile\n To => ${options.outFile} finished..`);
          resolve();
        })
        .then(() => {
          const processedcss = fs.readFileSync(processFile, 'utf-8');
          _writeCustomizedCss(postcss, pcssCalc, processedcss, processFile);
          console.log(`Pcss calc compile\n To => ${processFile} finished..`);
          resolve();
        })
        .then(() => {
          const autoprefixvarscss = fs.readFileSync(options.outFile, 'utf-8');
          _writeCustomizedCss(postcss, autoPrefix, autoprefixvarscss, options.outFile, 'prefix');
          console.log(`Pcss Autoprefixer compile\n To => ${options.outFile} finished..`);
          resolve();
        })
        .then(() => {
          const autoprefixcss = fs.readFileSync(processFile, 'utf-8');
          _writeCustomizedCss(postcss, autoPrefix, autoprefixcss, processFile, 'prefix');
          console.log(`Pcss Autoprefixer compile\n To => ${processFile} finished..`);
          resolve();
        });
        resolve(context);
      }
      return true;
    });
  });
}

function _getPcssTasksFromFileList(theme, fileList, context, isCcaLiveReload) {
  const promiseList = [];
  const opts = context.opts;
  const buildType = context.buildType;
  const pcssOpts = _getPcssTaskOptions(buildType, opts.pcss.options);
  fileList.forEach((file) => {
    const src = file.src;
    const dest = _getPcssDest(buildType, file.dest);
    if (!src || path.basename(src)[0] === '_') {
      // do nothing if the file name starts with underscore
    } else if (isCcaLiveReload && !_matchChangedCca(src, theme)) {
      // do nothing if the SASS file is not in right CCA for livereload
    } else {
      const fileOpts = {
        file: src,
        outFile: dest
      };
      const finalPcssOpts = Object.assign({}, pcssOpts, fileOpts);
      promiseList.push(_getPcssTaskPromise(finalPcssOpts, context));
    }
  });
  return promiseList;
}

function _matchChangedCca(filePath, changedCcaTheme) {
  return filePath.indexOf(changedCcaTheme) !== -1;
}

function _getPcssTaskOptions(buildType, defaultPcssOpts) {
  let pcssOpts;
  if (buildType === 'release') {
    pcssOpts = {
      outputStyle: 'compressed'
    };
  } else {
    pcssOpts = {
      outputStyle: 'nested'
    };
  }
  return Object.assign({}, pcssOpts, defaultPcssOpts);
}

module.exports = {
  getPromises: context => _getPcssPromises(context)
};
