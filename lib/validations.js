/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const util = require('./util');
const DEFAULT_CONFIG = require('./defaultconfig');
const CONSTANTS = require('./constants');
const fs = require('fs-extra');
const path = require('path');
const _union = require('lodash.union');
const _isFunction = require('lodash.isfunction');
const config = require('./config');

module.exports = {
  theme: function _validateTheme(options, platform) {
    return _setValidThemeOption(options, platform);
  },

  themes: function _validateThemes(options, platform) {
    return _setValidThemesOption(options, platform);
  },

  platform: function _validatePlatform(platform) {
    const validPlatform = platform || _getDefaultPlatform();
    if (fs.existsSync(config('paths').src.web) || fs.existsSync(config('paths').src.hybrid)) {
      if (CONSTANTS.SUPPORTED_PLATFORMS.indexOf(validPlatform) > -1) {
        return validPlatform;
      }
      util.error(`Platform '${platform}' not supported`);
    } else if (fs.existsSync(config('paths').staging.hybrid)) {
      if (CONSTANTS.SUPPORTED_HYBRID_PLATFORMS.indexOf(validPlatform) > -1) {
        return validPlatform;
      }
      util.error(`Platform '${platform}' not supported for hybrid app`);
    } else {
      if (CONSTANTS.SUPPORTED_WEB_PLATFORMS.indexOf(validPlatform) > -1) {
        return validPlatform;
      }
      util.error(`Platform '${platform}' not supported for web app`);
    }
  },

  buildType: function _validateBuildType(options) {
    const buildType = options.buildType;
    if (buildType && buildType !== 'undefined') {
      if (buildType === 'release' || buildType === 'dev') {
        return buildType;
      } else if (buildType === 'debug') {
        return 'dev';
      } else {
        util.error(`Option buildType ${buildType} is invalid!`);
      }
    } else {
      return 'dev';
    }
  },

  buildOptions: function _validateOption(options, platform, buildForLiveReload) {
    let opts = options || {};
    const defaultConfig = _getDefaultBuildConfig(platform);
    opts = util.mergeDefaultOptions(opts, defaultConfig);
    opts = (buildForLiveReload || opts.buildForServe) ? opts : _setValidThemeOption(opts, platform);
    opts = (buildForLiveReload || opts.buildForServe) ? opts : _setValidDestination(opts);
    return opts;
  },

  getDefaultServeConfig: () => _getDefaultServeConfig(),

  getDefaultPlatformsConfig: () => _getDefaultPlatformsConfig(),

  getThemeObject: (themeStr, platform) => _getValidThemeObject(themeStr, platform)

};

function _getDefaultBuildConfig(platform) {
  const result = (platform === 'web') ? DEFAULT_CONFIG.build.web : DEFAULT_CONFIG.build.hybrid;
  return _convertConfigFunctionToObj(result);
}

function _getDefaultServeConfig() {
  return _convertConfigFunctionToObj(DEFAULT_CONFIG.serve);
}

function _getDefaultPlatformsConfig() {
  return DEFAULT_CONFIG.platforms(config('paths'));
}

function _convertConfigFunctionToObj(input) {
  const result = input;
  Object.keys(result).forEach((key) => {
    const value = result[key];
    if (_isFunction(value)) {
      result[key] = value(config('paths'));
    }
  });
  return result;
}

function _setValidDestination(options) {
  if (options.destination) {
    if (CONSTANTS.SUPPORTED_BUILD_DESTINATIONS.indexOf(options.destination) === -1) {
      util.error(`Destination ${options.destination} not supported. `);
    }
  } else {
    options.destination = CONSTANTS.DEFAULT_BUILD_DESTINATION;
  }
  return options;
}

function _setDefaultTheme(options, platform) {
  let defaultTheme = options.theme;
  if (!options.theme && options.themes) {
    // default to alta theme if options.themes equlats to 'all' or 'all:all';
    let themeName = _getThemeNameFromStr(options.themes[0]);
    let themePlatform = _getThemePlatformFromStr(options.themes[0], platform);
    themeName = (themeName === CONSTANTS.RESERVED_Key_ALL_THEME) ? CONSTANTS.DEFAULT_THEME : themeName;
    themePlatform = (themePlatform === CONSTANTS.RESERVED_Key_ALL_THEME) ? platform : themePlatform;
    defaultTheme = `${themeName}:${themePlatform}`;
  }
  return defaultTheme;
}

function _getThemeNameFromStr(themeStr) {
  return (themeStr.indexOf(':') === -1) ? themeStr : themeStr.split(':')[0];
}
function _getThemePlatformFromStr(themeStr, defaultPlatform) {
  return (themeStr.indexOf(':') === -1) ? defaultPlatform : themeStr.split(':')[1];
}

function _getValidThemeObject(themeStr, platform) {
  const themeObj = {};
  if (themeStr) {
    themeStr = themeStr.replace('browser', 'web');
    platform = platform.replace('browser', 'web');

    if (themeStr.indexOf(':') === -1) {
      themeObj.name = themeStr;
      themeObj.platform = platform;
      themeObj.compile = _setSassCompile(themeObj, platform);
    } else {
      const args = themeStr.split(':');
      themeObj.name = args[0];
      themeObj.platform = args[1];
      themeObj.compile = _setSassCompile(themeObj, platform);
    }
  } else {
    themeObj.name = CONSTANTS.DEFAULT_THEME;
    themeObj.platform = platform;
    themeObj.compile = _setSassCompile(themeObj, platform);
  }
  themeObj.version = _getThemeVersion(themeObj.name);
  return themeObj;
}

function _setValidThemeOption(options, platform) {
  const themeStr = _setDefaultTheme(options, platform);
  options.theme = _getValidThemeObject(themeStr, platform);
  options.themes = _processThemesOption(options, platform);
  /*console.log(`Theme Name:Platform - ${options.theme.name}:${options.theme.platform}
                  \nTheme Version - ${options.theme.version}`);*/
  return options;
}

function _getThemesArray(themesOption, platform) {
  if (themesOption[0] === CONSTANTS.RESERVED_Key_ALL_THEME) {
    return util.getAllThemes();
  } else if (themesOption[0] === `${CONSTANTS.RESERVED_Key_ALL_THEME}:${CONSTANTS.RESERVED_Key_ALL_THEME}`) {
    // get all possible combinations when --themes =all:all
    let themesArray = [];
    const allThemes = util.getAllThemes();
    allThemes.forEach((singleTheme) => {
      const tempArray = _getThemesArrayForAllPlatforms(singleTheme);
      themesArray = themesArray.concat(tempArray);
    });
    const altaThemes = CONSTANTS.SUPPORTED_PLATFORMS.reduce((previousValue, currentValue) => (currentValue === platform) && _checkThemeFileExist(CONSTANTS.DEFAULT_THEME, currentValue) ?
             previousValue : previousValue.concat([`${CONSTANTS.DEFAULT_THEME}:${currentValue}`]), []);
    themesArray = themesArray.concat(altaThemes);
    return themesArray;
  } else {
    let result = [];
    themesOption.forEach((themeStr) => {
      const themeName = _getThemeNameFromStr(themeStr);
      const themePlatform = _getThemePlatformFromStr(themeStr, platform);
    // Handle --themes=themeName:all situation
      if (themePlatform === CONSTANTS.RESERVED_Key_ALL_THEME) {
        const tempArray = _getThemesArrayForAllPlatforms(themeName);
        result = result.concat(tempArray);
      } else if (themeName === CONSTANTS.RESERVED_Key_ALL_THEME) {
        const tempArray = _getThemesArrayForAllThemes(themePlatform);
        result = result.concat(tempArray);
      } else {
        result.push(`${themeName}:${themePlatform}`);
      }
    });
    return result;
  }
}

function _getThemesArrayForAllPlatforms(themeName) {
  const allPlatforms = CONSTANTS.SUPPORTED_PLATFORMS;
  const tempArray = allPlatforms.reduce((previousValue, currentValue) => _checkThemeFileExist(themeName, currentValue) ?
      previousValue.concat([`${themeName}:${currentValue}`]) : previousValue, []);
  return tempArray;
}

function _getThemesArrayForAllThemes(themePlatform) {
  const allThemes = util.getAllThemes();
  const tempArray = allThemes.reduce((previousValue, currentValue) => _checkThemeFileExist(currentValue, themePlatform) ?
      previousValue.concat([`${currentValue}:${themePlatform}`]) : previousValue, []);
  return tempArray;
}

function _checkThemeFileExist(themeName, themePlatform) {
  const themesDir = util.destPath(path.join(config('paths').staging.themes, themeName, themePlatform));
  const themesSrcDir = util.destPath(path.join(config('paths').src.common, config('paths').src.themes, themeName, themePlatform));
  return _checkPathExist(themesDir) || _checkPathExist(themesSrcDir);
}

function _processThemesOption(options, platform) {
  if (options.themes) {
    let themesArray = _getThemesArray(options.themes, platform);
    const defaultTheme = `${options.theme.name}:${options.theme.platform}`;
    // Remove theme that is duplicate with default theme
    themesArray = themesArray.filter(element => element !== defaultTheme);
    themesArray = themesArray.map(singleTheme => _getValidThemeObject(singleTheme, platform));
    return themesArray;
  } else {
    return undefined;
  }
}

function _getThemeVersion(themeName) {
  if (themeName === CONSTANTS.DEFAULT_THEME) {
    return util.getJETVersion();
  } else {
    const themeJsonPath = util.destPath(path.join(config('paths').src.common, config('paths').src.themes, themeName, 'theme.json'));
    let themeJson;
    if (_checkPathExist(themeJsonPath)) {
      themeJson = fs.readJsonSync(themeJsonPath);
      return themeJson.hasOwnProperty('version') ? themeJson.version : '';
    } else {
      return '';
    }
  }
}

function _getDefaultPlatform() {
  return (fs.existsSync(config('paths').staging.hybrid)) ? DEFAULT_CONFIG.serve.defaultHybridPlatform : 'web';
}

function _setSassCompile(theme, options) {
  // if alta, skip checking src/themes
  if (theme.name === CONSTANTS.DEFAULT_THEME) {
    return false;
  } else {
    const srcExist = _checkPathExist(path.join(config('paths').src.common, config('paths').src.themes, theme.name));
    const themeExist = _checkPathExist(path.join(config('paths').staging.themes, theme.name));
    if (srcExist) {
      // src/themes/theme exists, compile sass
      _validateSassInstall();
      return true;
    } else if (themeExist) {
      // src/theme missing but themes presence, skip sass compile
      return false;
    } else {
      util.error(`Theme '${theme.name}:${theme.platform}' does not exist in themes or src/themes`);
    }
  }
}

function _checkPathExist(themePath) {
  try {
    fs.statSync(themePath);
    return true;
  } catch (err) {
    return false;
  }
}

function _validateSassInstall() {
  // since node sass is installed separately, regardless of npm 2 or npm3, it will be installed on top level of node_modules
  const sassPackageJson = util.destPath(path.join('node_modules', 'node-sass', 'package.json'));

  try {
    fs.statSync(sassPackageJson);
  } catch (err) {
    util.error('Please run yo oraclejet:add-sass to configure your projects for SASS processing.');
  }
}
