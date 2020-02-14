/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

module.exports = {
  WEB_DIRECTORY: 'web',
  CORDOVA_DIRECTORY: 'hybrid',
  APP_SRC_DIRECTORY: 'src',
  APP_SRC_HYBRID_DIRECTORY: 'src-hybrid',
  APP_SRC_WEB_DIRECTORY: 'src-web',
  PACKAGE_OUTPUT_DIRECTORY: 'dist',
  APP_THEMES_DIRECTORY: 'themes',
  APP_STAGED_THEMES_DIRECTORY: 'staged-themes',
  DEFAULT_THEME: 'alta',
  DEFAULT_PCSS_THEME: 'redwood',
  DEFAULT_BROWSER: 'chrome',
  SASS_VER: '4.13.0',
  COMMON_THEME_DIRECTORY: 'common',
  JET_COMPOSITE_DIRECTORY: 'jet-composites',
  JET_COMPONENTS_DIRECTORY: 'jet_components',
  COMPONENT_TEMP_ARCHIVE: 'component.zip',
  NODE_MODULES_DIRECTORY: 'node_modules',
  JET_COMPONENT_JSON: 'component.json',
  SUPPORTED_PLATFORMS: ['android', 'ios', 'web', 'windows'],
  SUPPORTED_THEME_PLATFORMS: ['android', 'ios', 'web', 'windows', 'common'],
  SUPPORTED_HYBRID_PLATFORMS: ['android', 'ios', 'windows'],
  SUPPORTED_BROWSERS: ['chrome', 'firefox', 'edge', 'ie', 'safari'],
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
  SUPPORTED_SERVE_HYBRID_DESTINATIONS: ['browser', 'emulator', 'device', 'server-only'],
  SUPPORTED_SERVE_WEB_DESTINATIONS: ['server-only'],
  DEFAULT_BUILD_DESTINATION: 'emulator',
  RESERVED_Key_ALL_THEME: 'all',
  ORACLE_JET_CONFIG_JSON: 'oraclejetconfig.json',
  PATH_TO_ORACLEJET: 'node_modules/@oracle/oraclejet/dist',
  PATH_MAPPING_JSON: 'path_mapping.json',
  PATH_MAPPING_VERSION_TOKEN: '#{version}',
  PATH_TO_HOOKS_CONFIG: 'scripts/hooks/hooks.json',
  TSCONFIG: 'tsconfig.json',
  PATH_TO_TSCONFIG_TEMPLATE: 'node_modules/@oracle/oraclejet-tooling/lib/templates/typescript/tsconfig.json',
  PATH_TO_REQUIREJS_PLUGIN_DEFINITIONS: 'node_modules/@oracle/oraclejet/dist/types/requirejs-plugins.d.ts',
  MIN_TYPESCRIPT_VERSION: '3.5.0',
  PATH_TO_TYPESCRIPT_DEFINITIONS_TEMPLATE: 'node_modules/@oracle/oraclejet-tooling/lib/templates/typescript/index.d.ts',

  API_TASKS: {
    ADD: 'add',
    ADDSASS: 'addsass',
    CONFIGURE: 'configure',
    CREATE: 'create',
    LIST: 'list',
    ADDPCSS: 'addpcss',
    PUBLISH: 'publish',
    REMOVE: 'remove',
    SEARCH: 'search',
    ADDTYPESCRIPT: 'addtypescript',
    PACKAGE: 'package'
  },
  API_SCOPES: {
    EXCHANGE: 'exchange',
    COMPONENT: 'component',
    PACK: 'pack'
  },
  EXCHANGE_URL_PARAM: 'exchange-url',
  EXCHANGE_TOKEN_STORE_DIR: '.ojet',
  EXCHANGE_TOKEN_STORE_FILE: 'exchange-access.json',
  EXCHANGE_HEADER_NEXT_TOKEN: 'x-compcatalog-auth-next-token',
  EXCHANGE_HEADER_NEXT_TOKEN_EXPIRATION: 'x-compcatalog-auth-next-token-expiration',
  EXCHANGE_AUTH_ACCESS_TOKEN: 'access_token',
  EXCHANGE_AUTH_TOKEN_TYPE: 'token_type',
  EXCHANGE_AUTH_EXPIRATION: 'expiration',
  EXCHANGE_AUTH_EXPIRATION_CLIENT: 'expiration_client',
  EXCHANGE_AUTH_EXPIRES_IN: 'expires_in'
};
