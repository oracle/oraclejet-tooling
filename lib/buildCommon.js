/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const fs = require('fs-extra');
const UglifyJS = require('uglify-js');

const path = require('path');
const requirejs = require('requirejs');
const util = require('./util');
const config = require('./config');

const npmCopy = require('./npmCopyConfig');
const mainJsInjector = require('./mainJsInjector');
const indexHtmlInjector = require('./indexHtmlInjector');
const CONSTANTS = require('./constants');

function _getUglyCode(file, uglifyOptions) {
  const code = fs.readFileSync(file, 'utf-8');
  uglifyOptions.fromString = true; // eslint-disable-line no-param-reassign
  return UglifyJS.minify(code, uglifyOptions);
}

function _writeUglyCodeToFile(fileList, uglifyOptions) {
  return new Promise((resolve, reject) => {
    try {
      fileList.forEach((file) => {
        const destDir = file.dest;
        const data = _getUglyCode(file.src, uglifyOptions);
        fs.outputFileSync(util.destPath(destDir), data.code);
      });
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function _copyFileToStaging(fileList) {
  return new Promise((resolve, reject) => {
    try {
      for (let i = 0; i < fileList.length; i++) {
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

function _getThemeSrcPath(theme) {
  return `${config('paths').staging.themes}/${theme.name}/${theme.platform}`;
}

function _getThemeDestPath(theme, stagingPath, ext, cssonly, servePlatform, serveDestination) {
  let dest;
  let base;
  const stylePath = config('paths').src.styles;
  if (cssonly) {
    if (servePlatform === config('paths').staging.web) {
      base = path.resolve(stagingPath);
    } else if (serveDestination === 'browser') {
      base = path.resolve(stagingPath, '..', 'platforms', serveDestination, 'www');
    } else {
      base = path.resolve(stagingPath, '..', 'platforms', servePlatform, 'assets', 'www');
    }
    dest = util.destPath(path.join(base, stylePath, theme.name, theme.version, theme.platform, '/'));
  } else {
    dest = util.destPath(path.join(stagingPath, stylePath, theme.name, theme.version, theme.platform, '/'));
  }
  return dest;
}

function _copyThemeCommonToStaging(theme, stagingPath) {
  const src = `${config('paths').staging.themes}/${theme.name}/${CONSTANTS.COMMON_THEME_DIRECTORY}`;
  const dest = util.destPath(path.join(stagingPath, config('paths').src.styles, theme.name, theme.version, CONSTANTS.COMMON_THEME_DIRECTORY));

  return new Promise((resolve, reject) => {
    util.fsExists(src, (err) => {
      if (err) {
        // do nothing, common dir is missing
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
  const srcBase = `${config('paths').staging.themes}/${CONSTANTS.DEFAULT_THEME}`;
  const destBase = util.destPath(path.join(stagingPath, config('paths').src.styles, CONSTANTS.DEFAULT_THEME, util.getJETVersion()));

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

function _copyFilesExcludeScss(srcBase, destBase) {
  try {
    fs.ensureDirSync(destBase);
    if (util.fsExistsSync(srcBase)) {
      const fileList = fs.readdirSync(srcBase);
      fileList.forEach((file) => {
        const fileStat = fs.statSync(path.join(srcBase, file));
        // if file is not scss file, copy to themes
        if (fileStat.isDirectory() || !/scss/.test(path.extname(file))) {
          fs.copySync(path.join(srcBase, file), path.join(destBase, file));
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
}

function _copySrcResourcesToThemes(theme) {
  const srcBase = `${config('paths').src.common}/${config('paths').src.themes}/${theme.name}`;
  const destBase = util.destPath(path.join(config('paths').staging.themes, theme.name));
  const srcCommon = path.join(srcBase, CONSTANTS.COMMON_THEME_DIRECTORY);
  fs.ensureDirSync(srcCommon);
  _copyFilesExcludeScss(srcCommon, path.join(destBase, CONSTANTS.COMMON_THEME_DIRECTORY));
  _copyFilesExcludeScss(path.join(srcBase, theme.platform), path.join(destBase, theme.platform));
}

function _copyMultiThemesSrcResourcesToThemes(themes) {
  if (themes) {
    themes.forEach((singleTheme) => {
      _copySrcResourcesToThemes(singleTheme);
    });
  }
}

function _copyMultiThemesToStaging(opts, stagingPath, livereload) {
  if (opts.themes && !livereload) {
    const srcBase = config('paths').staging.themes;
    opts.themes.forEach((singleTheme) => {
      // copy css
      const src = path.join(srcBase, singleTheme.name, singleTheme.platform);
      const dest = util.destPath(path.join(stagingPath, config('paths').src.styles, singleTheme.name, singleTheme.version, singleTheme.platform, '/'));
      fs.copySync(src, dest);

      // copy common dir
      const commonSrc = `${srcBase}/${singleTheme.name}/${CONSTANTS.COMMON_THEME_DIRECTORY}`;
      const commonDest = util.destPath(path.join(stagingPath, config('paths').src.styles, singleTheme.name, singleTheme.version, CONSTANTS.COMMON_THEME_DIRECTORY));
      if (util.fsExistsSync(commonSrc)) {
        fs.copySync(commonSrc, commonDest);
      }
    });
  }
}

function _copyThemesToStaging(context) {
  const opts = context.opts;
  const buildType = context.buildType;
  const platform = context.platform;
  const stagingPath = opts.stagingPath;
  const theme = context.changedTheme || opts.theme;
  const livereload = opts.cssonly;
  // copy only the css file during serve livereload
  // copy the entire theme/platform folder during build
  const ext = util.getThemeCssExtention(buildType);
  const src = _getThemeSrcPath(theme, ext, livereload);
  const dest = _getThemeDestPath(theme, stagingPath, ext, livereload, platform, opts.destination);

  return new Promise((resolve, reject) => {
    // copy to themes

    if (theme.name !== CONSTANTS.DEFAULT_THEME && !livereload) {
      _copySrcResourcesToThemes(theme);
        // copy alta resources link imageDir, fontsDir, commonImageDir
      _copyAltaResourcesToStaging(theme, stagingPath);
    }
    _copyMultiThemesSrcResourcesToThemes(opts.themes);

    // copy to staging
    // copy theme/platform to staging
    fs.copySync(src, dest);
    // copy additional resources in themes/theme/common
    _copyThemeCommonToStaging(theme, stagingPath)
    .then(_copyMultiThemesToStaging(opts, stagingPath, livereload))
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
    const fileResult = util.getFileList(context.buildType, context.opts.copySrcToStaging.fileList);
    return _copyFileToStaging(fileResult)
      .then(() => {
        console.log('copy finished...');
        return context;
      });
  },

  copyLibs: function _copyLibsToStaging(context) {
    console.log('copy library files to staging directory.....');
    const opts = context.opts;
    const buildType = context.buildType;
    const platform = context.platform;
    const ojetLibs = npmCopy.getCopyLibFileList(platform);
    const thirdPartyLibs = util.getFileList(buildType, opts.copyLibsToStaging.fileList);
    const customLibs = util.getFileList(buildType, opts.copyCustomLibsToStaging.fileList);
    return _copyFileToStaging(ojetLibs.concat(thirdPartyLibs, customLibs))
      .then(() => {
        console.log('copy finished...');
        npmCopy.renameAltaThemeFiles(config('paths'));
        return context;
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

  injectLocalhostCspRule: function _injectLocalhostCspRule(context) {
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

  copyThemes: function _copyThemes(context) {
    console.log('running theme copy task.....');
    return new Promise((resolve, reject) => {
      _copyThemesToStaging(context)
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
      }, (err) => {
        console.log(err);
        reject(err);
      });
    });
  },

  sass: function _compileSass(context) {
    console.log('compiling sass....');

    return new Promise((resolve, reject) => {
      if (context.opts.sassCompile === false) {
        console.log('sass compile skipped...');
        resolve(context);
      } else {
        // require sass here to avoid depency error if node-sass is not installed
        const sass = require('./sass'); // eslint-disable-line global-require
        const sassPromises = sass.getPromises(context);
        Promise.all(sassPromises)
        .then(() => {
          console.log('sass compile finished...');
          resolve(context);
        })
        .catch(err => reject(err));
      }
    });
  },

  cleanTemp: function _cleanTemp(context) {
    console.log('cleaning mainTemp.....');
    const opts = context.opts;
    let tempPath = opts.stagingPath;
    let tempName = opts.injectPaths;
    tempName = path.basename(tempName.destMainJs);
    tempPath = path.join(tempPath, config('paths').src.javascript, tempName);
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
