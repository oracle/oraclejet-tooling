/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const util = require('./util');
const DEFAULT_BUILD_CONFIG = require('./defaultconfig').build;
const DEFAULT_SERVE_CONFIG = require('./defaultconfig').serve;
const CONSTANTS = require('./constants');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  theme: function _validateTheme(options, platform) {
    return _setValidThemeOption(options, platform);
  }, 

  platform: function _validatePlatform(platform) {
    const validPlatform = platform || _getDefaultPlatform();
    if ( fs.existsSync('src-web') || fs.existsSync('src-hybrid')) {
       if (CONSTANTS.SUPPORTED_PLATFORMS.indexOf(validPlatform) > -1) {
        return validPlatform;
      }
      util.error(`Platform '${platform}' not supported`);
    } else if (fs.existsSync(CONSTANTS.CORDOVA_DIRECTORY)) {
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
      if (buildType === 'release' || buildType === 'dev' ) {
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
    const DEFAULT_CONFIG = (platform === 'web') ? DEFAULT_BUILD_CONFIG.web : DEFAULT_BUILD_CONFIG.hybrid;
    opts = util.mergeDefaultOptions(opts, DEFAULT_CONFIG);
    opts = (buildForLiveReload || opts.buildForServe) ? opts: _setValidThemeOption(opts, platform);
    opts = (buildForLiveReload || opts.buildForServe) ? opts: _setValidDestination(opts);
    return opts;
  }
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

function _setValidThemeOption(options, platform) {
    let themeStr = options.theme;
    let themeObj = {};
    if (themeStr) {
      themeStr = themeStr.replace('browser', 'web');
      platform = platform.replace('browser', 'web');

      if (themeStr.indexOf(':') === -1) {
        themeObj.name = themeStr;
        themeObj.platform = platform;
        _setSassCompile(themeObj, options);
      } else {
        let args = themeStr.split(':');      
        themeObj.name = args[0];
        themeObj.platform = args[1];
        _setSassCompile(themeObj, options);
      }
    } else {
      themeObj.name = CONSTANTS.DEFAULT_THEME;
      themeObj.platform = platform;
      options.sassCompile = false;
    }  
    themeObj.version = _getThemeVersion(themeObj.name);
    options.theme = themeObj;
    console.log(`Theme Name:Platform - ${themeObj.name}:${themeObj.platform} \nTheme Version - ${themeObj.version}`);
    return options;
} 

function _getThemeVersion(themeName) {
  if (themeName === CONSTANTS.DEFAULT_THEME) {
    return util.getJETVersion();
  } else {
    const themeJsonPath = util.destPath(path.join(CONSTANTS.APP_SRC_DIRECTORY, 'themes', themeName, 'theme.json'));
    let themeJson;
    if (_checkThemeFileExist(themeJsonPath)) {
      themeJson = fs.readJsonSync(themeJsonPath);
      return themeJson.hasOwnProperty('version') ? themeJson.version : '';
    } else {
      return '';
    }    
  }
}

function _getDefaultPlatform() {  
  return (fs.existsSync(CONSTANTS.CORDOVA_DIRECTORY)) ? DEFAULT_SERVE_CONFIG.defaultHybridPlatform : 'web';
}

function _setSassCompile(theme, options) {
  //if alta, skip checking src/themes
  if (options.sassCompile === undefined) {
    if (theme.name === CONSTANTS.DEFAULT_THEME) {
      options.sassCompile = false;     
    } else {
      let srcExist = _checkThemeFileExist(path.join(CONSTANTS.APP_SRC_DIRECTORY,'themes', theme.name));
      let themeExist = _checkThemeFileExist(path.join(CONSTANTS.APP_THEMES_DIRECTORY, theme.name));
      if (srcExist) {
        //src/themes/theme exists, compile sass
        options.sassCompile = true;
        _validateSassInstall();
      } else if (themeExist) {
        //src/theme missing but themes presence, skip sass compile
        options.sassCompile = false;
      } else {
        util.error(`Theme '${theme.name}:${theme.platform}' does not exist in themes or src/themes`);  
      }
    } 
  }
}

function _checkThemeFileExist(themePath) {
  try {
    fs.statSync(themePath);
    return true;
  } catch (err) {
    return false;
  } 
}

function _validateSassInstall() {
  //since node sass is installed separately, regardless of npm 2 or npm3, it will be installed on top level of node_modules
  let sassPackageJson = util.destPath(path.join('node_modules', 'node-sass', 'package.json'));

  try {
    fs.statSync(sassPackageJson);
  } catch(err) {
    util.error(`Please run yo oraclejet:add-sass to configure your projects for SASS processing.`);
  };
}