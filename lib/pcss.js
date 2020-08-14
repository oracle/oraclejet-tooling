/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const util = require('./util');
const fs = require('fs-extra');
const path = require('path');

function _getPcssPromises(context) {
  // compile only the changed theme during livereload
  if (context.changedTheme && context.changedTheme.compile) {
    return _getPcssTasks(context.changedTheme, context);
  }

  if (context.changedCcaTheme) {
    console.log(`CCA ${context.changedCcaTheme} Changed...`);
    return _getCcaPcssTasks(context, true);
  }

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

  // compile cca
  if (opts.sassCompile) {
    taskArray = taskArray.concat(_getCcaPcssTasks(context, false));
  }

  return taskArray;
}

function _getCcaPcssTasks(context, isCcaLiveReload) {
  const fileList = util.getFileList(context.buildType, _getCcaFileList(context.opts.pcss.fileList));
  return _getPcssTasksFromFileList(context.changedCcaTheme, fileList, context, isCcaLiveReload);
}

function _getPcssTasks(theme, context) {
  let fileList = _getPcssThemeFileList(context.opts.pcss.fileList);
  fileList = util.getFileList(context.buildType, fileList, { theme }, { theme });
  return _getPcssTasksFromFileList(theme, fileList, context, false);
}

function _getCcaFileList(fileList) {
  return fileList.filter(fileObj => util.isCcaSassFile(fileObj.cwd));
}

function _getPcssThemeFileList(fileList) {
  return fileList.filter(fileObj => !util.isCcaSassFile(fileObj.cwd));
}

function _getPcssDest(buildType, dest) {
  const name = path.basename(dest, '.scss');
  const ext = util.getThemeCssExtention(buildType);
  const isReleaseBuild = buildType === 'release';
  let pcssDest = util.destPath(path.join(path.dirname(dest), `${name}-cssvars${ext}`));
  if (util.isCcaSassFile(dest)) {
    const { componentPath, subFolders } = util.getComponentPathFromThemingFileDest({
      dest,
      isReleaseBuild
    });
    pcssDest = util.destPath(path.join(componentPath, subFolders, `${name}-cssvars${ext}`));
  }
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
          gplugin({ overrideBrowserslist: 'last 2 Edge major versions, last 2 chrome major version, last 2 firefox major version, firefox esr, ie 11, last 2 safari major version, last 2 ios major version' })
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

        // Adding current cli version number to token @jetcssversion@ in css
        let cssFileContent = fs.readFileSync(options.outFile, 'utf-8');
        cssFileContent = util.regExReplace(cssFileContent, '@jetcssversion@', `v${util.getJETVersion()}`);
        fs.writeFileSync(options.outFile, cssFileContent);

        // compile custom property css to variable converted to value css
        const css = util.readFileSync(options.outFile);
        const fileName = (options.outFile.indexOf('.min.') === -1) ?
          path.basename(options.file, '.scss') : `${path.basename(options.file, '.scss')}.min`;
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
            const processedcss = util.readFileSync(processFile);
            _writeCustomizedCss(postcss, pcssCalc, processedcss, processFile);
            console.log(`Pcss calc compile\n To => ${processFile} finished..`);
            resolve();
          })
          .then(() => {
            const autoprefixvarscss = util.readFileSync(options.outFile);
            _writeCustomizedCss(postcss, autoPrefix, autoprefixvarscss, options.outFile, 'prefix');
            console.log(`Pcss Autoprefixer compile\n To => ${options.outFile} finished..`);
            resolve();
          })
          .then(() => {
            const autoprefixcss = util.readFileSync(processFile);
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
