/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const fs = require('fs-extra');
const glob = require('glob');
const path = require('path');
const requirejs = require('requirejs');
const util = require('./util');
const config = require('./config');
const npmCopy = require('./npmCopy');
const injectorUtil = require('./injectorUtil');
const mainJsInjector = require('./mainJsInjector');
const indexHtmlInjector = require('./indexHtmlInjector');
const svg = require('./svg');
const CONSTANTS = require('./constants');
const hookRunner = require('./hookRunner');
const pathGenerator = require('./rjsConfigGenerator');
const _minifyComponentInternal = require('./buildCommon/minifyComponent');
const copyLocalComponent = require('./buildCommon/copyLocalComponent');
const {
  compileApplicationTypescript,
  compileComponentTypescript,
  cleanTypescript
} = require('./buildCommon/compileTypescript');

function _getName(myPath, destFile) {
  const tempName = path.basename(destFile);
  return util.destPath(path.join(myPath, config('paths').src.javascript, tempName));
}

function _copyFileToStaging(fileList) {
  return new Promise((resolve, reject) => {
    try {
      for (let i = 0; i < fileList.length; i++) {
        const destDir = fileList[i].dest;
        const srcDir = fileList[i].src;
        if (_isSvgFile(srcDir)) {
          fs.copySync(srcDir, destDir, { overwrite: false, errorOnExist: false });
        } else {
          fs.copySync(srcDir, destDir, { overwrite: true });
        }
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function _isSvgFile(fileName) {
  return path.extname(fileName) === '.svg';
}

function _getThemeSrcPath(theme) {
  return `${config('paths').staging.themes}/${theme.name}/${theme.platform}`;
}

function _getThemeDestPath(theme, stagingPath, ext, cssonly, servePlatform, serveDestination) {
  let dest;
  let base;
  const stylePath = config('paths').src.styles;
  if (cssonly) {
    if (servePlatform === 'web') {
      base = path.resolve(stagingPath);
    } else if (serveDestination === 'browser') {
      base = path.resolve(stagingPath, '..', 'platforms', serveDestination, 'www');
    } else if (servePlatform === 'ios' || servePlatform === 'windows') {
      base = path.resolve(stagingPath, '..', 'platforms', servePlatform, 'www');
    } else {
      base = path.resolve(stagingPath, '..', 'platforms', servePlatform, 'app/src/main/assets', 'www');
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

function _copyDefaultResourcesToStaging(theme, stagingPath, themeName) {
  const srcBase = `${config('paths').staging.themes}/${themeName}`;
  const destBase = util.destPath(path.join(stagingPath, config('paths').src.styles, themeName, util.getJETVersion()));

  const defaultFontsSrc = path.join(srcBase, theme.platform, 'fonts');
  const defaultImagesSrc = path.join(srcBase, theme.platform, 'images');

  const defaultFontsDest = path.join(destBase, theme.platform, 'fonts');
  const defaultImagesDest = path.join(destBase, theme.platform, 'images');

  if (config('defaultTheme') === CONSTANTS.DEFAULT_THEME && themeName !== CONSTANTS.DEFAULT_PCSS_THEME) {
    const commonSrc = path.join(srcBase, CONSTANTS.COMMON_THEME_DIRECTORY);
    const commonDest = path.join(destBase, CONSTANTS.COMMON_THEME_DIRECTORY);
    fs.copySync(commonSrc, commonDest);
  }

  fs.copySync(defaultFontsSrc, defaultFontsDest);
  fs.copySync(defaultImagesSrc, defaultImagesDest);
}

function _copyComponentsToStaging(componentsSource) {
  return new Promise((resolve) => {
    if (util.isObjectEmpty(componentsSource)) {
      // No component source present, continue...
      resolve();
    } else {
      const componentDirectories = util.getDirectories(componentsSource.cwd);
      if (componentDirectories.length) {
        componentDirectories.forEach((component) => {
          const componentDirPath = path.resolve(CONSTANTS.JET_COMPONENTS_DIRECTORY, component);
          const componentJsonPath = path.join(
            componentDirPath, CONSTANTS.JET_COMPONENT_JSON);
          if (fs.existsSync(componentJsonPath)) {
            const componentJson = util.readJsonAndReturnObject(componentJsonPath);
            const destBase = path.join(config('paths').staging.stagingPath, config('paths').src.javascript, config('paths').composites);
            if (!util.hasProperty(componentJson, 'version')) {
              util.log.error(`Missing property 'version' in '${component}' component's/pack's definition file.`);
            }
            const destPath = path.join(destBase, component, componentJson.version);
            fs.copySync(componentDirPath, destPath);
            resolve();
          } else {
            // Folder is missing component.json, log warning and skip.
            util.log.warning(`Missing the definition file '${CONSTANTS.JET_COMPONENT_JSON}' for component / pack '${component}'.`);
            resolve();
          }
        });
      } else {
        // No components added from the Exchange, continue...
        resolve();
      }
    }
  }).catch(error => util.log.error(error));
}

function _copyFilesExcludeScss(srcBase, destBase) {
  try {
    fs.ensureDirSync(destBase);
    if (util.fsExistsSync(srcBase)) {
      const fileList = util.readDirSync(srcBase);
      fileList.forEach((file) => {
        const fileStat = fs.statSync(path.join(srcBase, file));
        // if file is not scss file, copy to themes
        if (fileStat.isDirectory() || !/scss/.test(path.extname(file))) {
          fs.copySync(path.join(srcBase, file), path.join(destBase, file));
        }
      });
    }
  } catch (err) {
    util.log.error(err);
  }
}

function _copySrcResourcesToThemes(theme) {
  const srcBase = `${config('paths').src.common}/${config('paths').src.themes}/${theme.name}`;
  const destBase = util.destPath(path.join(config('paths').staging.themes, theme.name));
  const srcCommon = path.join(srcBase, CONSTANTS.COMMON_THEME_DIRECTORY);
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
  const stgPath = opts.stagingPath;
  const theme = context.changedTheme || opts.theme;
  const livereload = opts.cssonly;
  // copy only the css file during serve livereload
  // copy the entire theme/platform folder during build
  const ext = util.getThemeCssExtention(buildType);
  const src = _getThemeSrcPath(theme, ext, livereload);
  const dest = _getThemeDestPath(theme, stgPath, ext, livereload, platform, opts.destination);
  const rwood = Object.assign({},
    { name: 'redwood', platform: 'web', compile: false, version: util.getJETVersion() });

  if (opts.theme.cssGeneratedType === 'add-on' || config('defaultTheme') === CONSTANTS.DEFAULT_PCSS_THEME) {
    const rwsrc = _getThemeSrcPath(rwood, ext, livereload);
    const rwdest = _getThemeDestPath(rwood, stgPath, ext, livereload, platform, opts.destination);
    fs.copySync(rwsrc, rwdest);
  }

  return new Promise((resolve, reject) => {
    // copy to themes
    if ((theme.name !== CONSTANTS.DEFAULT_THEME || theme.name !== CONSTANTS.DEFAULT_PCSS_THEME)
     && !livereload) {
      _copySrcResourcesToThemes(theme);
      if (opts.theme.cssGeneratedType === 'add-on' || config('defaultTheme') === CONSTANTS.DEFAULT_PCSS_THEME) {
        _copySrcResourcesToThemes(rwood);
      }
      if (!util.getInstalledCssPackage()) {
        // copy alta resources link imageDir, fontsDir, commonImageDir
        _copyDefaultResourcesToStaging(theme, stgPath, CONSTANTS.DEFAULT_THEME);
        if (config('defaultTheme') === CONSTANTS.DEFAULT_PCSS_THEME) {
          _copyDefaultResourcesToStaging(rwood, stgPath, CONSTANTS.DEFAULT_PCSS_THEME);
        }
      } else {
        // copy redwood resources link imageDir, fontsDir, commonImageDir
        _copyDefaultResourcesToStaging(theme, stgPath, CONSTANTS.DEFAULT_PCSS_THEME);
      }
    }
    _copyMultiThemesSrcResourcesToThemes(opts.themes);

    // copy to staging
    // copy theme/platform to staging
    fs.copySync(src, dest);

    // copy additional resources staged-themes/theme/common
    _copyThemeCommonToStaging(theme, stgPath)
      .then(_copyMultiThemesToStaging(opts, stgPath, livereload))
      .then(() => {
        resolve(context);
      })
      .catch(err => reject(err));
  });
}

// only runs when platform is windows, fixing locale Bug 26871715
function _renameNlsDirs() {
  const srcBase = `${config('paths').staging.stagingPath}/${config('paths').src.javascript}/libs/oj/v${util.getJETVersion()}/resources/nls`;
  const match = glob.sync('*', { cwd: srcBase, ignore: ['*.js', '*locale*'] });
  match.forEach((file) => {
    const src = path.join(srcBase, file);
    const dest = path.join(srcBase, `locale_${file}`);
    fs.copySync(src, dest, { overwrite: true });
    fs.removeSync(src);
  });
}


/**
 * ## _requireJsInvoker
 *
 * Invokes requirejs.optimize with context.opts.requireJs parameter.
 *
 * @private
 * @param {object} context build context
 * @returns {Promise} promise
 */
function _requireJsInvoker(context) {
  return new Promise((resolve, reject) => {
    requirejs.optimize(context.opts.requireJs, () => {
      util.log('Task requirejs finished.');
      resolve(context);
    }, (err) => {
      util.log(err);
      util.log.error(err);
      reject(err);
    });
  });
}

/**
 * ## _requireJsInvoker
 *
 * Invokes requirejs.optimize with context.opts.requireJsEs5 parameter.
 *
 * @private
 * @param {object} context build context
 * @returns {Promise} promise
 */
function _requireJsInvokerEs5(context) {
  return new Promise((resolve, reject) => {
    requirejs.optimize(context.opts.requireJsEs5, () => {
      util.log('Task requirejs ES5 finished.');
      context.opts.isRequireJsEs5 = false; // eslint-disable-line no-param-reassign
      resolve(context);
    }, (err) => {
      context.opts.isRequireJsEs5 = false; // eslint-disable-line no-param-reassign
      util.log(err);
      util.log.error(err);
      reject(err);
    });
  });
}


/**
 * ## _requireJsSetup
 *
 * Setups up context.opts for requireJs.
 *
 * @private
 * @param {object} context build context
 * @returns {Promise} promise
 */
function _requireJsSetup(context) {
  return new Promise((resolve, reject) => {
    try {
      // copy the paths mapping into requireJs.paths
      const pathsObj = pathGenerator.getPathsMapping(context, true, false);
      // assign paths obj. - making accessible to the before_optimize hook.
      context.opts.requireJs.paths = pathsObj; // eslint-disable-line no-param-reassign
      context.opts.isRequireJsEs5 = false; // eslint-disable-line no-param-reassign
      resolve(context);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * ## _requireJsSetupEs5
 *
 * Setups up context.opts for requireJsEs5.
 *
 * @private
 * @param {object} context build context
 * @returns {Promise} promise
 */
function _requireJsSetupEs5(context) {
  return new Promise((resolve, reject) => {
    try {
      // copy the paths mapping into requireJs.paths
      const pathsObj = pathGenerator.getPathsMapping(context, true, true);
      // assign paths obj. - making accessible to the before_optimize hook.
      context.opts.requireJsEs5.paths = pathsObj; // eslint-disable-line no-param-reassign
      context.opts.isRequireJsEs5 = true; // eslint-disable-line no-param-reassign
      resolve(context);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {

  minifyComponent: function _minifyComponent(context, componentJson, componentName) {
    return new Promise((resolve, reject) => {
      try {
        const { srcBase, destBase } = util.getComponentBasePaths({
          context,
          component: componentName,
          minify: true,
        });
        _minifyComponentInternal({ context, componentJson, componentName, srcBase, destBase })
          .then(() => {
            resolve(context);
          });
      } catch (error) {
        reject(error);
      }
    });
  },

  copySingleCca: function _copySingleCca(context, componentJson, componentName) {
    return new Promise((resolve, reject) => {
      try {
        copyLocalComponent({ context, componentName, componentJson })
          .then(() => {
            resolve(context);
          });
      } catch (error) {
        reject(error);
      }
    });
  },

  clean: function _clean(context) {
    util.log('Cleaning staging path.');
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
    util.log('Copy files to staging directory.');

    let srcFileList = context.opts.copySrcToStaging.fileList;

    // Filter out Exchange components object
    // There's no simple way to recognise those sources
    // after they are serialized to dest>src path below
    const componentsSource = srcFileList.filter((sourceObject) => { // eslint-disable-line
      return sourceObject.cwd === CONSTANTS.JET_COMPONENTS_DIRECTORY;
    });

    // Filter out non Exchange components sources
    if (componentsSource.length > 0) {
      srcFileList = srcFileList.filter((sourceObject) => { // eslint-disable-line
        return sourceObject.cwd !== CONSTANTS.JET_COMPONENTS_DIRECTORY;
      });
    }

    // Serialization to dest>src
    const fileResult = util.getFileList(context.buildType, srcFileList);

    return _copyFileToStaging(fileResult)
      .then(() => _copyComponentsToStaging(componentsSource[0]))
      .then(() => {
        util.log('Copy finished.');
        return context;
      });
  },

  copyLibs: function _copyLibsToStaging(context) {
    util.log('Copy library files to staging directory.');
    const opts = context.opts;
    const buildType = context.buildType;
    const platform = context.platform;
    const pathMappingLibs = util.getFileList(buildType,
      npmCopy.getMappingLibsList(buildType, platform));
    const nonMappingLibs = npmCopy.getNonMappingFileList(buildType, platform);
    const customLibs = util.getFileList(buildType, opts.copyCustomLibsToStaging.fileList);
    return _copyFileToStaging(nonMappingLibs.concat(pathMappingLibs, customLibs))
      .then(() => {
        util.log('Copy finished.');
        npmCopy.renameAltaThemeFiles(config('paths'));
        return context;
      });
  },

  injectPaths: function _injectMainPaths(context) {
    util.log('Running injection tasks.');
    return new Promise((resolve, reject) => {
      mainJsInjector.injectPaths(context)
        .then(() => {
          util.log('Task main.js paths injection finished.');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  injectPathsEs5: function _injectMainPathsEs5(context) {
    util.log('Running injection tasks for es5.');
    return new Promise((resolve, reject) => {
      mainJsInjector.injectPathsEs5(context)
        .then(() => {
          util.log('Task main.js paths injection finished.');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },


  injectLocalhostCspRule: function _injectLocalhostCspRule(context) {
    util.log('Running localhost csp rule injection task.');

    return new Promise((resolve, reject) => {
      indexHtmlInjector.injectLocalhostCspRule(context)
        .then(() => {
          util.log('Task index.html localhost csp rule injection finished.');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  injectCdnBundleScript: function _injectCdnBundleScript(context) {
    return new Promise((resolve, reject) => {
      indexHtmlInjector.injectCdnBundleScript(context)
        .then(() => {
          util.log('Task index.html cdn bundle injection finished.');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  injectTheme: function _injectTheme(context) {
    util.log('Running theme injection task.');

    return new Promise((resolve, reject) => {
      indexHtmlInjector.injectThemePath(context)
        .then(() => {
          util.log('Task index.html theme path injection finished.');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  copyThemes: function _copyThemes(context) {
    util.log('Running theme copy task.');
    return new Promise((resolve, reject) => {
      _copyThemesToStaging(context)
        .then(() => {
          util.log('Theme copy task finished.');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  terser: function _terser(context) {
    util.log('Running terser task.');
    const opts = context.opts;
    const buildType = context.buildType;
    const platform = context.platform;
    const terserConfig = opts.terser;
    const minify = opts.optimize !== 'none';
    return new Promise((resolve, reject) => {
      util.minifyFiles({
        files: util.getFileList(buildType, terserConfig.fileList, platform),
        options: terserConfig.options,
        generateSourceMaps: false,
        minify
      })
        .then(() => {
          util.log('Task terser finished.');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  requireJs: function _requireJs(context) {
    util.log('Running requirejs task.');
    const promiseFuncRJS = [
      () => _requireJsSetup(context),
      () => hookRunner('before_optimize', context),
      () => _requireJsInvoker(context)
    ];
    return util.runPromisesInSeries(promiseFuncRJS);
  },

  requireJsEs5: function _requireJsEs5(context) {
    util.log('Running requirejs task for ES5.');
    const promiseFuncRJSES5 = [
      () => _requireJsSetupEs5(context),
      () => hookRunner('before_optimize', context),
      () => _requireJsInvokerEs5(context)
    ];
    return util.runPromisesInSeries(promiseFuncRJSES5);
  },

  css: function _compileCss(context) {
    if ((context.opts.theme.compile === false && context.opts.sassCompile === false)
        || context.opts.nosass) {
      util.log('SCSS Compilation skipped...');
      return context;
    }

    if (util.getInstalledCssPackage()) {
      util.log('Compiling pcss...');
      return new Promise((resolve, reject) => {
        if (context.opts.pcssCompile === false && svg !== true) {
          util.log('pcss compile skipped.');
          resolve(context);
        } else {
          // require pcss here to avoid depency error if node-sass is not installed
          const pcss = require('./pcss'); // eslint-disable-line global-require
          const pcssPromise = pcss.getPromises(context);
          Promise.all(pcssPromise)
            .then(() => {
              util.log('pcss compile finished.');
              resolve(context);
            })
            .catch(err => reject(err));
        }
      });
    }

    if (!util.getInstalledCssPackage()) {
      util.log('Compiling sass...');
      return new Promise((resolve, reject) => {
        if (context.opts.sassCompile === false && svg !== true) {
          util.log('Sass compile skipped.');
          resolve(context);
        } else {
          // require sass here to avoid depency error if node-sass is not installed
          const sass = require('./sass'); // eslint-disable-line global-require
          const sassPromises = sass.getPromises(context);
          Promise.all(sassPromises)
            .then(() => {
              util.log('Sass compile finished.');
              resolve(context);
            })
            .catch(err => reject(err));
        }
      });
    }

    return true;
  },

  cleanTemp: function _cleanTemp(context) {
    util.log('Cleaning temporary files.');
    const opts = context.opts;

    const filePath = _getName(opts.stagingPath, opts.injectPaths.destMainJs);
    const filePathEs5 = _getName(opts.stagingPath, opts.injectPaths.destMainJsEs5);

    return new Promise((resolve, reject) => {
      fs.remove(filePath).then(() => {
        fs.remove(filePathEs5).then(() => {
          util.log('Task cleaning temporary files finished.');
          resolve(context);
        })
          .catch((err) => {
            if (err) reject(err);
          });
      });
    });
  },

  // Modify the standard es5-deciding main.js file for release builds (to choose the proper bundle)
  modifyMainJs: function _copyMainJs(context) {
    util.log('Modifying main.js');
    const dest = _getName(context.opts.stagingPath, 'main.js');
    let mainJs = util.readFileSync(dest);

    const injectConfig = context.opts.injectPaths;
    const startTag = injectConfig.startTag;
    const endTag = injectConfig.endTag;
    const pattern = injectorUtil.getInjectorTagsRegExp(startTag, endTag);
    const lineEnding = /\r\n/.test(String(mainJs)) ? '\r\n' : '\n';

    // actual injection
    const emptyPaths = '{}';
    mainJs = mainJs.replace(pattern, () =>
      startTag + lineEnding + emptyPaths + lineEnding + endTag
    );

    // Need to replace the require([]) line with just one that refers to bundles
    const requirePattern = /}\s*\(\s*\)\s*\)\s*;[^]*require\s*\(\s*\[[^]+\][^]+\)/gi;
    const newRequireCode = "var bundle = 'bundle' + (_ojNeedsES5 ? '_es5' : '');\nrequire([bundle], function () {});}());";
    mainJs = mainJs.replace(requirePattern, newRequireCode);

    return new Promise((resolve) => {
      fs.outputFileSync(dest, mainJs);
      util.log('Modify main.js finished');
      resolve(context);
    });
  },

  spriteSvg: function _spriteSvg(context) {
    util.log('Optimizing svg into SVG sprites.');
    return new Promise((resolve, reject) => {
      svg.spriteSvg(context, (err) => {
        if (err) reject(err);
      }).then(() => {
        util.log('Svg optimization task finished.');
        resolve(context);
      });
    });
  },

  fixWindowsLocale: function _fixWindowsLocale(context) {
    return new Promise((resolve) => {
      const platform = context.platform;
      if (platform === 'windows') {
        _renameNlsDirs();
      }
      resolve(context);
    });
  },

  copyLocalVComponents: function _copyLocalVComponents(context) {
    return new Promise((resolve) => {
      const promises = [];
      const vcomponents = util.getLocalVComponents();
      vcomponents.forEach((component) => {
        const componentJson = util.getComponentJson({ context, component });
        promises.push(copyLocalComponent({ context, componentName: component, componentJson }));
      });
      Promise.all(promises).then(() => {
        if (promises.length) {
          util.log('Copied local vcomponents');
        }
        resolve(context);
      });
    });
  },

  copyLocalCca: function _copyLocalCca(context) {
    return new Promise((resolve) => {
      util.log('Copy local web components');
      const promises = [];
      const componentJsonFilePaths = util.getLocalCompositeComponentJsonPaths({ context });
      componentJsonFilePaths.forEach((file) => {
        const componentJson = util.readJsonAndReturnObject(file);
        const componentName = componentJson.name;
        promises.push(copyLocalComponent({ context, componentName, componentJson }));
      });
      Promise.all(promises).then(() => {
        if (promises.length) {
          util.log('Copy local web components finished');
        } else {
          util.log('Copy local web components skipped');
        }
        resolve(context);
      });
    });
  },

  minifyLocalVComponents: function _minifyLocalVComponents(context) {
    return new Promise((resolve) => {
      const promises = [];
      util.getLocalVComponentsComponentJsonPaths({ context }).forEach((componentJsoPath) => {
        const componentJson = util.readJsonAndReturnObject(componentJsoPath);
        // BUG: having type set to composite skips minification
        delete componentJson.type;
        const component = componentJson.name;
        const { srcBase, destBase } = util.getComponentBasePaths({
          context,
          component,
          minify: true,
        });
        promises.push(() => _minifyComponentInternal({
          context,
          componentJson,
          componentName: component,
          srcBase,
          destBase
        }));
      });
      util.runPromisesInSeries(promises, context)
        .then((data) => {
          resolve(data);
        })
        .catch((err) => {
          console.log(err);
        });
    });
  },

  minifyLocalCca: function _minifyLocalCca(context) {
    return new Promise((resolve) => {
      const promises = [];
      const componentJsonFilePaths = util.getLocalCompositeComponentJsonPaths({
        context,
        built: true
      });
      componentJsonFilePaths.forEach((file) => {
        const componentJson = util.readJsonAndReturnObject(file);
        const component = componentJson.name;
        const { srcBase, destBase } = util.getComponentBasePaths({
          context,
          component,
          minify: true,
        });
        promises.push(() => _minifyComponentInternal({
          context,
          componentJson,
          componentName: component,
          srcBase,
          destBase
        }));
      });
      util.runPromisesInSeries(promises, context)
        .then((data) => {
          resolve(data);
        })
        .catch((err) => {
          console.log(err);
        });
    });
  },

  //
  // Copy the reference component from the npm path into the staging directory.
  //
  // For reference components, the preferred configuration will select the minified component.
  // (provided that it exists).
  // E.g., even if the --release flag is not present,
  // we still will use the minified component.
  //
  // jet_components/oj-ref-showdown/component.json
  // jet_components/oj-ref-showdown
  //
  // Example component.json:
  // {
  //   "name": "oj-ref-showdown",
  //   "type": "reference",
  //   "package":"showdown",
  //   "version": "1.9.0",
  //   "paths": {
  //     "npm": {
  //       "min": "dist/showdown.min",
  //       "debug": "dist/showdown"
  //      },
  //      "cdn": {
  //        "min": "https://static.oracle.com/cdn/jet/packs/3rdparty/showdown/1.9.0/showdown.min",
  //        "debug": "https://static.oracle.com/cdn/jet/packs/3rdparty/showdown/1.9.0/showdown.min"
  //       }
  //    }
  // }

  copyReferenceCca(context) {
    return new Promise((resolve) => {
      util.log('Copy reference components to staging directory.');
      const componentList = util.getDirectories(`./${CONSTANTS.JET_COMPONENTS_DIRECTORY}`);
      componentList.forEach((component) => {
        const componentDirPath = `./${CONSTANTS.JET_COMPONENTS_DIRECTORY}/${component}/${CONSTANTS.JET_COMPONENT_JSON}`;
        const componentJson = util.readJsonAndReturnObject(`${componentDirPath}`);
        if (componentJson.type === 'reference') {
          const npmPckgName = componentJson.package;
          const retObj = util.getNpmPckgInitFileRelativePath(componentJson, context.buildType);
          const npmPckgInitFileRelativePath = retObj.npmPckgInitFileRelativePath;

          //
          // Select the the minimized path (if defined).
          // Otherwise select the debug path.
          // Example path from component.json:
          //
          //  "paths": {
          //    "npm": {
          //      "min": "dist/showdown.min",
          //      "debug": "dist/showdown"
          //     }
          //   }
          //

          // Copy is only necessary for npm paths.
          // (no copy is necessary for cdn paths).
          if (npmPckgInitFileRelativePath !== undefined && retObj.npm) {
            // Extract out the filename portion of the path.
            const npmPckgInitFileNameArray = npmPckgInitFileRelativePath.split('/');
            const npmPckgInitFileName = npmPckgInitFileNameArray[npmPckgInitFileNameArray.length - 1]; // eslint-disable-line max-len
            const npmPckgSrcPath = `./${CONSTANTS.NODE_MODULES_DIRECTORY}/${npmPckgName}/${npmPckgInitFileRelativePath}`; // eslint-disable-line max-len
            //
            // Construct the npm path (node_modules) to the component file.
            // E.g:
            //   ./node_modules/showdown/dist/showdown
            // Then copy this file to
            //   /web/js/libs/showdown/showdown.js
            //
            // Note - the component.json npm path does not necessarily have the .js extension,
            // so we handle this if necessary.
            //

            const destBasePath = path.join(config('paths').staging.stagingPath, config('paths').src.javascript, 'libs');
            //
            // If npmPckgSrcPath is a directory (containing multiple files),
            // then we need to copy the entire directory.
            //
            const destNpmpckgDirPath = `${destBasePath}/${npmPckgName}/${npmPckgInitFileName}`;

            if (util.fsExistsSync(npmPckgSrcPath)) {
              fs.copySync(npmPckgSrcPath, destNpmpckgDirPath);
            } else if (util.fsExistsSync(npmPckgSrcPath.concat('.js'))) {
              fs.copySync(npmPckgSrcPath.concat('.js'), destNpmpckgDirPath.concat('.js'));
            }
          }
        }
      });
      util.log('Copy finished.');
      resolve(context);
    });
  },


  //
  // For all components, run the component hooks.
  // Since there could be several components in the build,
  // Serialize the call to each hook with a utility function
  // (runPromisesIterator)
  //
  runAllComponentHooks: function _runAllComponentHooks(context) {
    return new Promise((resolve, reject) => {
      util.log('runAllComponentHooks ');
      // strip down the context parameter.
      const newContext = util.processContextForHooks(context);
      const components = [
        // get regular component's component.json from the staging directory
        ...util.getLocalCompositeComponentJsonPaths({ context, built: true }),
        // get vcomponent's component.json from staging since they are generated
        // during the build process
        ...util.getLocalVComponentsComponentJsonPaths({ context })
      ];

      if (components.length === 0) {
        resolve(context);
      } else {
        util.runPromiseIterator(components, (componentPath) => { // eslint-disable-line arrow-body-style, max-len
          return new Promise((resolve2, reject2) => {
            util.log(`runAllComponentHooks for component: ${JSON.stringify(componentPath)}`);
            const componentJson = util.readJsonAndReturnObject(componentPath);
            if (componentJson) {
              newContext.componentConfig = componentJson;
              hookRunner('after_component_build', newContext)
                .then((data) => {
                  util.log(`runAllComponentHooks for component: ${JSON.stringify(componentPath)} finished`);
                  resolve2(data);
                })
                .catch((err) => {
                  util.log(err);
                  util.log.error(err);
                  reject2(err);
                });
            }
          });
        }).then((data) => {
          resolve(data);
        }).catch((err) => {
          util.log(err);
          util.log.error(err);
          reject(err);
        });
      } // else components.length === 0
    });
  },

  compileApplicationTypescript,
  compileComponentTypescript,
  cleanTypescript
};
