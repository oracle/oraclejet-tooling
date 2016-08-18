/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';
const fs = require('fs-extra');
const UglifyJS = require('uglify-js');

const path = require('path');
const requirejs = require('requirejs');
const util = require('./util');

const mainJsInjector = require('./mainJsInjector');
const indexHtmlInjector = require('./indexHtmlInjector');
const CONSTANTS = require("./constants");

function _getUglyCode(file, uglifyOptions) {
  const code = fs.readFileSync(file, 'utf-8');
  uglifyOptions.fromString = true;
  return UglifyJS.minify(code, uglifyOptions);
}

function _writeUglyCodeToFile(fileList, uglifyOptions) {
  return new Promise((resolve, reject) => {
    try {
      for (let i = 0; i < fileList.length; i ++) {
        const destDir = fileList[i].dest;
        const data = _getUglyCode(fileList[i].src, uglifyOptions);
        fs.outputFileSync(util.destPath(destDir), data.code);
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function _copyFileToStaging(fileList) {
  return new Promise((resolve, reject) => {
    try {
      for (let i = 0; i < fileList.length; i ++) {
        const destDir = fileList[i].dest;
        const srcDir = fileList[i].src;
        fs.copySync(srcDir, destDir, { clobber: true });
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function _getThemeSrcPath(theme, ext, cssonly) {
  let src;
  if (cssonly) {
    src = `themes/${theme.name}/${theme.platform}/${theme.name}${ext}`;
  } else {
    src = `themes/${theme.name}/${theme.platform}`;
  }
  return src;
}

function _getThemeDestPath(theme, stagingPath, ext, cssonly, servePlatform, serveDestination) {
  let dest, base;
  if (cssonly) {    
    if (servePlatform === CONSTANTS.WEB_DIRECTORY) {
      base = path.resolve(stagingPath);
    } else if (serveDestination === 'browser') {
      base = path.resolve(stagingPath, '..', 'platforms', serveDestination, 'www');
    } else {
      base = path.resolve(stagingPath, '..', 'platforms', servePlatform, 'assets', 'www');      
    }
    dest = util.destPath(path.join(base,'css', theme.name, theme.version, theme.platform, theme.name + ext));    
  } else {
    dest = util.destPath(path.join(stagingPath,'css', theme.name, theme.version, theme.platform, '/'));
  }
  return dest;
}

function _copyThemeCommonToStaging(theme, stagingPath, ext) {

  let src = `themes/${theme.name}/${CONSTANTS.COMMON_THEME_DIRECTORY}`;
  let dest = util.destPath(path.join(stagingPath, 'css', theme.name, theme.version, CONSTANTS.COMMON_THEME_DIRECTORY));
 
  return new Promise((resolve, reject) => {
    util.fsExists(src, (err) => {
      if (err) {
        //do nothing, common dir is missing
        resolve();
      } else {
        try {
          fs.copySync(src, dest);
          resolve();
        } catch (error) {
          reject(error);
        }
      } 
    });
  });
}

function _copyAltaResourcesToStaging(theme, stagingPath) {
  const srcBase = `themes/${CONSTANTS.DEFAULT_THEME}`;
  const destBase = util.destPath(path.join(stagingPath, 'css', CONSTANTS.DEFAULT_THEME, util.getJETVersion()));

  const commonSrc = path.join(srcBase, CONSTANTS.COMMON_THEME_DIRECTORY);
  const altaFontsSrc = path.join(srcBase, theme.platform, 'fonts');
  const altaImagesSrc = path.join(srcBase, theme.platform, 'images');

  const commonDest = path.join(destBase, CONSTANTS.COMMON_THEME_DIRECTORY);
  const altaFontsDest = path.join(destBase, theme.platform, 'fonts');
  const altaImagesDest = path.join(destBase, theme.platform, 'images');

  fs.copySync(commonSrc, commonDest);
  fs.copySync(altaFontsSrc, altaFontsDest);
  fs.copySync(altaImagesSrc, altaImagesDest);
}

function _copySrcResourcesToThemes(theme) {
  const srcBase = `src/themes/${theme.name}/${theme.platform}`;
  const destBase = util.destPath(path.join('themes', theme.name, theme.platform));
  try {
    const fileList = fs.readdirSync(srcBase);
    fileList.forEach((file) => {
      const fileStat = fs.statSync(path.join(srcBase, file));
      // if file is not scss file, copy to themes
      if (fileStat.isDirectory() || !/scss/.test(path.extname(file))) {
        fs.copySync(path.join(srcBase, file), path.join(destBase, file));
      };
    });
  } catch (err) {
    console.log(err);
  }
}


function _copyThemeToStaging(context) {
  const opts = context.opts;
  const buildType = context.buildType;
  const platform = context.platform;
  const stagingPath = opts.stagingPath;
  const theme = opts.theme;
  const cssonly = opts.cssonly;
  // copy only the css file during serve livereload
  // copy the entire theme/platform folder during build
  let ext = util.getThemeCssExtention(buildType);
  let src = _getThemeSrcPath(theme, ext, cssonly);
  let dest = _getThemeDestPath(theme, stagingPath, ext, cssonly, platform, opts.destination);

  return new Promise((resolve, reject) => {
    if (theme.name !== CONSTANTS.DEFAULT_THEME) {
      _copySrcResourcesToThemes(theme);
        //copy alta resources link imageDir, fontsDir, commonImageDir
      _copyAltaResourcesToStaging(theme, stagingPath);
    }

    //copy theme/platform to staging
    fs.copySync(src, dest);
  
    // copy additional resources in themes/theme/common 
    _copyThemeCommonToStaging(theme, stagingPath, ext)
    .then(() => {
      resolve(context);
    })
    .catch(err => reject(err));
  });
}

module.exports = {
  clean: function _clean(context) {
    console.log('cleaning staging path.....');
    const opts = context.opts;
    const stagingPath = opts.stagingPath;
    const filePath = util.destPath(stagingPath);
    return new Promise((resolve, reject) => {
      fs.emptyDir(filePath, (err) => {
        if (err) reject(err);
        resolve(context);
      });
    });
  },

  copy: function _copySrcToStaging(context) {
    console.log('copy files to staging directory.....');
    const opts = context.opts;
    const buildType = context.buildType;
    const copyConfig = opts.copyToStaging;
    const fileList = copyConfig.fileList;
    const fileResult = util.getFileList(buildType, fileList);
    return new Promise((resolve, reject) => {
      _copyFileToStaging(fileResult)
        .then(() => {
          console.log('copy finished...');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  injectPaths: function _injectMainPaths(context) {
    console.log('running injection task.....');
    return new Promise((resolve, reject) => {
      mainJsInjector.injectPaths(context)
        .then(() => {
          console.log('mainJs paths injection finished..');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  injectLocalhostCspRule: function _injectLocalhostCspRule(context)
  {
    console.log('running localhost csp rule injection task.....');

    return new Promise((resolve, reject) => {
      indexHtmlInjector.injectLocalhostCspRule(context)
        .then(() => {
          console.log('indexHtml localhost csp rule injection finished..');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  injectTheme: function _injectTheme(context) {
    console.log('running theme injection task.....');

    return new Promise((resolve, reject) => {
      indexHtmlInjector.injectThemePath(context)
        .then(() => {
          console.log('indexHtml theme path injection finished..');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  copyTheme: function _copyTheme(context) {
    console.log('running theme copy task.....');

    return new Promise((resolve, reject) => {
      _copyThemeToStaging(context)
        .then(() => {
          console.log('theme copy finished...');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  uglify: function _uglify(context) {
    console.log('running uglify tasks.....');

    const opts = context.opts;
    const buildType = context.buildType;
    const platform = context.platform;
    const uglifyConfig = opts.uglify;
    const fileResult = util.getFileList(buildType, uglifyConfig.fileList, platform);

    return new Promise((resolve, reject) => {
      _writeUglyCodeToFile(fileResult, uglifyConfig.options)
        .then(() => {
          console.log('uglify finished...');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  requireJs: function _requireJs(context) {
    console.log('running requirejs tasks.....');

    const opts = context.opts;
    const requireConfig = opts.requireJs;

    return new Promise((resolve, reject) => {
      requirejs.optimize(requireConfig, () => {
        console.log('requireJs finished...');
        resolve(context);
      }, err => {
        console.log(err);
        reject(err);
      });
    });
  },

  sass: function _compileSass(context) {
    console.log('compiling sass....');

    return new Promise((resolve, reject) => {
      if (!context.opts.sassCompile) {
        console.log('sass compile skipped...');
        resolve(context);
      } else {
        //require sass here to avoid depency error if node-sass is not installed
        const sass = require('./sass');
        const sassPromises = sass.getPromises(context);
        Promise.all(sassPromises)
        .then(() => {
          console.log('sass compile finished...');
          resolve(context); 
        })
        .catch( err => reject(err));
      }      
    });
  },

  cleanTemp: function _cleanTemp(context) {
    console.log('cleaning mainTemp.....');
    const opts = context.opts;
    let tempPath = opts.stagingPath;
    let tempName = opts.injectPaths;
    tempName = path.basename(tempName.destMainJs);
    tempPath = path.join(tempPath, 'js', tempName);
    const filePath = util.destPath(tempPath);

    return new Promise((resolve, reject) => {
      fs.remove(filePath, (err) => {
        if (err) reject(err);
      });
      console.log('cleanMainTemp task finished...');
      resolve(context);
    });
  },
};
