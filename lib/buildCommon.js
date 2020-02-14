/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const fs = require('fs-extra');
const TerserJS = require('terser');
const glob = require('glob');

const path = require('path');
const requirejs = require('requirejs');
const util = require('./util');
const config = require('./config');

const npmCopy = require('./npmCopy');
const mainJsInjector = require('./mainJsInjector');
const indexHtmlInjector = require('./indexHtmlInjector');
const svg = require('./svg');
const CONSTANTS = require('./constants');
const hookRunner = require('./hookRunner');
const pathGenerator = require('./rjsConfigGenerator');

const childProcess = require('child_process');

const componentNames = new Set();

function _getUglyCode(file, terserOptions) {
  const code = fs.readFileSync(file, 'utf-8');
  return TerserJS.minify(code, terserOptions);
}

/**
 * ## _getSourceMapOptions
 *
 * Create source map options for file
 *
 * @private
 * @param {string} filePath path to file for which
 * sourceMap will be generated
 */
function _getSourceMapOptions(filePath) {
  const filename = path.parse(filePath).base;
  return {
    filename,
    url: `${filename}.map`
  };
}

/**
 * ## _writeUglyCodeToFile
 *
 * Minifies an array of files using the
 * minification options provided
 *
 * @private
 * @param {Array} fileList list of files to minify
 * @param {Object} terserOptions options to pass to minifier (terser)
 * @param {boolean} generateSourceMaps determine whether to generate
 * source maps for the minified files
 */
function _writeUglyCodeToFile(fileList, terserOptions, generateSourceMaps) {
  return new Promise((resolve, reject) => {
    try {
      fileList.forEach((file) => {
        const destDir = file.dest;
        const data = _getUglyCode(file.src, {
          ...terserOptions,
          sourceMap: generateSourceMaps ? _getSourceMapOptions(file.src) : false
        });
        if (data.error) throw data.error;
        fs.outputFileSync(util.destPath(destDir), data.code);
        if (data.map) fs.outputFileSync(util.destPath(`${destDir}.map`), data.map);
      });
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

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

  const commonSrc = path.join(srcBase, CONSTANTS.COMMON_THEME_DIRECTORY);
  const defaultFontsSrc = path.join(srcBase, theme.platform, 'fonts');
  const defaultImagesSrc = path.join(srcBase, theme.platform, 'images');

  const commonDest = path.join(destBase, CONSTANTS.COMMON_THEME_DIRECTORY);
  const defaultFontsDest = path.join(destBase, theme.platform, 'fonts');
  const defaultImagesDest = path.join(destBase, theme.platform, 'images');

  fs.copySync(commonSrc, commonDest);
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
    util.log(err);
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

  if (config('defaultTheme') === CONSTANTS.DEFAULT_PCSS_THEME) {
    const rwsrc = _getThemeSrcPath(rwood, ext, livereload);
    const rwdest = _getThemeDestPath(rwood, stgPath, ext, livereload, platform, opts.destination);
    fs.copySync(rwsrc, rwdest);
  }

  return new Promise((resolve, reject) => {
    // copy to themes
    if ((theme.name !== CONSTANTS.DEFAULT_THEME || theme.name !== CONSTANTS.DEFAULT_PCSS_THEME)
     && !livereload) {
      _copySrcResourcesToThemes(theme);
      if (config('defaultTheme') === CONSTANTS.DEFAULT_PCSS_THEME) {
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

//
// Stage the component for both debug and min
// For componentName "my-chart", parameters would be set to:
//   srcPath: src/js/jet-composites/my-chart
//   dstPath: web/js/jet-composites/my-chart/1.0.0
function _stageComponent(context, srcPath, destPath) {
  return new Promise((resolve, reject) => {
    try {
      fs.removeSync(destPath);
      fs.copySync(srcPath, destPath);
      if (context.opts.buildType === 'release' || context.componentConfig) {
        fs.removeSync(path.join(destPath, 'min'));
        fs.mkdirSync(path.join(destPath, 'min'));
        // Copy the resource directory into min/
        const srcPathResources = path.join(srcPath, 'resources');
        if (util.fsExistsSync(srcPathResources)) {
          fs.copySync(srcPathResources, path.join(destPath, 'min', 'resources'));
        }
      }
      resolve(context);
    } catch (error) {
      reject(error);
    }
  });
}

// Stage a pack component.
function _stagePackComponent(context, type, srcPath, destPath, destPathRelease) {
  return new Promise((resolve, reject) => {
    try {
      fs.removeSync(destPath);
      fs.copySync(srcPath, destPath);
      // copy all .js files into min dir for a resource componet.
      const glob = require('glob'); // eslint-disable-line
      if (type === 'resource') {
        // For a resource component, copy all files, except for any under extension/.
        // We assume that files under extension/ are design time
        // and are not needed in the runtime distribution.
        const resourceFiles = glob.sync('**/*', { cwd: srcPath, ignore: ['extension/**/*', 'extension'] });
        resourceFiles.forEach((componentPath) => {
          fs.copySync(path.join(srcPath, componentPath), path.join(destPath, componentPath));
          if (context.opts.buildType === 'release' || context.componentConfig) {
            fs.copySync(path.join(srcPath, componentPath),
                        path.join(destPathRelease, componentPath));
          }
        });
      } else if (context.opts.buildType === 'release' || context.componentConfig) {
        // For a 'non-resource component' in release build,
        // copy all top-level css files to the /min dir.
        const cssFiles = glob.sync('*.css', { cwd: srcPath });
        cssFiles.forEach((componentPath) => {
          fs.copySync(path.join(srcPath, componentPath), path.join(destPathRelease, componentPath));
        });
        // Copy the resource directory into min/
        const srcPathResources = path.join(srcPath, 'resources');
        if (util.fsExistsSync(srcPathResources)) {
          fs.copySync(srcPathResources, path.join(destPathRelease, 'resources'));
        }
      }
      resolve(context);
    } catch (error) {
      reject(error);
    }
  });
}

// Optimize the component (using the requireJS optimizer)
function _rjsOptimizeComponent(context, singleton, masterPathObj, baseUrl, name, out, packName, packPath, extraExcludes, extraEmpties) { // eslint-disable-line max-len
  util.log(`Running component requirejs task, pack: ${packName} name: ${name}`);
  const rConfig = {
    baseUrl,
    name,
    out,
    optimize: context.opts.requireJsComponent.optimize,
    buildCSS: context.opts.requireJsComponent.buildCSS,
    separateCSS: context.opts.requireJsComponent.separateCSS,
    generateSourceMaps: context.opts.requireJsComponent.generateSourceMaps
  };

  // Note - getMasterPathsMapping returns the paths with the prepended ../../..
  // Specific libraries need to be defined and excluded in the rjsConfig.
  // The remainder of the paths are set to empty.
  const excludePaths = ['css', 'ojL10n', 'text', 'normalize', 'css-builder'];
  Object.keys(masterPathObj).forEach((lib) => {
    if (!excludePaths.includes(lib)) {
      masterPathObj[lib] = 'empty:'; // eslint-disable-line no-param-reassign
    }
  });

  rConfig.paths = masterPathObj;

  // Construct the exclude path.
  const exclude = [];
  Object.keys(masterPathObj).forEach((lib) => {
    // Exclude any path assigned to empty
    if (masterPathObj[lib] !== 'empty:') {
      exclude.push(lib);
    }
  });
  rConfig.exclude = exclude;

  if (extraExcludes) {
    extraExcludes.forEach((ex) => {
      rConfig.paths[ex.name] = ex.path;
      rConfig.exclude.push(ex.name);
    });
  }

  // The extraEmpties parameter is used to exclude resource
  // members in the minification of a pack.
  // For example:
  //   rConfig.paths['oj-jspack/resourcemember'] = "empty:";
  if (extraEmpties) {
    extraEmpties.forEach((ex) => {
      rConfig.paths[ex] = 'empty:';
    });
  }

  // If we are dealing with a defined pack - set up the path
  if (packName && packPath) {
    rConfig.paths[packName] = packPath;
  }

  context.opts.componentRequireJs = rConfig; // eslint-disable-line no-param-reassign
  return new Promise((resolve, reject) => {
    try {
      hookRunner('before_component_optimize', context)
        .then(requirejs.optimize(
          context.opts.componentRequireJs,
          () => {
            // Minify component with terser unless user has
            // turned off optimize with the --optimize=none flag
            if (context.opts.optimize === 'none') {
              resolve(context);
            } else {
              // fs.readFileSync(out);
              _writeUglyCodeToFile(
                [{ dest: out, src: out }],
                context.opts.terser.options
              ).then(() => {
                resolve(context);
              }).catch((minifyError) => {
                util.log.error(minifyError);
              });
            }
          },
          (err) => {
            util.log(err);
            reject(err);
          }));
    } catch (error) {
      reject(error);
    }
  });
}

function _isTypeCompositeOrResource(componentJson) {
  if (!util.hasProperty(componentJson, 'type')) return true;
  if (util.hasProperty(componentJson, 'type') &&
      ((componentJson.type === 'resource') || componentJson.type === 'composite')) return true;
  return false;
}

//
// Get the resource dependencies for a component.
// These are subsequently used in the RJS path config.
//
// A resource dependency may 'pack' or 'non'pack'.
//
// Example 1 : 'non-pack' dependency:
//
//   "dependencies": { "oj-common-resources": "1.0.0" }
// Here, we expect to see
//    'oj-common/resources': 'empty'
// in the RJS path.
//
// Path substitution: Note that we replace the '-resources' with a path
// since 'oj-common' will not necessarily be in the rjs path config.
// Also note that the componentNames set data structure is used
// to look up any component prefixes that may require path substitution.
//
// Example 2 : 'pack' dependency:
//
// A pack will list its dependencies as follows:
// {
//   "name": "oj-jspack-packmember",
//   "pack": "oj-jspack",
//    ...
//   "dependencies": {
//     "oj-jspack-resourcemember": "1.0.0"
//   }
// }
//
// And the following transformation would
// For example:
//   oj-jspack-resourcemember -> oj-jspack/resourcemember
//
function _getResourceDependencies(packName, subComponentJson) {
  // Figure out what resources we are dependent on.
  const allResourceEmpty = new Set();
  if (!subComponentJson.dependencies) return allResourceEmpty;
  Object.keys(subComponentJson.dependencies).forEach((el) => {
    const packNameIndex = el.indexOf(packName);
    if (packNameIndex === -1) {
      // Handle the case where the dependency is on a 'non-pack' component
      // (As in Example 1)
      let matchedPrefix = false;
      const componentNamesArray = Array.from(componentNames);
      componentNamesArray.some((item) => {
        if (el.indexOf(item) === 0 && el.length > item.length) {
          // We found a match at the beginning of the string.
          // For example, for 'oj-common-resources', we transform to 'oj-common/resources'
          // given a component named 'oj-common'
          const emptyDep = `${item}/${el.substring(item.length + 1)}`;
          allResourceEmpty.add(emptyDep);
          matchedPrefix = true;
          return true;
        }
        return false;
      });
      if (!matchedPrefix) {
        allResourceEmpty.add(el);
      }
    } else {
      // Handle case where the dependency is part of the pack (Example 2)
      const resourceDependencyIndex = el.indexOf(packName) + packName.length + 1;
      const emptyDep = `${packName}/${el.substring(resourceDependencyIndex)}`;
      allResourceEmpty.add(emptyDep);
    }
  });
  return allResourceEmpty;
}

// Minfy a singleton or a pack component.
// Note that we may need to call requireJs on several components in the pack case
// so we resolve the return only after ALL the requireJs calls.
function _minifyComponentInternal(context, componentJson, componentName, srcBase, destBase) {
  return new Promise((resolve, reject) => {
    try {
      const promises = [];
      if (!util.hasProperty(componentJson, 'version')) {
        util.log.error(`Missing property 'version' in '${componentName}' component's/pack's definition file.`);
      }
      const destPath = path.join(destBase, componentName, componentJson.version, 'min');
      if (util.hasProperty(componentJson, 'type')) {
        const packComponentVersion = componentJson.version;
        switch (componentJson.type) {
          case 'pack': {
            // Read the "dependencies" from component.json, creating each one.
            let packName = '';
            if (util.hasProperty(componentJson, 'name')) {
              packName = componentJson.name;
            } else {
              util.log.error('Missing name property for pack.');
            }
            if (util.hasProperty(componentJson, 'dependencies')) {
              // Copy the components listed in each dependency.
              Object.keys(componentJson.dependencies).forEach((el) => {
                if (el.startsWith(packName)) {
                  const packComponentName = el.substring(packName.length + 1);
                  const srcPathPack = path.join(srcBase, packName, packComponentVersion, packComponentName); // eslint-disable-line max-len
                  const destPathPackRelease = path.join(destBase, packName, packComponentVersion, 'min', packComponentName); // eslint-disable-line max-len
                  const baseUrl = path.join(destBase, packName, packComponentVersion, 'min');
                  const subComponentJson = util.readJsonAndReturnObject(path.join(srcPathPack, 'component.json'));

                  if (util.hasProperty(componentJson, 'type')) {
                    // Can't have a pack within a pack.
                    switch (subComponentJson.type) {
                      case 'resource': {
                        //
                        // Handle resource components.
                        // Resource components may have public modules.
                        // "type:" "resouce",
                        // "publicModules":[
                        //   "sharedCode/someFunctions"
                        // ]
                        // We minify each public module.
                        if (subComponentJson.publicModules) {
                          subComponentJson.publicModules.forEach((moduleName) => {
                            // When there are multiple public modules,
                            // we exclude all other public modules from the built public module.
                            const excludes = [];
                            subComponentJson.publicModules.forEach((otherModule) => {
                              if (otherModule !== moduleName) {
                                const ex = {};
                                ex.path = `${packComponentName}/${otherModule}`;
                                ex.name = packComponentName + otherModule;
                                ex.name = ex.name.replace('/', '');
                                excludes.push(ex);
                              }
                            });
                            const name = `${packName}/${packComponentName}/${moduleName}`;
                            const out = `${path.join(destPathPackRelease, moduleName)}.js`;

                            promises.push(() =>
                              _rjsOptimizeComponent(context, false, pathGenerator.getMasterPathsMapping(context), baseUrl, name, out, packName, '.', excludes)); // eslint-disable-line max-len
                          });
                        }
                        break;
                      }
                      default:
                        break;
                    }
                  }
                } else {
                  // Flag an error if component is NOT prefixed with pack name.
                  util.log.error(`Missing pack name for component ${el}`);
                }
              });

              Object.keys(componentJson.dependencies).forEach((el) => {
                if (el.startsWith(packName)) {
                  const packComponentName = el.substring(packName.length + 1);
                  const srcPathPack = path.join(srcBase, packName, packComponentVersion, packComponentName); // eslint-disable-line max-len
                  const destPathPackRelease = path.join(destBase, packName, packComponentVersion, 'min', packComponentName); // eslint-disable-line max-len
                  const baseUrlNoMin = path.join(destBase, packName, packComponentVersion);
                  const baseUrl = path.join(destBase, packName, packComponentVersion, 'min');
                  const subComponentJson = util.readJsonAndReturnObject(path.join(srcPathPack, 'component.json'));

                  if (util.hasProperty(componentJson, 'type')) {
                    // Can't have a pack within a pack.
                    switch (subComponentJson.type) {
                      case 'resource': {
                        break;
                      }
                      case 'composite': {
                        // For component "component-d" of pack "demo-bundled"
                        // the name would be: "demo-bundled/component-d/loader"
                        const name = `${packName}/${packComponentName}/loader`;
                        // and the out file would be:
                        // "web/js/jet-composites/demo-bundled/1.0.0/component-d/min/loader.js";
                        // const out = path.join(destPathPack, 'min', 'loader.js');
                        const out = path.join(destPathPackRelease, 'loader.js');
                        const emptyResources = _getResourceDependencies(packName, subComponentJson);
                        promises.push(() =>
                          _rjsOptimizeComponent(context, false, pathGenerator.getMasterPathsMapping(context), baseUrl, name, out, packName, '.', null, emptyResources)); // eslint-disable-line max-len
                        break;
                      }
                      default: {
                        const name = `${packName}/${packComponentName}/loader`;
                        const out = path.join(destPathPackRelease, 'loader.js');
                        const emptyResources = _getResourceDependencies(packName, subComponentJson);

                        promises.push(() =>
                          _rjsOptimizeComponent(context, true, pathGenerator.getMasterPathsMappingSingleton(context), baseUrlNoMin, name, out, packName, '.', null, emptyResources)); // eslint-disable-line max-len
                        break;
                      }
                    }
                  }
                } else {
                  // Flag an error if component is NOT prefixed with pack name ?
                  util.log.error(`Missing pack name for component ${el}`);
                }
              });
            }
            if (componentJson.bundles) {
              //
              // For bundles, we create a new .js file in the web/ folder.
              // The new js file has the loader listed in the array for the packName/bundleName.
              // This .js file is minified 'in-place'.
              //
              // For example, if the component.json has the following bundle:
              //
              // "bundles":{
              //   "demo-bundled/bundle-1":[
              //     "demo-bundled/component-a/loader",
              //     "demo-bundled/component-b/loader"
              //   ],
              // }
              //
              // Then we write bundle-1.js with contents:
              // bundle-1.js:
              // ```define(["demo-bundled/component-a/loader",
              //            "demo-bundled/component-b/loader"], function(){});```
              //
              Object.keys(componentJson.bundles).forEach((bundleKey) => {
                const bundleComponentName = bundleKey.substring(packName.length + 1);
                const bundleContents = `define(["${componentJson.bundles[bundleKey].join('","')}"], function(){});`;
                const seedBundle = `${path.join(destPath, bundleComponentName)}.js`;
                fs.writeFileSync(seedBundle, bundleContents);
                const baseUrl = path.join(destBase, packName, componentJson.version, 'min');
                promises.push(() => _rjsOptimizeComponent(context, false, pathGenerator.getMasterPathsMapping(context), baseUrl, bundleComponentName, seedBundle, packName, '.'));  // eslint-disable-line max-len
              });
            }
            break;
          }
          case 'resource':
            break;
          case 'composite':
            break;
          default:
            break;
        }
      } else {
        const destPathSingleton = path.join(destBase, componentName, componentJson.version);
        // The default component type is 'composite'
        const name = `${componentName}/loader`;
        // Example for component 'demo-singleton':
        // "out": web/js/jet-composites/demo-singleton/1.0.0/min/loader.js
        const out = path.join(destPathSingleton, 'min', 'loader.js');
        // Code path for a singleton component.
        // (when no componentJson.type property exists).
        promises.push(() => _rjsOptimizeComponent(context, true, pathGenerator.getMasterPathsMappingSingleton(context), destPathSingleton, name, out, componentName, '.'));  // eslint-disable-line max-len
      }

      util.runPromisesInSeries(promises, context)
        .then((data) => {
          resolve(data);
        })
        .catch((err) => {
          console.log(err);
        });
    } catch (error) {
      reject(error);
    }
  });
}

function _copySingleCcaInternal(context, componentJson, componentName, srcBase, destBase) {
  return new Promise((resolve, reject) => {
    try {
      const promises = [];
      let srcPath = path.join(srcBase, componentName);
      let destPath = path.join(destBase, componentName, componentJson.version);
      // Handle pack components
      if (util.hasProperty(componentJson, 'type') && componentJson.type === 'pack') {
        // copy the top-level files of the pack.
        // For example, for demo-bundled,  we copy all files in the top level
        //  from: src/js/jet-composites/demo-bundled/
        //  to:  web/js/jet-composites/demo-bundled/1.0.0/
        const fileResult = util.getFiles(srcPath);
        fileResult.forEach((element) => {
          fileResult.src = path.join(srcPath, element);
          fileResult.dest = path.join(destPath, element);
          fs.copySync(fileResult.src, fileResult.dest);
        });

        // Read the "dependencies" from component.json, creating each one.
        let packName = '';
        if (util.hasProperty(componentJson, 'name')) {
          packName = componentJson.name;
        } else {
          util.log.error(`Missing pack name for component ${componentName}`);
        }
        // Traverse all dependencies, copying the components to the staging dir.
        if (util.hasProperty(componentJson, 'dependencies')) {
          if (context.opts.buildType === 'release' || context.componentConfig) {
            util.ensureDir(path.join(destPath, 'min'));
            // Create the min dir for the pack: web/js/jet-composites/demo-bundled/1.0.0/min
            // Conditions: create the min dir for a release build
            //  or any component build (context.componentConfig).
          }
          Object.keys(componentJson.dependencies).forEach((el) => {
            if (el.startsWith(packName)) {
              const packComponentName = el.substring(packName.length + 1);
              const packComponentVersion = componentJson.version;
              srcPath = path.join(srcBase, packName, packComponentName);
              destPath = path.join(destBase, packName, packComponentVersion, packComponentName);
              const destPathRelease = path.join(destBase, packName, packComponentVersion, 'min', packComponentName);
              const subComponentJson = util.readJsonAndReturnObject(path.join(srcPath, 'component.json'));
              // Note - a pack cannot have a pack dependency.
              if (_isTypeCompositeOrResource(subComponentJson)) {
                promises.push(
                  _stagePackComponent(context, subComponentJson.type,
                                      srcPath, destPath, destPathRelease));
              }
            } else {
              // Flag an error if component is NOT prefixed with pack name
              util.log.error(`Missing pack name for component ${el}`);
            }
          });
        }
      } else {
        // Covers the case for composite or resource type components.
        promises.push(_stageComponent(context, srcPath, destPath));
      }
      Promise.all(promises).then(() => {
        resolve(context);
      }).catch(err => reject(err));
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * ## _runTypescriptCompilationInternal
 *
 * Compiles the application's Typescript to Javascript
 *
 * @private
 * @param {Object} context - build context
 */
function _runTypescriptCompilationInternal(context) {
  return new Promise((resolve) => {
    const tsconfigJson = fs.readJSONSync(CONSTANTS.TSCONFIG);
    const pathToStaging = path.join(context.opts.stagingPath);
    const pathToCommon = path.join('.');
    const typescriptOptions = context.opts.typescript;
    const typescriptOptionsTsconfig = typescriptOptions.tsconfigJson;
    let beforeTypescriptHook;
    // setup tsconfig.json
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.include = typescriptOptionsTsconfig.include;
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.baseUrl = path.relative(pathToStaging, pathToCommon);
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.sourceMap = context.buildType === 'dev';
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.paths = {
      ...tsconfigJson.compilerOptions.paths,
      ...typescriptOptionsTsconfig.compilerOptions.paths
    };
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.rootDir = typescriptOptionsTsconfig.compilerOptions.rootDir;
    if (typescriptOptions.component) {
      beforeTypescriptHook = 'before_component_typescript';
      tsconfigJson.compilerOptions.outDir = typescriptOptionsTsconfig.compilerOptions.outDir;
    } else {
      beforeTypescriptHook = 'before_app_typescript';
      if (context.buildType === 'dev') {
        // eslint-disable-next-line no-param-reassign
        tsconfigJson.compilerOptions.outDir = typescriptOptionsTsconfig.compilerOptions.outDir;
      }
    }
    // add requirejs-plugins.d.ts to tsconfig include
    tsconfigJson.include.push(path.join(
      tsconfigJson.compilerOptions.baseUrl,
      CONSTANTS.PATH_TO_REQUIREJS_PLUGIN_DEFINITIONS
    ));
    // setup typescript options for hook
    // eslint-disable-next-line no-param-reassign
    context.opts.typescript = { tsconfigJson };
    hookRunner(beforeTypescriptHook, context).then(() => {
      const tsconfigStagingPath = path.join(context.opts.stagingPath, CONSTANTS.TSCONFIG);
      const localTypescriptPath = path.join('node_modules', 'typescript', 'bin', 'tsc');
      let compilerArguments = ['--project', tsconfigStagingPath];
      fs.writeJsonSync(tsconfigStagingPath, tsconfigJson, { spaces: 2 });
      Promise.all([
        util.validGlobalTypescriptAvailable(),
        fs.pathExists(localTypescriptPath).then(pathExists => pathExists)
      ]).then(([validGlobalTypescriptAvailable, localTypescriptAvailable]) => {
        let compiledMessage;
        if (validGlobalTypescriptAvailable) {
          compilerArguments = [
            'tsc',
            ...compilerArguments
          ];
          compiledMessage = 'Compiled using global typescript';
        } else if (localTypescriptAvailable) {
          compilerArguments = [
            'node',
            localTypescriptPath,
            ...compilerArguments
          ];
          compiledMessage = 'Compiled using local typescript';
        } else {
          util.log.error('Please run \'ojet add typescript\' to add typescript support to your application');
        }
        childProcess.exec(compilerArguments.join(' '), (execError, stdout, stderr) => {
          if (execError) {
            util.log(`\x1b[31m${execError.toString().trim()}\x1b[0m`);
            if (stdout && stdout.length) {
              if (/No inputs were found/.test(stdout.toString())) {
                util.log('\x1b[31mNo *.ts or *.tsx files found\x1b[0m');
              } else {
                util.log(`\x1b[31m${stdout.toString().trim()}\x1b[0m`);
              }
            }
            if (stderr && stderr.length) {
              util.log(`\x1b[31m${stderr.toString().trim()}\x1b[0m`);
            }
            if (!context.serving) {
              process.exit(1);
            }
          }
          fs.removeSync(tsconfigStagingPath);
          util.log(compiledMessage);
          resolve(context);
        });
      });
    });
  });
}

/**
 * ## _compileComponentTypescriptInternal
 *
 * Compiles component's Typescript to
 * Javascript and copies over none *.ts
 * files
 * @private
 * @param {Object} options.context - build context
 * @param {string} options.component - component name
 * @param {string} options.version - component version
 * @returns {Promise} promise that resolves with build
 * context ojbect
 */
function _compileComponentTypescriptInternal({
  context,
  component,
  version
}) {
  util.log(`Compile ${component} typescript`);
  const componentTypescriptPath = path.join(
    config('paths').src.typescript,
    config('paths').composites,
    component,
    version
  );
  const componentJavascriptPath = path.join(
    config('paths').src.javascript,
    config('paths').composites,
    component,
    version
  );
  // add component typescript options to build context options
  // eslint-disable-next-line no-param-reassign
  context.opts.typescript = {
    tsconfigJson: {
      include: [
        path.join(componentTypescriptPath, '**/*'),
      ],
      compilerOptions: {
        paths: util.getJetPackPathMappingForTypescript({ component }),
        rootDir: componentTypescriptPath,
        outDir: componentJavascriptPath
      }
    },
    component: true
  };
  const promiseFunctions = [
    // compile component typescript
    () => _runTypescriptCompilationInternal(context),
    // copy none *.ts, *.tsx & *.scss resources to /js
    () => _copyTypescriptComponentFilesToJSFolder({
      context,
      component,
      version
    }),
    // run after_component_typescript hook
    () => hookRunner('after_component_typescript', context),
    // resolve with context
    () => {
      util.log(`Compile ${component} typescript finished`);
      return Promise.resolve(context);
    }
  ];
  return util.runPromisesInSeries(promiseFunctions);
}

/**
 * ## _copyTypescriptComponentFilesToJSFolder
 *
 * Copies compiled components non-TS files
 * to js/jet-composities folder. Transpiled JS files
 * are copied during compilation
 *
 * @private
 * @param {object} options.context build context
 * @param {string} options.component component name
 * @param {string} options.version component version
 * @returns {Promise} promise that resolves with undefined
 */
function _copyTypescriptComponentFilesToJSFolder({ context, component, version }) {
  return new Promise((resolve) => {
    util.log(`Copy ${component} none *.ts, *.tsx & *.scss files to /js`);
    const componentSrc = path.join(
      context.opts.stagingPath,
      config('paths').src.typescript,
      config('paths').composites,
      component,
      version
    );
    const componentDest = path.join(
      context.opts.stagingPath,
      config('paths').src.javascript,
      config('paths').composites,
      component,
      version
    );
    const files = glob.sync('**/*', {
      cwd: componentSrc,
      nodir: true,
      ignore: ['**/*.ts', '**/*.tsx', '**/*.scss']
    });
    files.forEach((file) => {
      fs.copySync(
        path.join(componentSrc, file),
        path.join(componentDest, file)
      );
    });
    if (files.length) {
      util.log(`Copy ${component} none *.ts, *.tsx, *.scss files to /js finished`);
    } else {
      util.log(`Copy ${component} none *.ts, *.tsx, *.scss files to /js skipped`);
    }
    resolve(context);
  });
}

/**
 * ## _copyTypescriptApplicationFilesToJSFolder
 *
 * Copies compiled application's non-TS files
 * to js/. We make sure to ignore jet-composites as that
 * is handled as part of a seperate task. Transpiled JS files
 * are copied during compilation
 *
 * @private
 * @param {object} options.context build context
 * @returns {Promise} promise that resolves with undefined
 */
function _copyTypescriptApplicationFilesToJSFolder({ context }) {
  return new Promise((resolve) => {
    util.log('Copy application none *.ts, *.tsx & *.scss files to /js');
    const applicationSrc = path.join(
      context.opts.stagingPath,
      config('paths').src.typescript
    );
    const applicationDest = path.join(
      context.opts.stagingPath,
      config('paths').src.javascript
    );
    const files = glob.sync('**/*', {
      cwd: applicationSrc,
      nodir: true,
      ignore: ['**/*.ts', '**/*.tsx', '**/*.scss']
    });
    files.forEach((file) => {
      fs.copySync(
        path.join(applicationSrc, file),
        path.join(applicationDest, file)
      );
    });
    if (files.length) {
      util.log('Copy application none *.ts, *.tsx & *.scss files to /js finished');
    } else {
      util.log('Copy application none *.ts, *.tsx & *.scss files to /js skipped');
    }
    resolve(context);
  });
}

/**
 * ## _compileComponentTypescript
 *
 * Compiles a web components Typescript to Javascript
 *
 * @private
 * @param {Object} options.context build context
 * @param {string} options.component component name
 * @param {string} options.version version
 * @returns {Promise} promise that resolves with build
 * context object
 */
function _compileComponentTypescript({
  context,
  component,
  version
}) {
  if (util.shouldNotRunTypescriptTasks(context) || !util.isTypescriptComponent({ component })) {
    return Promise.resolve(context);
  }
  return _compileComponentTypescriptInternal({
    context,
    component,
    version
  }).then(() => context);
}

/**
 * ## _getComponentBasePaths
 *
 * Returns a component's source and destination
 * base paths. It is primarily used by copy and minify tasks.
 * When copying, our source should always be src.common. When
 * minifying, our source shouuld always be staging.stagingPath
 *
 * @private
 * @param {object} context build context
 * @param {string} component component name
 * @param {boolean} minify whether base paths are for minify
 * task
 * @returns {string} result.srcBase -  component source's base path
 * @returns {string} result.destBase -  component destination's base path
 */
function _getComponentBasePaths({ context, component, minify = false }) {
  // we always minify from the staging dir and copy from the src dir
  const srcBaseRoot = minify ? context.opts.stagingPath :
    config('paths').src.common;
  const scriptsSource = util.isTypescriptComponent({ component }) ?
    config('paths').src.typescript : config('paths').src.javascript;
  // we always minify using javascript files. for copying, it
  // depends on whether the component is ts or js based
  const baseScripts = minify ? config('paths').src.javascript : scriptsSource;
  const srcBase = path.join(
    srcBaseRoot,
    baseScripts,
    config('paths').composites
  );
  const destBase = path.join(
    context.opts.stagingPath,
    baseScripts,
    config('paths').composites
  );
  return {
    srcBase,
    destBase
  };
}

module.exports = {

  minifyComponent: function _minifyComponent(context, componentJson, componentName) {
    return new Promise((resolve, reject) => {
      try {
        const { srcBase, destBase } = _getComponentBasePaths({
          context,
          component: componentName,
          minify: true,
        });
        _minifyComponentInternal(context, componentJson, componentName, srcBase, destBase)
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
        const { srcBase, destBase } = _getComponentBasePaths({ context, component: componentName });
        _copySingleCcaInternal(context, componentJson, componentName, srcBase, destBase)
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
    const fileResult = util.getFileList(buildType, terserConfig.fileList, platform);
    return new Promise((resolve, reject) => {
      _writeUglyCodeToFile(fileResult, terserConfig.options)
        .then(() => {
          util.log('Task terser finished.');
          resolve(context);
        })
        .catch(err => reject(err));
    });
  },

  requireJs: function _requireJs(context) {
    util.log('Running requirejs task.');

    // copy the paths mapping into requireJs.paths
    const pathsObj = pathGenerator.getPathsMapping(context, true, false);
    // assign paths obj. - making accessible to the before_optimize hook.
    context.opts.requireJs.paths = pathsObj; // eslint-disable-line no-param-reassign
    context.opts.isRequireJsEs5 = false; // eslint-disable-line no-param-reassign

    return new Promise((resolve, reject) => {
      hookRunner('before_optimize', context)
        .then(requirejs.optimize(context.opts.requireJs, () => {
          util.log('Task requirejs finished *.');
          resolve(context);
        }, (err) => {
          util.log(err);
          reject(err);
        }));
    });
  },

  requireJsEs5: function _requireJsEs5(context) {
    util.log('Running requirejs tasks for ES5.');

    // copy the paths mapping into requireJs.paths
    const pathsObj = pathGenerator.getPathsMapping(context, true, true);
    // assign paths obj. - making accessible to the before_optimize hook.
    context.opts.requireJsEs5.paths = pathsObj; // eslint-disable-line no-param-reassign
    context.opts.isRequireJsEs5 = true; // eslint-disable-line no-param-reassign

    return new Promise((resolve, reject) => {
      hookRunner('before_optimize', context)
        .then(requirejs.optimize(context.opts.requireJsEs5, () => {
          util.log('Task requirejs ES5 finished *.');
          context.opts.isRequireJsEs5 = false; // eslint-disable-line no-param-reassign
          resolve(context);
        }, (err) => {
          context.opts.isRequireJsEs5 = false; // eslint-disable-line no-param-reassign
          util.log(err);
          reject(err);
        }));
    });
  },

  css: function _compileCss(context) {
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

    if (util.getInstalledCssPackage()) {
      util.log('Compiling pcss...');
      return new Promise((resolve, reject) => {
        if (context.opts.pcssCompile === false && svg !== true) {
          util.log('pcss compile skipped.');
          resolve(context);
        } else {
          // require sass here to avoid depency error if node-sass is not installed
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

  // Copy the standard es5-deciding main.js file for release builds (to choose the proper bundle)
  copyMainJs: function _copyMainJs(context) {
    util.log('Copying main.js');

    const dest = _getName(context.opts.stagingPath, 'main.js');

    return new Promise((resolve) => {
      fs.copySync(path.resolve(__dirname, 'main.js'), dest, { overwrite: true });
      util.log('Copy main.js finished');
      resolve(context);
    });
  },

  spriteSvg: function _spriteSvg(context) {
    util.log('Optimizing svg into SVG sprites.');
    return new Promise((resolve, reject) => {
      svg.spriteSvg(context, (err) => {
        if (err) reject(err);
      });
      util.log('Svg optimization task finished.');
      resolve(context);
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

  copyLocalCca: function _copyLocalCca(context) {
    return new Promise((resolve) => {
      util.log('Copy local web components');
      const promises = [];
      const componentJsonFilePaths = util.getComponentJsonFilePaths();
      componentJsonFilePaths.forEach((file) => {
        const componentJson = util.readJsonAndReturnObject(file);
        const filePathComponents = path.normalize(file).split(path.sep);
        const componentName = filePathComponents[filePathComponents.length - 2];
        // Maintain a list of all component names
        componentNames.add(componentName);
        if (!util.hasProperty(componentJson, 'version')) {
          util.log.error(`Missing property 'version' in '${componentName}' component's/pack's definition file.`);
        }
        const { srcBase, destBase } = _getComponentBasePaths({ context, component: componentName });
        promises.push(_copySingleCcaInternal(
          context,
          componentJson,
          componentName,
          srcBase,
          destBase
        ));
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

  minifyLocalCca: function _minifyLocalCca(context) {
    return new Promise((resolve) => {
      const promises = [];
      const componentJsonFilePaths = util.getComponentJsonFilePaths();
      componentJsonFilePaths.forEach((file) => {
        const componentJson = util.readJsonAndReturnObject(file);
        const filePathComponents = path.normalize(file).split(path.sep);
        const componentName = filePathComponents[filePathComponents.length - 2];
        const { srcBase, destBase } = _getComponentBasePaths({
          context,
          component: componentName,
          minify: true,
        });
        promises.push(() => _minifyComponentInternal(context, componentJson,
          componentName, srcBase, destBase));
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
  // we use Promise.all to wait for all component hooks to execute.
  // Return the original context object.
  //
  //
  // For all components, run the component hooks.
  // Since there could be several components in the build,
  // Serialize the call to each hook with a utility function
  // (runPromisesIterator)
  //
  runAllComponentHooks: function _runAllComponentHooks(context) {
    return new Promise((resolve, reject) => {
      util.log('runAllComponentHooks ');
      // util.log('runAllComponentHooks ' + JSON.stringify(context, null, '  '));
      // strip down the context parameter.
      // const newContext = util.processContextForHooks(context);
      const newContext = context;
      const javascriptSrcBase = path.join(
        config('paths').src.common,
        config('paths').src.javascript,
        config('paths').composites
      );
      const typescriptSrcBase = path.join(
        config('paths').src.common,
        config('paths').src.typescript,
        config('paths').composites
      );
      const components = [
        ...glob.sync(path.join(javascriptSrcBase, '**/component.json')),
        ...glob.sync(path.join(typescriptSrcBase, '**/component.json')),
      ];

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
                reject2(err);
              });
          }
        }); // this one
      }).then((data) => {
        resolve(data);
      }).catch((err) => {
        util.log(err);
        reject(err);
      });
    });
  },

/**
 * ## typescript
 *
 * Compiles the application's Typescript to Javascript
 *
 * @private
 * @param {Object} context - build context
 */
  typescript: function _runTypescriptCompilation(context) {
    if (util.shouldNotRunTypescriptTasks(context)) {
      return Promise.resolve(context);
    }
    util.log('Compile application typescript');
    // add application typescript options to build context
    // eslint-disable-next-line no-param-reassign
    context.opts.typescript = {
      tsconfigJson: {
        include: [
          path.join(config('paths').src.typescript, '/**/*'),
        ],
        compilerOptions: {
          paths: util.getJetPackPathMappingsForTypescript(),
          rootDir: config('paths').src.typescript,
          outDir: config('paths').src.javascript
        }
      }
    };
    const promiseFunctions = [
      // compile app typescript
      () => _runTypescriptCompilationInternal(context),
      // copy none *.ts, *.tsx and *.scss files to /js
      () => _copyTypescriptApplicationFilesToJSFolder({ context }),
      // run after_app_typescript hook
      () => hookRunner('after_app_typescript', context),
      // resolve with context
      () => {
        util.log('Compile application typescript finished');
        return Promise.resolve(context);
      }
    ];
    return util.runPromisesInSeries(promiseFunctions);
  },

  cleanTypescript: function _cleanTypescriptStagingDirectory(context) {
    if (util.shouldNotRunTypescriptTasks(context)) {
      return Promise.resolve(context);
    }
    return new Promise((resolve) => {
      util.log('Cleaning Typescript staging directory');
      fs.removeSync(path.join(context.opts.stagingPath, config('paths').src.typescript));
      util.log('Cleaning Typescript staging directory finished');
      resolve(context);
    });
  },

  compileComponentTypescript: _compileComponentTypescript
};
