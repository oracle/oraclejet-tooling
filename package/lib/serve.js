/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * # Dependencies
 */

/* Node.js native */
const fs = require('fs');
const path = require('path');

/* Oracle */
const config = require('./config');
const CONSTANTS = require('./constants');
const defaultConfig = require('./defaultconfig');
const gruntPlugins = require('./serveGruntPlugins');
const ojetBuild = require('./build');
const serveHybrid = require('./serveHybrid');
const serveWeb = require('./serveWeb');
const util = require('./util');
const valid = require('./validations');
const DEFAULT_SERVE_CONFIG = require('./defaultconfig').serve;

/**
 * # API
 * ## ojet.serve([platform], [options]);
 *
 * @public
 * @param {string} [platform='web']           - Platform, defaults to 'web'
 * @param {Object} [options]                  - Options object
 * @param {boolean} [options.build=true]      - Build before serve
 * @param {string} [options.buildType]        - Build type: debug/release
 * @param {string} [options.buildConfig]      - Path to configuration file
 * @param {string} [options.theme]            - Theme option, default is 'alta'
 * @param {string} [options.destination]      - Deploy to device/emulator/target/browser
 * @param {boolean} [options.livereload=true] - Livereload
 * @param {number} [options.livereloadPort]   - Livereload port number
 * @param {number} [options.port]             - Content server port number
 * @param {boolean} [options.sassCompile]     - Sass compile and watch
 * @param {Object} [options.watch]            - Subtask watch config object
 * @param {Object} [options.connect]          - Subtask connect config object
 * @returns {Promise}
 */


let serve = module.exports = (platform, options) => 
{
  console.log('\x1b[42m','Oracle JET Tooling','\x1b[0m');
  
  /* Initial arguments check */
  if (serve.length === 1)
  {
    if (typeof platform === 'object') 
    {
      options = platform;
      platform = undefined;
    }
  }

  /* Wrapped in promise to make ojet.serve() thenable */
  return new Promise((resolve) => 
  {
    /* Validate entries and/or set defaults */
    let validPlatform = valid.platform(platform);
    let validOptions = validateOptions(options, validPlatform);
    
    /* Update config */
    config.set('platform', validPlatform);
    config.set('serve', validOptions);

    console.log('Options:');
    console.log(validOptions);
    console.log(`BuildType: ${validOptions.buildType}`);
    console.log(`Destination: ${validOptions.destination}`);
    console.log('Theme: ' +  JSON.stringify(validOptions.theme));

    gruntPlugins.init();
    
    /* Should build before serve? */
    let build = getBuildAction();

    if (config.get('platform') == 'web')
    {
      return serveWeb(build);
    }
    else
    {
      return serveHybrid(build, resolve);
    }  
  });
};

/**
 * # Usage example
 *
 * ```
 * let ojet = require('oraclejet-toooling');
 *
 * ojet.serve('ios', {
 *    livereload: false,
 *    server-port: 12345
 * });
 * ```
 */



/**
 * ## validateOptions
 * Validate options and set the defaults
 *
 * @private
 * @param {Object} [options]                  - Options object
 * @param {boolean} [options.build=true]      - Build before serve
 * @param {string} [options.buildType]        - Build type: debug/release
 * @param {string} [options.buildConfig]      - Path to configuration file
 * @param {string} [options.destination]      - Deploy to device/emulator
 * @param {boolean} [options.livereload=true] - Livereload
 * @param {number} [options.livereloadPort]   - Livereload port number
 * @param {number} [options.port]             - Content server port number
 * @returns {Object} options                  - Valid options
 */

function validateOptions(options, validPlatform) 
{
  options = options || {};
  options.build = validateBuild(options.build);
  options.buildType = valid.buildType(options);
  options = valid.theme(options, validPlatform);
  options.buildConfig = validateBuildConfig(options.buildConfig);
  options.destination = validateDestination(options.destination);
  options = validateLivereload(options);
  options.port = validatePorts(options.port, 'server-port');
  options.livereloadPort = validatePorts(options.livereloadPort, 'livereload-port');
  options.target = validateTarget(options.target);
  return _mergeServeWatchConnectOptions(options);
}

function _mergeServeWatchConnectOptions(options) {
  let opts = options || {};
  const DEFAULT_CONFIG = DEFAULT_SERVE_CONFIG;
  opts.connect = _getConnectOptions(opts, DEFAULT_CONFIG.connect);
  opts.watch = _getWatchOptions(opts, DEFAULT_CONFIG.watch);    
  return opts;
}

function _getConnectOptions(opts, defaultOpts) {
  const connectConfig = util.mergeDefaultOptions(opts.connect, defaultOpts);
  const livereload = opts.livereload ? opts.livereloadPort : false;
  const open = opts.destination != 'server-only';
  const port = opts.port;
  return  _overrideOptionsForConfigs(connectConfig, {livereload, open, port});
}


function _getWatchOptions(opts, defaultOpts) {
  const watchConfig = util.mergeDefaultOptions(opts.watch, defaultOpts);
  const livereload = opts.livereload ? opts.livereloadPort : false;
  return _overrideOptionsForConfigs(watchConfig, {livereload});
}

function _overrideOptionsForConfigs(config, overrides) {
  Object.keys(config).forEach( configKey => {
      const subConfig = config[configKey];
      Object.keys(overrides).forEach(overrideKey => {
        if (overrides[overrideKey] !== undefined) {
          subConfig.options[overrideKey] = overrides[overrideKey];
        }
      });
  });
  return config;
}

/**
 * ## validateBuild
 *
 * @private
 * @param {Object} options - All entry options
 * @returns {boolean} options.build
 */

function validateBuild(build)
{
  if (build || build === false) {
    util.validateType('build', build, 'boolean');
  }
  else
  {
    let defaultBuild = defaultConfig.serve.options.build;
    util.validateType('build default config', defaultBuild, 'boolean');
    build = defaultBuild;
  }
  return build;
}

/**
 * ## validateBuildConfig
 *
 * @private
 * @param {Object} options - All entry options
 */

function validateBuildConfig(buildConfig)
{
  if (buildConfig)
  {
    util.validateType('buildConfig', buildConfig, 'string');

    // expand optional '~' directory
    if (buildConfig.startsWith('~'))
    {
      buildConfig = buildConfig.replace('~', process.env.HOME);
    }
    if (!path.isAbsolute(buildConfig))
    {
      // the buildConfig path is relative to the app dir, while the current 
      // working directory is 'hybrid' we need to get one level up
      buildConfig = '../' + buildConfig;
    }
  }  
  return buildConfig;
}

/**
 * ## validateDestination
 *
 * @private
 * @param {string} destination
 */

function validateDestination(destination)
{
  if (destination)
  {
    util.validateType('destination', destination, 'string');
  }
  else
  {
    /* 
     * In hybrid case, we always want '--emulator' to be used in 'cordova run' command 
     * to 'fix' Cordova inconsistent deploying behaviour. 
     * In web case, it has no impact as serveWeb does not work with destination parameter at all. 
     */
    destination = 'emulator';  
  }

  return destination;
}

/**
 * ## validateLivereload
 *
 * @private
 * @param {Object} options - All entry options
 * @returns {Object} options
 */

function validateLivereload(options)
{
  if (options.livereload || options.livereload === false) {
    util.validateType('livereload', options.livereload, 'boolean');
  }
  else
  {
    util.validateType('livereload default config', defaultConfig.serve.options.livereload, 'boolean');
  }

  options = applyLivereloadConditions(options);

  return options;
}

/**
 * ## validatePorts
 *
 * @private
 * @param {String} port - port
 * @param {String} portType - the portType, 'livereload-port', 'server-port'
 */
function validatePorts(port, portType) {
  let validPort = undefined;
  if (port !== undefined) {
    if (isNaN(parseInt(port))) {
      util.validateType(portType, port, 'number');
    } else {
      validPort = parseInt(port);
    }
  } 
  return validPort;
}

/**
 * ## validateTarget
 *
 * @private
 * @param {string} target - Browser name
 */

function validateTarget(target)
{
  if (target)
  {
    util.validateType('target', target, 'string');

    const supportedBrowsers = CONSTANTS.SUPPORTED_BROWSERS;

    if (supportedBrowsers.indexOf(target) === -1)
    {
      util.error('Browser \'' + target + '\' not supported. Please use \'--target=[<' + supportedBrowsers.toString() + '>]');
    }
  }
  
  return target;
}

/**
 * ## applyLivereloadConditions
 * Applies business logic to provided options object, sets default
 *
 * @private
 * @param {Object} options - All entry options
 * @returns {Object} options
 */

function applyLivereloadConditions(options)
{

  /* 1. Turn off livereload if release build is on */
  if (options.buildType == 'release' && !options.livereload)
  {
    util.info('Livereload can\'t be used for release mode. Turning it off.');
    options.livereload = false;
  }

  /* 2. Not release and livereload not defined, use the default value */
  if (options.buildType != 'release' && !options.livereload && options.livereload != false)
  {
    options.livereload = defaultConfig.serve.options.livereload
  }

  /* 3. Release build can't be livereloaded */
  if (options.buildType == 'release' && options.livereload === true)
  {
    util.error('Livereload can\'t be used for release build');
  }
  
  /* 4. Livereload is not supported on device */
  if (options.destination === 'device')
  {
    util.info('Livereload can\'t be used on the device. Turning it off.');
    options.livereload = false;
  }
  
  return options
}

/**
 * ## cdToCordovaDirectory
 * Calling ojet.build or just noop function to start promise chain
 *
 * @private 
 * @returns {function} - Build action
 */

function getBuildAction() 
{
  if (config.get('serve').build)
  {
    /* Build */
    return () =>
    {
      util.info('Building app...');
      const serveConfig = config.get('serve');
      const buildConfig = serveConfig.buildOptions;
      Object.assign(buildConfig, {
          buildForServe: true,
          buildType: serveConfig.buildType,
          buildConfig: serveConfig.buildConfig,
          theme: serveConfig.theme, 
          sassCompile: serveConfig.sassCompile,
          destination: serveConfig.destination
        });
      return ojetBuild(config.get('platform'), buildConfig);
    }
  }
  else
  {
    /* Do Not build - noop function to start promise chain */
    return () =>
    {
      return new Promise((res) => {
        util.info('Skipping build...');
        res();
      });
    }
  }  
}

/**
 * # Tests API
 * ## exposePrivateFunctions
 * Exposes private functions for test purposes
 * Requires process.env to be set to 'test'
 * 
 * @private  
 */

serve.exposePrivateFunctions = function() {
  if (process.env == 'test') 
  {
    serve.validatePlatform = validatePlatform;  
    serve.setDefaultPlatform = setDefaultPlatform;
    serve.validateOptions = validateOptions;
  } 
  else 
  {
    util.error('Private functions not exposed as environment is not set to \'test\'. Use it for testing purposes only.');
  }
};
