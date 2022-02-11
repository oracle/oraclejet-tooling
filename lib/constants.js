/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const ORACLET_ROOT_PATH = 'node_modules/@oracle';
const ORACLEJET_PATH = `${ORACLET_ROOT_PATH}/oraclejet`;

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
  DEFAULT_STABLE_THEME: 'stable',
  DEFAULT_BROWSER: 'chrome',
  DEFAULT_INSTALLER: 'npm',
  SASS_VER: '5.0.0',
  COMMON_THEME_DIRECTORY: 'common',
  JET_COMPOSITE_DIRECTORY: 'jet-composites',
  JET_COMPONENTS_DIRECTORY: 'jet_components',
  COMPONENT_TEMP_ARCHIVE: 'component.zip',
  PUBLISH_TEMP_DIRECTORY: 'temp-publish',
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
  PATH_TO_ORACLEJET: `${ORACLEJET_PATH}/dist`,
  PATH_MAPPING_JSON: 'path_mapping.json',
  PATH_MAPPING_VERSION_TOKEN: '#{version}',
  PATH_TO_HOOKS_CONFIG: 'scripts/hooks/hooks.json',
  TSCONFIG: 'tsconfig.json',
  OJET_CONFIG: 'ojet.config.js',
  TOOLING_PATH: `${ORACLET_ROOT_PATH}/oraclejet-tooling`,
  ORACLEJET_TOOLING_NAME: '@oracle/oraclejet-tooling',
  ORACLEJET_PATH,
  ORACLEJET_NAME: '@oracle/oraclejet',
  PATH_TO_PWA_TEMPLATES: 'lib/templates/serviceWorkers',
  PATH_TO_TSCONFIG_TEMPLATE: 'lib/templates/typescript/tsconfig.json',
  PATH_TO_OJET_CONFIG_TEMPLATE: 'lib/templates/webpack/ojet.config.js',

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
    ADDPWA: 'addpwa',
    PACKAGE: 'package',
    ADDWEBPACK: 'addwebpack'
  },
  API_SCOPES: {
    EXCHANGE: 'exchange',
    COMPONENT: 'component',
    PACK: 'pack'
  },
  EXCHANGE_URL_PARAM: 'exchange-url',
  EXCHANGE_LOCAL_COMPONENTS_SUPPORT: 'localComponentsSupport',
  OJET_LOCAL_STORAGE_DIR: '.ojet',
  EXCHANGE_TOKEN_STORE_FILE: 'exchange-access.json',
  EXCHANGE_URL_FILE: 'exchange-url.json',
  EXCHANGE_GLOBAL_URL_KEY: 'global',
  EXCHANGE_HEADER_NEXT_TOKEN: 'x-compcatalog-auth-next-token',
  EXCHANGE_HEADER_NEXT_TOKEN_EXPIRATION: 'x-compcatalog-auth-next-token-expiration',
  EXCHANGE_AUTH_ACCESS_TOKEN: 'access_token',
  EXCHANGE_AUTH_TOKEN_TYPE: 'token_type',
  EXCHANGE_AUTH_EXPIRATION: 'expiration',
  EXCHANGE_AUTH_EXPIRATION_CLIENT: 'expiration_client',
  EXCHANGE_AUTH_EXPIRES_IN: 'expires_in',
  COMPONENTS_DT: 'components_dt',
  PATH_TO_CUSTOM_TSC: 'dist/custom-tsc',
  PATH_TO_CUSTOM_TSC_TEMPLATES: 'dist/custom-tsc/templates',
  TYPESCRIPT_VERSION: '4.5.4',
  JEST_TEST_FILE_GLOBS: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  OMIT_COMPONENT_VERSION_FLAG: 'omit-component-version',
  WEBPACK_TOOLS_PATH: 'dist/webpack-tools',
  VDOM_ARCHITECTURE: 'vdom',
  DEFAULT_BUNDLE_NAME: 'bundle.js',
  PATH_MAPPING_PREFIX_TOKEN: '#',
  WEBPACK_VERSION: '5.60.0',
  COMPONENT_JSON_DEPENDENCIES_TOKEN: '@dependencies@',
  PATH_TO_OJET_CONFIG: './ojet.config.js'
};
