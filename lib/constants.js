/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

module.exports = {
  WEB_DIRECTORY: 'web',
  CORDOVA_DIRECTORY: 'hybrid',
  APP_SRC_DIRECTORY: 'src',
  APP_SRC_HYBRID_DIRECTORY: 'src-hybrid',
  APP_SRC_WEB_DIRECTORY: 'src-web',
  APP_THEMES_DIRECTORY: 'themes',
  DEFAULT_THEME: 'alta',
  DEFAULT_BROWSER: 'chrome',
  COMMON_THEME_DIRECTORY: 'common',
  SUPPORTED_PLATFORMS: ['android', 'ios', 'web', 'windows'],
  SUPPORTED_HYBRID_PLATFORMS: ['android', 'ios', 'windows'],
  SUPPORTED_BROWSERS: ['chrome', 'firefox', 'edge', 'ie', 'opera', 'safari'],
  SUPPORTED_WEB_PLATFORMS: ['web'],

  CORDOVA_CONFIG_XML: 'config.xml',

  APP_TYPE:
  {
    HYBRID: 'hybrid',
    WEB: 'web'
  },

  DEBUG_FLAG: '--debug',
  RELEASE_FLAG: '--release',
  SUPPORTED_BUILD_DESTINATIONS: ['emulator', 'device'],
  DEFAULT_BUILD_DESTINATION: 'emulator',
  RESERVED_Key_ALL_THEME: 'all',
  ORACLE_JET_CONFIG_JSON: 'oraclejetconfig.json'
};
